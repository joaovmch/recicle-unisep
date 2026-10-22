import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { Circle, LatLngBoundsExpression, Map as MapaLeaflet, Marker } from 'leaflet';

export interface MarcadorMapa {
  id: string;
  latitude: number;
  longitude: number;
  titulo: string;
  /** Pino diferente para o ponto "dono" do mapa — ex.: o galpão no centro da área de cobertura. */
  destaque?: boolean;
  /** Pino apagado, para o que está no mapa mas desligado — ex.: bairro fora do atendimento. */
  atenuado?: boolean;
}

/** Centro do mapa enquanto não há nenhum ponto para mostrar (Dois Vizinhos, PR). */
const CENTRO_PADRAO: [number, number] = [-25.7389, -53.0556];

/** Perto demais o OSM fica sem detalhe; isso evita o zoom "colado no chão" com um ponto só. */
const ZOOM_MAXIMO_AO_ENQUADRAR = 16;

/**
 * Mapa Leaflet sobre tiles do OpenStreetMap.
 *
 * O Leaflet mexe no DOM por fora do Angular e só existe no navegador, então a biblioteca
 * entra por import dinâmico dentro de `afterNextRender` — no SSR o componente renderiza
 * só o contêiner vazio, e `ngSkipHydration` evita que a hidratação reclame do que o
 * Leaflet inseriu ali depois.
 *
 * Estilo sem encapsulamento de propósito: os pinos são `divIcon`, criados fora do
 * template, e CSS com escopo de componente não alcançaria esses elementos.
 */
@Component({
  selector: 'app-mapa',
  imports: [],
  host: { ngSkipHydration: '' },
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './mapa.css',
  template: `
    <div class="rc-mapa" #canvas></div>

    @if (!pronto()) {
      <p class="rc-mapa-aviso">Carregando mapa...</p>
    } @else if (marcadores().length === 0 && !centro()) {
      <p class="rc-mapa-aviso">Nenhum ponto com endereço localizado para mostrar aqui.</p>
    }

    @if (pronto() && !zoomPelaRoda()) {
      <p class="rc-mapa-dica">Clique no mapa para dar zoom com a roda do mouse</p>
    }

    @if (tilesComErro() > 0) {
      <p class="rc-mapa-dica erro">
        {{ tilesComErro() }} {{ tilesComErro() === 1 ? 'parte do mapa não carregou' : 'partes do mapa não carregaram' }}
        — recarregue a página
      </p>
    }
  `,
})
export class Mapa {
  readonly marcadores = input<MarcadorMapa[]>([]);
  readonly selecionadoId = input<string | null>(null);
  /** Centro fixo do mapa. Sem ele, o enquadramento sai dos próprios marcadores. */
  readonly centro = input<[number, number] | null>(null);
  /** Círculo de alcance desenhado em volta do centro (área de cobertura). */
  readonly raioKm = input<number | null>(null);
  readonly zoom = input(13);

  readonly selecionado = output<string>();

  readonly pronto = signal(false);
  /** A roda do mouse só passa a dar zoom depois de um clique — senão rolar a página pararia em cima do mapa. */
  readonly zoomPelaRoda = signal(false);
  /** Tile que não carrega deixa um retângulo cinza no lugar; contar transforma isso em aviso visível. */
  readonly tilesComErro = signal(0);

  private readonly canvas = viewChild.required<ElementRef<HTMLDivElement>>('canvas');

  private leaflet: typeof import('leaflet') | null = null;
  private mapa: MapaLeaflet | null = null;
  private circulo: Circle | null = null;
  private observador: ResizeObserver | null = null;
  private readonly pinos = new Map<string, Marker>();

  /** Só reenquadra quando o conjunto de pontos muda — senão o mapa pularia a cada clique. */
  private enquadramentoAplicado = '';

