import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../../supabase.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { mensagemDoBanco } from '../../../shared/util/erros';
import { formatarData } from '../../../shared/util/format';

/** Coleta concluída por foto (sem o código do morador): os pontos esperam a conferência daqui. */
interface ColetaEmConferencia {
  id: string;
  numero: number;
  titulo: string;
  solicitante: string;
  pesoRecebidoKg: number;
  rejeitoKg: number;
  confirmadoEm: string | null;
}

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
  styleUrls: ['../../../shared/ui/design-system.css'],
})
export class Dashboard {
  private readonly client = inject(SupabaseService).client;
  private readonly toast = inject(ToastService);

  readonly resumo = signal<Resumo>(RESUMO_VAZIO);
  readonly carregando = signal(true);
  readonly emConferencia = signal<ColetaEmConferencia[]>([]);
  readonly creditando = signal<string | null>(null);
  readonly formatarData = formatarData;

  constructor() {
    this.carregar();
  }

  private async carregar(): Promise<void> {
    const [cooperativas, solicitacoes, clientes] = await Promise.all([
      this.client.from('cooperativas').select('status_cadastro'),
      this.client.from('solicitacoes').select('status'),
      this.client.from('clientes_resumo').select('solicitante_nome', { count: 'exact', head: true }),
      this.carregarConferencia(),
    ]);

    const porStatusCoop = { em_analise: 0, aprovado: 0, reprovado: 0 };
    for (const row of cooperativas.data ?? []) {
      porStatusCoop[row.status_cadastro as keyof typeof porStatusCoop]++;
    }

    const porStatusSol = { pendente: 0, aceita: 0, concluida: 0, recusada: 0, cancelada: 0 };
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

  private async carregarConferencia(): Promise<void> {
    const { data } = await this.client
      .from('solicitacoes')
      .select('id, numero, titulo, solicitante_nome, peso_recebido_kg, rejeito_kg, confirmado_em')
      .eq('status', 'concluida')
      .eq('confirmado_via_foto', true)
      .is('pontos_creditados', null)
      .not('morador_id', 'is', null)
      .order('confirmado_em');

    this.emConferencia.set(
      (data ?? []).map((r: any) => ({
        id: r.id,
        numero: r.numero,
        titulo: r.titulo,
        solicitante: r.solicitante_nome,
        pesoRecebidoKg: Number(r.peso_recebido_kg ?? 0),
        rejeitoKg: Number(r.rejeito_kg ?? 0),
        confirmadoEm: r.confirmado_em,
      }))
    );
  }

  async creditar(c: ColetaEmConferencia): Promise<void> {
    if (this.creditando()) return;
    if (!window.confirm(`Creditar os pontos da coleta #${c.numero} para ${c.solicitante}?`)) return;

    this.creditando.set(c.id);
    const { data, error } = await this.client.rpc('creditar_pontos_conferidos', { p_solicitacao_id: c.id });
    this.creditando.set(null);

    if (error) {
      this.toast.mostrar(mensagemDoBanco(error, 'Não foi possível creditar os pontos.'));
      return;
    }

    this.emConferencia.update(lista => lista.filter(x => x.id !== c.id));
    this.toast.mostrar(`+${data ?? 0} pontos creditados para ${c.solicitante}.`);
  }
}
