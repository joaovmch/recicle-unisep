import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MoradorService } from '../../data/morador.service';
import { DescartesStore, STATUS_DESCARTE } from '../../data/descartes.store';
import { PontosStore } from '../../data/pontos.store';
import { formatarData } from '../../../shared/util/format';

@Component({
  selector: 'app-morador-painel',
  imports: [RouterLink],
  templateUrl: './painel.html',
  styleUrls: ['../../../shared/ui/design-system.css', './painel.css'],
})
export class Painel {
  private readonly moradorService = inject(MoradorService);
  private readonly descartesStore = inject(DescartesStore);
  private readonly pontosStore = inject(PontosStore);

  readonly morador = this.moradorService.morador;
  readonly carregando = this.descartesStore.carregando;
  readonly statusLabel = STATUS_DESCARTE;
  readonly formatarData = formatarData;

  readonly emAndamento = this.descartesStore.emAndamento;
  readonly concluidos = this.descartesStore.concluidos;
  readonly pesoDesviadoKg = this.descartesStore.pesoDesviadoKg;

  readonly saldo = this.pontosStore.saldo;
  readonly nivel = this.pontosStore.nivel;
  readonly proximoBeneficio = this.pontosStore.proximoBeneficio;

  /** Primeiro nome, como no "Olá, Ana" do layout. */
  readonly primeiroNome = computed(() => this.morador()?.nome?.trim().split(/\s+/)[0] ?? '');

  readonly proximaColeta = computed(() =>
    this.emAndamento()
      .filter(d => d.status === 'aceita' && d.dataAgendada)
      .sort((a, b) => (a.dataAgendada ?? '').localeCompare(b.dataAgendada ?? ''))[0] ?? null
  );

  readonly resumoTopo = computed(() => {
    const proxima = this.proximaColeta();
    if (proxima?.dataAgendada) {
      return `Você tem 1 coleta agendada para ${this.diaDaSemana(proxima.dataAgendada)}.`;
    }
    const abertas = this.emAndamento().length;
    if (abertas > 0) return `${abertas} descarte(s) em andamento.`;
    return 'Nenhum descarte em andamento — comece pelo chat.';
  });

  /** Últimos descartes concluídos, com os pontos que renderam. */
  readonly ultimosDescartes = computed(() => this.concluidos().slice(0, 3));

  /** Peso por material vindo da triagem das coletas concluídas. */
  readonly impacto = computed(() => {
    const porCategoria = new Map<string, number>();
    for (const d of this.concluidos()) {
      const kg = d.pesoRecebidoKg ?? 0;
      if (kg <= 0) continue;
      porCategoria.set(d.categoria, (porCategoria.get(d.categoria) ?? 0) + kg);
    }
    return [...porCategoria.entries()]
      .map(([categoria, kg]) => ({ categoria, kg }))
      .sort((a, b) => b.kg - a.kg)
      .slice(0, 5);
  });

  readonly progressoBeneficio = computed(() => {
    const beneficio = this.proximoBeneficio();
    if (!beneficio) return 0;
    return Math.min(100, Math.round((this.saldo() / beneficio.custoPontos) * 100));
  });

  constructor() {
    this.descartesStore.carregar();
    this.pontosStore.carregar();
  }

  private diaDaSemana(iso: string): string {
    const data = new Date(`${iso}T12:00:00`);
    return data.toLocaleDateString('pt-BR', { weekday: 'long' });
  }

  /** "#1042 · Cooperativa Reviver · qui, 14/08 · 8h–12h" */
  linhaDetalhe(d: {
    numero: number;
    cooperativaNome: string | null;
    ecopontoNome: string | null;
    dataAgendada: string | null;
    janelaConfirmada: string | null;
    janelaPreferida: string;
    status: string;
  }): string {
    const partes: string[] = [`#${d.numero}`];
    const local = d.cooperativaNome ?? d.ecopontoNome;
    if (local) partes.push(local);

    if (d.status === 'aceita' && d.dataAgendada) {
      partes.push(this.formatarData(d.dataAgendada));
      if (d.janelaConfirmada) partes.push(d.janelaConfirmada);
    } else if (d.status === 'pendente') {
      partes.push('aguardando resposta');
    }
    return partes.join(' · ');
  }
}
