import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../../supabase.service';

interface Resumo {
  cooperativasEmAnalise: number;
  cooperativasAprovadas: number;
  cooperativasReprovadas: number;
  solicitacoesPendentes: number;
  solicitacoesConcluidas: number;
  totalClientes: number;
}

const RESUMO_VAZIO: Resumo = {
  cooperativasEmAnalise: 0,
  cooperativasAprovadas: 0,
  cooperativasReprovadas: 0,
  solicitacoesPendentes: 0,
  solicitacoesConcluidas: 0,
  totalClientes: 0,
};

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrls: ['../../../cooperativa/shared/cooperativa-shared.css'],
})
export class Dashboard {
  private readonly client = inject(SupabaseService).client;

  readonly resumo = signal<Resumo>(RESUMO_VAZIO);
  readonly carregando = signal(true);

  constructor() {
    this.carregar();
  }

  private async carregar(): Promise<void> {
    const [cooperativas, solicitacoes, clientes] = await Promise.all([
      this.client.from('cooperativas').select('status_cadastro'),
      this.client.from('solicitacoes').select('status'),
      this.client.from('clientes_resumo').select('solicitante_nome', { count: 'exact', head: true }),
    ]);

    const porStatusCoop = { em_analise: 0, aprovado: 0, reprovado: 0 };
    for (const row of cooperativas.data ?? []) {
      porStatusCoop[row.status_cadastro as keyof typeof porStatusCoop]++;
    }

    const porStatusSol = { pendente: 0, aceita: 0, concluida: 0, recusada: 0 };
    for (const row of solicitacoes.data ?? []) {
      porStatusSol[row.status as keyof typeof porStatusSol]++;
    }

    this.resumo.set({
      cooperativasEmAnalise: porStatusCoop.em_analise,
      cooperativasAprovadas: porStatusCoop.aprovado,
      cooperativasReprovadas: porStatusCoop.reprovado,
      solicitacoesPendentes: porStatusSol.pendente,
      solicitacoesConcluidas: porStatusSol.concluida,
      totalClientes: clientes.count ?? 0,
    });
    this.carregando.set(false);
  }
}