  constructor() {
    afterNextRender(() => void this.iniciar());

    // Tudo o que vem de fora (pontos, seleção, raio) é sincronizado aqui; `pronto` faz o
    // efeito rodar de novo assim que o mapa existe, cobrindo os dados que chegaram antes.
    effect(() => {
      this.pronto();
      this.sincronizarPinos(this.marcadores());
      this.sincronizarSelecao(this.selecionadoId());
      this.sincronizarCirculo(this.centro(), this.raioKm());
      this.sincronizarCentro(this.centro(), this.raioKm());
    });

    inject(DestroyRef).onDestroy(() => {
      this.observador?.disconnect();
      this.mapa?.remove();
      this.mapa = null;
      this.pinos.clear();
    });
  }

  private async iniciar(): Promise<void> {
    // `leaflet` é CommonJS, não ESM: no bundle de produção os exports chegam dentro de
    // `default`, e sem este desembrulho `leaflet.map(...)` é undefined — o mapa falhava
    // com "e.map is not a function" e nunca chegava a desenhar nada.
    const modulo = await import('leaflet');
    const leaflet = typeof modulo.map === 'function' ? modulo : modulo.default;
    this.leaflet = leaflet;

    this.mapa = leaflet.map(this.canvas().nativeElement, {
      center: this.centro() ?? CENTRO_PADRAO,
      zoom: this.zoom(),
      zoomControl: true,
      // Começa desligado para a roda do mouse não sequestrar a rolagem de uma página
      // longa; o primeiro clique no mapa liga, e sair do mapa desliga de novo.
      scrollWheelZoom: false,
    });

    this.mapa.on('click focus', () => {
      this.mapa?.scrollWheelZoom.enable();
      this.zoomPelaRoda.set(true);
    });
    this.mapa.on('mouseout blur', () => {
      this.mapa?.scrollWheelZoom.disable();
      this.zoomPelaRoda.set(false);
    });

    const camada = leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      // Sem isto o OpenStreetMap devolve 403 ("Access blocked") no lugar de cada tile:
      // o `helmet` manda `Referrer-Policy: no-referrer` no app inteiro, e a política de uso
      // deles exige conseguir identificar quem está pedindo. O atributo no <img> da tile
      // vale mais que o cabeçalho da página, então só as tiles passam a mandar a origem —
      // o resto do site continua sem enviar Referer nenhum.
      referrerPolicy: 'strict-origin-when-cross-origin',
    });

    // Tile que falha some sem erro nenhum no console e deixa um buraco cinza no mapa.
    camada.on('tileerror', () => this.tilesComErro.update(total => total + 1));
    camada.on('tileload', () => this.tilesComErro.set(0));
    camada.addTo(this.mapa);

    // O mapa costuma nascer dentro de um grid que ainda vai se acomodar; sem isto o
    // Leaflet fica com o tamanho errado e só pede as tiles daquele pedaço, deixando o
    // resto do quadro cinza.
    this.observador = new ResizeObserver(() => this.mapa?.invalidateSize());
    this.observador.observe(this.canvas().nativeElement);

    // Rede de segurança para o caso de o layout se acomodar sem disparar o observer
    // (fonte que carrega depois, barra de rolagem que aparece, aba que estava oculta).
    requestAnimationFrame(() => this.mapa?.invalidateSize());

    this.pronto.set(true);
  }

  private sincronizarPinos(marcadores: MarcadorMapa[]): void {
    const leaflet = this.leaflet;
    const mapa = this.mapa;
    if (!leaflet || !mapa) return;

    const idsAtuais = new Set(marcadores.map(m => m.id));
    for (const [id, pino] of this.pinos) {
      if (!idsAtuais.has(id)) {
        pino.remove();
        this.pinos.delete(id);
      }
    }

    for (const dado of marcadores) {
      const existente = this.pinos.get(dado.id);
      if (existente) {
        existente.setLatLng([dado.latitude, dado.longitude]);
        continue;
      }

      const pino = leaflet
        .marker([dado.latitude, dado.longitude], {
          icon: this.icone(dado, false),
          title: dado.titulo,
          alt: dado.titulo,
          riseOnHover: true,
        })
        .addTo(mapa)
        .on('click keypress', () => this.selecionado.emit(dado.id));

      this.pinos.set(dado.id, pino);
    }

    this.enquadrar(marcadores);
  }

  private sincronizarSelecao(selecionadoId: string | null): void {
    const mapa = this.mapa;
    if (!mapa) return;

    for (const dado of this.marcadores()) {
      const pino = this.pinos.get(dado.id);
      pino?.setIcon(this.icone(dado, dado.id === selecionadoId));
    }

    if (!selecionadoId) return;
    const escolhido = this.marcadores().find(m => m.id === selecionadoId);
    // `panInside` em vez de `panTo`: só mexe no mapa se o ponto estiver fora da vista,
    // então clicar na lista não arrasta o mapa a cada item.
    if (escolhido) mapa.panInside([escolhido.latitude, escolhido.longitude], { padding: [60, 60] });
  }

  private sincronizarCirculo(centro: [number, number] | null, raioKm: number | null): void {
    const leaflet = this.leaflet;
    const mapa = this.mapa;
    if (!leaflet || !mapa) return;

    if (!centro || !raioKm || raioKm <= 0) {
      this.circulo?.remove();
      this.circulo = null;
      return;
    }

    const raioMetros = raioKm * 1000;
    if (this.circulo) {
      this.circulo.setLatLng(centro).setRadius(raioMetros);
    } else {
      this.circulo = leaflet
        .circle(centro, {
          radius: raioMetros,
          color: '#0eae59',
          weight: 1.5,
          fillColor: '#10a957',
          fillOpacity: 0.13,
        })
        .addTo(mapa);
    }

    // O raio manda no enquadramento: é ele que define a área que a pessoa precisa ver.
    const assinatura = `circulo:${centro.join(',')}:${raioKm}`;
    if (this.enquadramentoAplicado === assinatura) return;
    this.enquadramentoAplicado = assinatura;
    mapa.fitBounds(this.circulo.getBounds(), { padding: [24, 24] });
  }

  /**
   * Centro sem raio: o mapa nasce no centro padrão e só depois a tela descobre a
   * coordenada certa (geocodificação); sem isto ele ficaria parado no lugar errado.
   * Com raio, quem reposiciona é o círculo.
   */
  private sincronizarCentro(centro: [number, number] | null, raioKm: number | null): void {
    const mapa = this.mapa;
    if (!mapa || !centro || (raioKm && raioKm > 0)) return;

    const assinatura = `centro:${centro.join(',')}`;
    if (this.enquadramentoAplicado === assinatura) return;
    this.enquadramentoAplicado = assinatura;
    mapa.setView(centro, this.zoom());
  }

  private enquadrar(marcadores: MarcadorMapa[]): void {
    const mapa = this.mapa;
    if (!mapa || marcadores.length === 0) return;
    // Com centro fixo o enquadramento é dele (e do raio, quando há) — não dos pinos.
    if (this.centro()) return;

    const assinatura = marcadores
      .map(m => `${m.id}:${m.latitude},${m.longitude}`)
      .sort()
      .join('|');
    if (assinatura === this.enquadramentoAplicado) return;
    this.enquadramentoAplicado = assinatura;

    const limites: LatLngBoundsExpression = marcadores.map(m => [m.latitude, m.longitude] as [number, number]);
    mapa.fitBounds(limites, { padding: [40, 40], maxZoom: ZOOM_MAXIMO_AO_ENQUADRAR });
  }

  private icone(dado: MarcadorMapa, ativo: boolean) {
    const tamanho = ativo ? 26 : 18;
    const classes = ['rc-mapa-pino'];
    if (ativo) classes.push('ativo');
    if (dado.destaque) classes.push('destaque');
    if (dado.atenuado) classes.push('atenuado');

    // A aparência do pino fica num <i> interno de propósito: o Leaflet posiciona o
    // elemento raiz do ícone com `transform: translate3d(...)`, então qualquer transform
    // nosso aí (o `rotate` do losango do galpão, por exemplo) apagaria a posição e jogaria
    // o pino para o canto do mapa.
    return this.leaflet!.divIcon({
      className: classes.join(' '),
      iconSize: [tamanho, tamanho],
      iconAnchor: [tamanho / 2, tamanho / 2],
      html: '<i></i>',
    });
  }
}
