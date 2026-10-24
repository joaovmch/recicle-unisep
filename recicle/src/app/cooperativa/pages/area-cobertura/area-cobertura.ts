import { Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { ha90DiasISO } from '../../../shared/util/format';
import { PrecisaoCoordenada, descreverPrecisao, geocodificar } from '../../../shared/data/geocodificacao';
import { distanciaKm } from '../../../shared/util/geo';
import { UFS, ufValida } from '../../../shared/util/validators';
import { Mapa, MarcadorMapa } from '../../../shared/ui/mapa/mapa';
import { ToastService } from '../../../shared/ui/toast.service';
import { SupabaseService } from '../../../supabase.service';
import { CooperativaService } from '../../data/cooperativa.service';

interface Bairro {
  id: string;
  nome: string;
  distanciaKm: number;
  atendido: boolean;
  /** Coordenada guardada no banco; só vira pino no mapa quando existe. */
  latitude: number | null;
  longitude: number | null;
}

interface ForaDoRaio {
  nome: string;
  distanciaKm: number;
  pedidos: number;
}

interface PedidosPorBairro {
  nome: string;
  pedidos: number;
}

function inicioDoMesISO(): string {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
}

/** Intervalos aceitos pelos campos obrigatórios da US11. */
const RAIO_MIN_KM = 1;
const RAIO_MAX_KM = 50;
const COLETAS_MIN = 1;
const COLETAS_MAX = 20;

/** Mesmo texto usado como motivo de recusa em Solicitações — é assim que uma coleta fora do raio fica registrada. */
const MOTIVO_RECUSA_AREA = 'Endereço fora da área de coleta';

/** Id do pino do galpão no mapa: não é bairro, então não pode colidir com o id de um. */
const GALPAO_ID = 'galpao';

const ENDERECO_VAZIO = {
  cep: '',
  rua: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
};


function paraBairro(row: any): Bairro {
  return {
    id: row.id,
    nome: row.nome,
    distanciaKm: Number(row.distancia_km),
    atendido: row.atendido,
    latitude: row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null,
    longitude: row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null,
  };
}

@Component({
  selector: 'app-area-cobertura',
  imports: [Mapa],
  templateUrl: './area-cobertura.html',
  styleUrls: ['../../../shared/ui/design-system.css', './area-cobertura.css'],
})
export class AreaCobertura {
  private readonly toast = inject(ToastService);
  private readonly client = inject(SupabaseService).client;
  private readonly cooperativaService = inject(CooperativaService);

  readonly foraDoRaio = signal<ForaDoRaio[]>([]);
  readonly pedidosPorBairro = signal<PedidosPorBairro[]>([]);
  readonly bairros = signal<Bairro[]>([]);
  readonly raio = signal(2);
  readonly coletasPorPeriodo = signal(0);

  readonly mesAtual = new Date().toLocaleDateString('pt-BR', { month: 'long' });

  readonly raioMin = RAIO_MIN_KM;
  readonly raioMax = RAIO_MAX_KM;
  readonly coletasMin = COLETAS_MIN;
  readonly coletasMax = COLETAS_MAX;

  /** Campo destacado pela FE01 enquanto o valor estiver fora do intervalo. */
  readonly erroRaio = computed(() =>
    this.raio() < RAIO_MIN_KM || this.raio() > RAIO_MAX_KM
      ? `Informe um raio entre ${RAIO_MIN_KM} e ${RAIO_MAX_KM} km.`
      : ''
  );
  readonly erroColetas = computed(() =>
    this.coletasPorPeriodo() < COLETAS_MIN || this.coletasPorPeriodo() > COLETAS_MAX
      ? `Informe de ${COLETAS_MIN} a ${COLETAS_MAX} coletas por período.`
      : ''
  );
  readonly temErro = computed(() => !!this.erroRaio() || !!this.erroColetas());

  /** Texto do aviso laranja: quanto pedido o raio atual está deixando passar. */
  readonly avisoDistancia = computed(() => {
    const fora = this.foraDoRaio();
    if (fora.length === 0) return '';

    const total = fora.reduce((soma, b) => soma + b.pedidos, 0);
    const maior = fora[0];
    const raioSugerido = Math.ceil(maior.distanciaKm);
    return `${total} ${total === 1 ? 'pedido chegou' : 'pedidos chegaram'} de bairros fora do raio nos últimos 90 dias, a maioria de ${maior.nome} (${maior.distanciaKm.toFixed(0)} km). Ampliar para ${raioSugerido} km traria esses pedidos.`;
  });

  readonly cooperativa = this.cooperativaService.cooperativa;

  readonly bairrosNoRaio = computed(() => this.bairros().filter(b => b.atendido).length);

  /** Centro do mapa e do círculo de raio: o galpão, depois de localizado. */
  readonly centroMapa = computed<[number, number] | null>(() => {
    const c = this.cooperativa();
    return c && c.latitude !== null && c.longitude !== null ? [c.latitude, c.longitude] : null;
  });

  /** Galpão em destaque + um pino por bairro já localizado; apagado = fora do atendimento. */
  readonly marcadoresMapa = computed<MarcadorMapa[]>(() => {
    const marcadores: MarcadorMapa[] = [];
    const c = this.cooperativa();

    if (c && c.latitude !== null && c.longitude !== null) {
      marcadores.push({
        id: GALPAO_ID,
        latitude: c.latitude,
        longitude: c.longitude,
        titulo: `Galpão da ${c.nome}`,
        destaque: true,
      });
    }

    for (const b of this.bairros()) {
      if (b.latitude === null || b.longitude === null) continue;
      marcadores.push({
        id: b.id,
        latitude: b.latitude,
        longitude: b.longitude,
        titulo: `${b.nome} · ${b.distanciaKm.toFixed(0)} km · ${b.atendido ? 'atendido' : 'fora do atendimento'}`,
        atenuado: !b.atendido,
      });
    }

    return marcadores;
  });

  /** Enquanto o endereço do galpão não for localizado, não há onde centrar o mapa. */
  readonly galpaoLocalizado = computed(() => this.centroMapa() !== null);
  readonly localizando = signal(false);

  /** Aviso quando o pino não ficou exatamente no endereço (rua ausente no OpenStreetMap). */
  readonly avisoPrecisao = signal('');

  readonly ufs = UFS;

  readonly modalBairro = signal(false);
  readonly novoBairroNome = signal('');
  readonly salvandoBairro = signal(false);

  /**
   * Bairros que já pediram coleta neste mês e ainda não estão na lista. É daqui que a
   * cooperativa descobre o que falta cadastrar, em vez de ter que lembrar de cor.
   */
  readonly bairrosSugeridos = computed(() => {
    const jaCadastrados = new Set(this.bairros().map(b => b.nome.trim().toLowerCase()));
    return this.pedidosPorBairro()
      .map(p => p.nome)
      .filter(nome => nome && !jaCadastrados.has(nome.trim().toLowerCase()));
  });
  readonly modalEndereco = signal(false);
  readonly salvandoEndereco = signal(false);
  readonly formEndereco = signal({ ...ENDERECO_VAZIO });

  readonly enderecoGalpao = computed(() => {
    const c = this.cooperativaService.cooperativa();
    if (!c?.rua) return 'Endereço do galpão ainda não cadastrado';
    const complemento = c.numero ? `, ${c.numero}` : '';
    const bairro = c.bairro ? ` — ${c.bairro}` : '';
    return `${c.rua}${complemento}${bairro}`;
  });

  readonly todosMarcados = computed(() => this.bairros().length > 0 && this.bairros().every(b => b.atendido));

  constructor() {
    const carregamento = this.carregar();
    // Geocodificar depende de `fetch` numa URL relativa, que não existe no SSR —
    // daí a localização no mapa só começar depois que a tela chega ao navegador.
    afterNextRender(() => void carregamento.then(() => this.localizarNoMapa()));
  }

  private async carregar(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    this.raio.set(cooperativa.raioKm);
    this.coletasPorPeriodo.set(cooperativa.coletasPorDia);

    const [{ data }, { data: recusadasPorArea }, { data: pedidosDoMes }] = await Promise.all([
      this.client.from('bairros_atendidos').select('*').eq('cooperativa_id', cooperativa.id).order('nome'),
      this.client
        .from('solicitacoes')
        .select('bairro, distancia_km')
        .eq('cooperativa_id', cooperativa.id)
        .eq('status', 'recusada')
        .eq('motivo_recusa', MOTIVO_RECUSA_AREA)
        .gte('criado_em', ha90DiasISO()),
      this.client
        .from('solicitacoes')
        .select('bairro')
        .eq('cooperativa_id', cooperativa.id)
        .gte('criado_em', inicioDoMesISO()),
    ]);

    this.bairros.set((data ?? []).map(paraBairro));

    const contagem = new Map<string, number>();
    for (const p of pedidosDoMes ?? []) {
      if (!p.bairro) continue;
      contagem.set(p.bairro, (contagem.get(p.bairro) ?? 0) + 1);
    }
    this.pedidosPorBairro.set(
      [...contagem.entries()]
        .map(([nome, pedidos]) => ({ nome, pedidos }))
        .sort((a, b) => b.pedidos - a.pedidos)
        .slice(0, 6)
    );

    const porBairro = new Map<string, { distanciaKm: number; pedidos: number }>();
    for (const r of recusadasPorArea ?? []) {
      const atual = porBairro.get(r.bairro) ?? { distanciaKm: 0, pedidos: 0 };
      porBairro.set(r.bairro, {
        distanciaKm: Math.max(atual.distanciaKm, Number(r.distancia_km ?? 0)),
        pedidos: atual.pedidos + 1,
      });
    }
    this.foraDoRaio.set(
      [...porBairro.entries()]
        .map(([nome, v]) => ({ nome, distanciaKm: v.distanciaKm, pedidos: v.pedidos }))
        .sort((a, b) => b.pedidos - a.pedidos)
    );
  }

  /**
   * Transforma endereço em coordenada uma vez só: o resultado é gravado no banco, então
   * a próxima abertura da tela já desenha o mapa sem passar pelo serviço de mapas.
   * Falha em localizar não é erro para quem usa — o pino simplesmente não aparece.
   */
  private async localizarNoMapa(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    this.localizando.set(true);
    try {
      if (cooperativa.latitude === null || cooperativa.longitude === null) {
        const coordenada = await geocodificar({
          rua: cooperativa.rua,
          numero: cooperativa.numero,
          bairro: cooperativa.bairro,
          cidade: cooperativa.cidade,
          uf: cooperativa.uf,
        });

        if (coordenada) {
          this.anotarPrecisao(coordenada.precisao);
          await this.cooperativaService.atualizar({
            latitude: coordenada.latitude,
            longitude: coordenada.longitude,
          });
          // Galpão em outro lugar muda a distância de todo bairro já cadastrado.
          await this.recalcularDistancias();
        }
      }

      // Um bairro de cada vez: o serviço de mapas aceita uma consulta por segundo, e o
      // servidor já enfileira as chamadas — disparar tudo junto só faria a tela esperar mais.
      for (const bairro of this.bairros().filter(b => b.latitude === null || b.longitude === null)) {
        if (!cooperativa.cidade) break;

        const coordenada = await geocodificar({
          bairro: bairro.nome,
          cidade: cooperativa.cidade,
          uf: cooperativa.uf,
        });
        if (!coordenada) continue;

        const { latitude, longitude } = coordenada;
        this.bairros.update(lista =>
          lista.map(b => (b.id === bairro.id ? { ...b, latitude, longitude } : b))
        );
        await this.client.from('bairros_atendidos').update({ latitude, longitude }).eq('id', bairro.id);
      }
    } finally {
      this.localizando.set(false);
    }
  }

  abrirEdicaoEndereco(): void {
    const c = this.cooperativaService.cooperativa();
    if (!c) return;

    this.formEndereco.set({
      cep: c.cep ?? '',
      rua: c.rua ?? '',
      numero: c.numero ?? '',
      complemento: c.complemento ?? '',
      bairro: c.bairro ?? '',
      cidade: c.cidade ?? '',
      uf: c.uf ?? '',
    });
    this.modalEndereco.set(true);
  }

  fecharEdicaoEndereco(): void {
    if (this.salvandoEndereco()) return;
    this.modalEndereco.set(false);
  }

  atualizarEndereco<K extends keyof typeof ENDERECO_VAZIO>(campo: K, valor: string): void {
    this.formEndereco.update(f => ({ ...f, [campo]: valor }));
  }

  /**
   * Muda só o endereço do galpão, sem passar pelo wizard de cadastro: o status de aprovação
   * continua como está (o wizard reenviaria a cooperativa para análise e tiraria o acesso ao
   * painel). A troca fica registrada em `cooperativa_eventos` para o admin ver o que mudou.
   */
  async salvarEndereco(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    const f = this.formEndereco();
    if (!f.rua.trim() || !f.numero.trim() || !f.bairro.trim() || !f.cidade.trim()) {
      this.toast.mostrar('Preencha rua, número, bairro e cidade.');
      return;
    }
    if (!ufValida(f.uf)) {
      this.toast.mostrar('Escolha a UF na lista.');
      return;
    }

    this.salvandoEndereco.set(true);
    const { erro } = await this.cooperativaService.atualizar({
      cep: f.cep.trim() || null,
      rua: f.rua.trim(),
      numero: f.numero.trim(),
      complemento: f.complemento.trim() || null,
      bairro: f.bairro.trim(),
      cidade: f.cidade.trim(),
      uf: f.uf.trim().toUpperCase(),
      // Endereço novo com coordenada velha deixaria o pino e o círculo do raio no lugar
      // antigo; zerando, a tela localiza o galpão de novo logo abaixo.
      latitude: null,
      longitude: null,
    });
    this.salvandoEndereco.set(false);

    if (erro) {
      this.toast.mostrar('Não foi possível salvar o endereço. Tente novamente.');
      return;
    }

    await this.client.from('cooperativa_eventos').insert({
      cooperativa_id: cooperativa.id,
      titulo: 'Endereço do galpão alterado',
    });

    this.modalEndereco.set(false);
    this.avisoPrecisao.set('');
    this.toast.mostrar('Endereço atualizado.');
    await this.localizarNoMapa();
  }

  /**
   * O OpenStreetMap só conhece o que voluntários mapearam, e rua de cidade pequena falta
   * com frequência. Quando o pino não ficou no número exato, a tela diz onde ele ficou em
   * vez de deixar a cooperativa achar que o galpão está marcado errado.
   */
  private anotarPrecisao(precisao: PrecisaoCoordenada): void {
    this.avisoPrecisao.set(precisao === 'endereco' ? '' : descreverPrecisao(precisao));
  }

  abrirNovoBairro(): void {
    this.novoBairroNome.set('');
    this.modalBairro.set(true);
  }

  fecharNovoBairro(): void {
    if (this.salvandoBairro()) return;
    this.modalBairro.set(false);
  }

  /**
   * Cadastra um bairro na área de cobertura. Antes disso não havia caminho nenhum pela
   * interface: a tela só sabia listar e marcar bairros que já existissem no banco, então
   * a lista ficava permanentemente vazia.
   *
   * A distância sai da coordenada, não de digitação: é o mesmo critério do raio (linha
   * reta a partir do galpão), então bate com o círculo desenhado no mapa.
   */
  async adicionarBairro(nomeBruto?: string): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    const nome = (nomeBruto ?? this.novoBairroNome()).trim();
    if (!nome) {
      this.toast.mostrar('Informe o nome do bairro.');
      return;
    }
    if (this.bairros().some(b => b.nome.trim().toLowerCase() === nome.toLowerCase())) {
      this.toast.mostrar(`${nome} já está na lista.`);
      return;
    }

    this.salvandoBairro.set(true);
    const coordenada = await geocodificar({ bairro: nome, cidade: cooperativa.cidade, uf: cooperativa.uf });

    const galpao =
      cooperativa.latitude !== null && cooperativa.longitude !== null
        ? { latitude: cooperativa.latitude, longitude: cooperativa.longitude }
        : null;
    const distancia = coordenada && galpao ? distanciaKm(galpao, coordenada) : 0;

    const { data, error } = await this.client
      .from('bairros_atendidos')
      .insert({
        cooperativa_id: cooperativa.id,
        nome,
        distancia_km: Number(distancia.toFixed(1)),
        atendido: !distancia || distancia <= this.raio(),
        latitude: coordenada?.latitude ?? null,
        longitude: coordenada?.longitude ?? null,
      })
      .select('*')
      .single();
    this.salvandoBairro.set(false);

    if (error || !data) {
      this.toast.mostrar('Não foi possível adicionar o bairro. Tente novamente.');
      return;
    }

    this.bairros.update(lista => [...lista, paraBairro(data)].sort((a, b) => a.nome.localeCompare(b.nome)));
    this.modalBairro.set(false);
    this.novoBairroNome.set('');
    this.toast.mostrar(
      coordenada ? `${nome} adicionado a ${distancia.toFixed(1)} km do galpão.` : `${nome} adicionado (sem localização no mapa).`
    );
  }

  async removerBairro(bairro: Bairro): Promise<void> {
    const { error } = await this.client.from('bairros_atendidos').delete().eq('id', bairro.id);
    if (error) {
      this.toast.mostrar('Não foi possível remover o bairro.');
      return;
    }
    this.bairros.update(lista => lista.filter(b => b.id !== bairro.id));
    this.toast.mostrar(`${bairro.nome} removido.`);
  }

  /**
   * O galpão mudou de lugar, então toda distância guardada passou a se referir ao endereço
   * antigo. Recalcula a partir das coordenadas que já estão salvas — sem consultar o
   * serviço de mapas de novo, porque a posição dos bairros não mudou.
   */
  private async recalcularDistancias(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa?.latitude || !cooperativa?.longitude) return;

    const galpao = { latitude: cooperativa.latitude, longitude: cooperativa.longitude };
    const atualizados = this.bairros().filter(b => b.latitude !== null && b.longitude !== null);
    if (atualizados.length === 0) return;

    for (const bairro of atualizados) {
      const distancia = Number(
        distanciaKm(galpao, { latitude: bairro.latitude!, longitude: bairro.longitude! }).toFixed(1)
      );
      if (distancia === bairro.distanciaKm) continue;

      this.bairros.update(lista => lista.map(b => (b.id === bairro.id ? { ...b, distanciaKm: distancia } : b)));
      await this.client.from('bairros_atendidos').update({ distancia_km: distancia }).eq('id', bairro.id);
    }
  }

  /** Clicar no pino de um bairro liga/desliga o atendimento, igual ao chip da lista. */
  alternarBairroPorId(id: string): void {
    if (id === GALPAO_ID) return;
    this.bairros.update(lista => lista.map(b => (b.id === id ? { ...b, atendido: !b.atendido } : b)));
  }

  atualizarRaio(valor: string): void {
    this.raio.set(Number(valor) || 0);
  }

  atualizarColetasPorPeriodo(valor: string): void {
    this.coletasPorPeriodo.set(Math.round(Number(valor) || 0));
  }

  alternarBairro(index: number): void {
    this.bairros.update(lista => lista.map((b, i) => (i === index ? { ...b, atendido: !b.atendido } : b)));
  }

  alternarTodos(): void {
    const novoValor = !this.todosMarcados();
    this.bairros.update(lista => lista.map(b => ({ ...b, atendido: novoValor })));
  }

  async salvarAlteracoes(): Promise<void> {
    const cooperativa = this.cooperativaService.cooperativa();
    if (!cooperativa) return;

    if (this.bairros().length > 0) {
      const { error } = await this.client.from('bairros_atendidos').upsert(
        this.bairros().map(b => ({
          id: b.id,
          cooperativa_id: cooperativa.id,
          nome: b.nome,
          distancia_km: b.distanciaKm,
          atendido: b.atendido,
          latitude: b.latitude,
          longitude: b.longitude,
        }))
      );
      if (error) {
        this.toast.mostrar('Não foi possível salvar os bairros. Tente novamente.');
        return;
      }
    }

    const { erro } = await this.cooperativaService.atualizar({
      raio_km: this.raio(),
      coletas_por_dia: this.coletasPorPeriodo(),
    });
    if (erro) {
      this.toast.mostrar('Não foi possível salvar o raio de atendimento. Tente novamente.');
      return;
    }

    this.toast.mostrar('Alterações salvas.');
  }
}
