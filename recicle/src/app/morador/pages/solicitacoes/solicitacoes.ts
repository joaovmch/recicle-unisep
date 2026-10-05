import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Descarte, DescartesStore, STATUS_DESCARTE } from '../../data/descartes.store';
import { formatarData, formatarPreco } from '../../../shared/util/format';

type Aba = 'todas' | 'andamento' | 'concluidas' | 'canceladas';

const POR_PAGINA = 6;

@Component({
  selector: 'app-morador-solicitacoes',
  imports: [RouterLink],
  templateUrl: './solicitacoes.html',
  styleUrls: ['../../../shared/ui/design-system.css', './solicitacoes.css'],
})
export class Solicitacoes {
  private readonly store = inject(DescartesStore);

  readonly carregando = this.store.carregando;
  readonly statusLabel = STATUS_DESCARTE;
  readonly formatarData = formatarData;
  readonly formatarPreco = formatarPreco;

  readonly abaAtiva = signal<Aba>('todas');
  readonly pagina = signal(1);

  readonly todas = this.store.descartes;
  readonly emAndamento = this.store.emAndamento;
  readonly concluidas = this.store.concluidos;
  readonly canceladas = this.store.cancelados;

  readonly listaAtiva = computed<Descarte[]>(() => {
    switch (this.abaAtiva()) {
      case 'andamento': return this.emAndamento();
      case 'concluidas': return this.concluidas();
      case 'canceladas': return this.canceladas();
      default: return this.todas();
    }
  });

  readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.listaAtiva().length / POR_PAGINA)));

  readonly paginaAtual = computed<Descarte[]>(() => {
    const inicio = (this.pagina() - 1) * POR_PAGINA;
    return this.listaAtiva().slice(inicio, inicio + POR_PAGINA);
  });

  readonly paginas = computed(() => Array.from({ length: this.totalPaginas() }, (_, i) => i + 1));

  constructor() {
    this.store.carregar();
  }

  setAba(aba: Aba): void {
    this.abaAtiva.set(aba);
    this.pagina.set(1);
  }

  irParaPagina(n: number): void {
    this.pagina.set(Math.min(Math.max(1, n), this.totalPaginas()));
  }

  /** Rótulo da coluna de data, que muda conforme a situação do pedido. */
  rotuloData(d: Descarte): string {
    if (d.status === 'concluida') return d.destino === 'entrega_ecoponto' ? 'Entregue em' : 'Coletado em';
    if (d.status === 'cancelada') return 'Cancelada em';
    if (d.status === 'recusada') return 'Recusada em';
    if (d.status === 'aceita') return 'Janela';
    return 'Janela pedida';
  }

  valorData(d: Descarte): string {
    if (d.status === 'concluida' && d.confirmadoEm) return formatarData(d.confirmadoEm);
    if (d.status === 'cancelada' && d.canceladaEm) return formatarData(d.canceladaEm);
    if (d.status === 'aceita' && d.dataAgendada) {
      return `${formatarData(d.dataAgendada)}${d.janelaConfirmada ? ' · ' + d.janelaConfirmada : ''}`;
    }
    return d.janelaPreferida || '—';
  }

  valorCobrado(d: Descarte): string {
    if (d.status === 'cancelada') return 'não cobrado';
    if (d.destino === 'entrega_ecoponto') return 'sem custo';
    return formatarPreco(d.preco);
  }

  valorPontos(d: Descarte): string {
    if (d.pontosCreditados !== null) return `+${d.pontosCreditados}`;
    if (d.status === 'cancelada' || d.status === 'recusada') return '—';
    if (d.status === 'concluida' && d.confirmadoViaFoto) return 'pontos em conferência';
    return `+${d.pontosPrevistos} previstos`;
  }

  /** "#1042 · Cooperativa Reviver · código R7K2" */
  subtitulo(d: Descarte): string {
    const partes: string[] = [`#${d.numero}`];
    const local = d.cooperativaNome ?? d.ecopontoNome;
    if (local) partes.push(local);

    if (d.status === 'aceita') partes.push(`código ${d.codigoConfirmacao}`);
    else if (d.status === 'pendente') partes.push('aguardando resposta');
    else if (d.status === 'cancelada') partes.push('cancelada por você');
    else if (d.destino === 'entrega_ecoponto') partes.push('entrega própria');
    else partes.push('coleta em casa');

    return partes.join(' · ');
  }
}
