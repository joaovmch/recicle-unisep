import { Component, computed, inject, signal } from '@angular/core';
import { Ecoponto, EcopontosStore } from '../../data/ecopontos.store';

type Aba = 'cooperativas' | 'publicos';

@Component({
  selector: 'app-morador-ecopontos',
  imports: [],
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

  /** Abre a rota no mapa externo — não há navegação embarcada no projeto. */
  comoChegar(e: Ecoponto): void {
    const destino =
      e.latitude !== null && e.longitude !== null
        ? `${e.latitude},${e.longitude}`
        : `${e.endereco}, ${e.bairro}, ${e.cidade} - ${e.uf}`;
    const url = `https://www.openstreetmap.org/search?query=${encodeURIComponent(destino)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /** Posição do pino no mapa ilustrativo, derivada do id para ficar estável entre recargas. */
  posicao(e: Ecoponto, eixo: 'top' | 'left'): number {
    let hash = 0;
    const semente = eixo === 'top' ? e.id : e.id.split('').reverse().join('');
    for (const c of semente) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    return 18 + (hash % 64);
  }
}
