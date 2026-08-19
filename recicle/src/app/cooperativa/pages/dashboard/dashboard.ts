import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SolicitacoesStore } from '../../data/solicitacoes.store';
import { CooperativaService } from '../../data/cooperativa.service';

type StatusParada = 'concluida' | 'em-rota' | 'agendada';

interface ParadaRota {
  titulo: string;
  responsavel: string;
  endereco: string;
  detalhe: string;
  horario: string;
  status: StatusParada;
  top: number;
  left: number;
}

const ROTA_DE_HOJE: ParadaRota[] = [];

const MATERIAL_DO_MES: { material: string; kg: number }[] = [];

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrls: ['../../shared/cooperativa-shared.css', './dashboard.css'],
})
export class Dashboard {
  private readonly store = inject(SolicitacoesStore);
  private readonly cooperativaService = inject(CooperativaService);

  readonly rotaDeHoje = ROTA_DE_HOJE;
  readonly materialDoMes = MATERIAL_DO_MES;

  readonly receitaDoMes = computed(() =>
    this.store.concluidas().reduce((total, s) => total + s.preco, 0)
  );
  readonly materialRecebidoMes = computed(
    () => `${this.store.concluidas().reduce((total, s) => total + (s.dadosColeta?.pesoRecebidoKg ?? 0), 0)} kg`
  );
  readonly capacidadeUsada = computed(() =>
    this.store.aceitas().reduce((total, s) => total + s.pesoEstimadoKg, 0)
  );
  readonly capacidadeTotal = computed(() => this.cooperativaService.cooperativa()?.pesoMaximoKg ?? 0);

  constructor() {
    this.store.carregar();
  }

  readonly hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  readonly pendentes = this.store.pendentes;
  readonly emRotaAgora = this.store.aceitas;
  readonly proximasPendentes = computed(() => this.pendentes().slice(0, 3));

  readonly statusLabel: Record<StatusParada, string> = {
    concluida: 'Concluída',
    'em-rota': 'Em rota',
    agendada: 'Agendada',
  };

  readonly mapaAberto = signal(false);

  formatarPreco(valor: number): string {
    return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  formatarKg(kg: number): string {
    return `${kg.toLocaleString('pt-BR')} kg`;
  }
}
