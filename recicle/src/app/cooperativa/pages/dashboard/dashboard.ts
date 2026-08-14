import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SolicitacoesStore } from '../../data/solicitacoes.store';

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

  readonly rotaDeHoje = ROTA_DE_HOJE;
  readonly materialDoMes = MATERIAL_DO_MES;
  readonly receitaDoMes = 0;
  readonly materialRecebidoMes = '0 kg';
  readonly capacidadeUsada = 0;
  readonly capacidadeTotal = 0;

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
