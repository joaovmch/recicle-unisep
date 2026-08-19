import { Component, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../supabase.service';

interface Cliente {
  nome: string;
  endereco: string;
  bairro: string;
  totalSolicitacoes: number;
  coletasConcluidas: number;
  pesoTotalKg: number;
  valorTotal: number;
  ultimaSolicitacao: string;
}

function paraCliente(row: any): Cliente {
  return {
    nome: row.solicitante_nome,
    endereco: row.endereco,
    bairro: row.bairro,
    totalSolicitacoes: Number(row.total_solicitacoes),
    coletasConcluidas: Number(row.coletas_concluidas),
    pesoTotalKg: Number(row.peso_total_kg),
    valorTotal: Number(row.valor_total),
    ultimaSolicitacao: row.ultima_solicitacao,
  };
}

@Component({
  selector: 'app-admin-clientes',
  imports: [],
  templateUrl: './clientes.html',
  styleUrls: ['../../../cooperativa/shared/cooperativa-shared.css'],
})
export class Clientes {
  private readonly client = inject(SupabaseService).client;

  readonly clientes = signal<Cliente[]>([]);
  readonly carregando = signal(true);

  constructor() {
    this.carregar();
  }

  private async carregar(): Promise<void> {
    const { data } = await this.client
      .from('clientes_resumo')
      .select('*')
      .order('ultima_solicitacao', { ascending: false });

    this.clientes.set((data ?? []).map(paraCliente));
    this.carregando.set(false);
  }

  formatarPreco(valor: number): string {
    return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  formatarData(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR');
  }
}
