import { Component, computed, inject, signal } from '@angular/core';
import { Mapa, MarcadorMapa } from '../../../shared/ui/mapa/mapa';
import { Ecoponto, EcopontosStore } from '../../data/ecopontos.store';

type Aba = 'cooperativas' | 'publicos';

@Component({
  selector: 'app-morador-ecopontos',
  imports: [Mapa],
  templateUrl: './ecopontos.html',
  styleUrls: ['../../../shared/ui/design-system.css', './ecopontos.css'],
})
export class Ecopontos {
  private readonly store = inject(EcopontosStore);

  readonly carregando = this.store.carregando;
  readonly busca = signal('');
  readonly abaAtiva = signal<Aba>('cooperativas');
  readonly filtroTipo = signal<string | null>(null);
  readonly selecionado = signal<Ecoponto | null>(null);

  /** Chips de filtro montados a partir do que os locais realmente aceitam. */
  readonly tiposDisponiveis = computed(() => {
    const tipos = new Set<string>();
    for (const e of this.store.ecopontos()) for (const t of e.aceita) tipos.add(t);
    return [...tipos].sort();
  });

  readonly lista = computed<Ecoponto[]>(() => {
    const termo = this.busca().trim().toLowerCase();
    const tipo = this.filtroTipo();
    const aba = this.abaAtiva();

    return this.store.ecopontos().filter(e => {
      if (aba === 'cooperativas' && e.tipo !== 'cooperativa') return false;
      if (aba === 'publicos' && e.tipo !== 'publico') return false;
      if (tipo && !e.aceita.includes(tipo)) return false;
      if (termo) {
        const alvo = `${e.nome} ${e.bairro} ${e.endereco} ${e.cidade}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  });

  /** Só entra no mapa quem tem coordenada; o resto continua na lista ao lado. */
  readonly marcadores = computed<MarcadorMapa[]>(() =>
    this.lista()
      .filter(e => e.latitude !== null && e.longitude !== null)
      .map(e => ({ id: e.id, latitude: e.latitude!, longitude: e.longitude!, titulo: e.nome }))
  );

  readonly semCoordenada = computed(() => this.lista().length - this.marcadores().length);

  constructor() {
    this.store.carregar();
  }

  setAba(aba: Aba): void {
    this.abaAtiva.set(aba);
    this.selecionado.set(null);
  }

  alternarTipo(tipo: string): void {
    this.filtroTipo.update(atual => (atual === tipo ? null : tipo));
  }

  selecionar(e: Ecoponto): void {
    this.selecionado.set(e);
  }

  /** O mapa devolve só o id do pino clicado. */
  selecionarPorId(id: string): void {
    this.selecionado.set(this.lista().find(e => e.id === id) ?? null);
  }

  /** Abre a rota no mapa externo — não há navegação embarcada no projeto. */
  comoChegar(e: Ecoponto): void {
    const destino =
      e.latitude !== null && e.longitude !== null
        ? `${e.latitude},${e.longitude}`
        : `${e.endereco}, ${e.bairro}, ${e.cidade} - ${e.uf}`;
    const url = `https://www.openstreetmap.org/search?query=${encodeURIComponent(destino)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
