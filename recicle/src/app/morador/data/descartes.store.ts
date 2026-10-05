import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from '../../supabase.service';
import { MoradorService } from './morador.service';
import { hojeISO } from '../../shared/util/format';
import { mensagemDoBanco } from '../../shared/util/erros';

export type DescarteStatus = 'pendente' | 'aceita' | 'concluida' | 'recusada' | 'cancelada';
export type Destino = 'coleta_casa' | 'entrega_ecoponto';

export interface Descarte {
  id: string;
  numero: number;
  titulo: string;
  categoria: string;
  pesoEstimadoKg: number;
  status: DescarteStatus;
  destino: Destino;
  endereco: string;
  bairro: string;
  janelaPreferida: string;
  janelaConfirmada: string | null;
  dataAgendada: string | null;
  preco: number;
  codigoConfirmacao: string;
  /** Concluída por foto, sem o código: pontos ficam em conferência, não são creditados sozinhos. */
  confirmadoViaFoto: boolean;
  pontosPrevistos: number;
  pontosCreditados: number | null;
  pesoRecebidoKg: number | null;
  rejeitoKg: number | null;
  cooperativaNome: string | null;
  ecopontoNome: string | null;
  remarcacoesUsadas: number;
  motivoRecusa: string | null;
  motivoCancelamento: string | null;
  canceladaEm: string | null;
  confirmadoEm: string | null;
  criadoEm: string;
}

export function paraDescarte(row: any): Descarte {
  return {
    id: row.id,
    numero: row.numero,
    titulo: row.titulo,
    categoria: row.categoria,
    pesoEstimadoKg: Number(row.peso_estimado_kg ?? 0),
    status: row.status,
    destino: row.destino ?? 'coleta_casa',
    endereco: row.endereco ?? '',
    bairro: row.bairro ?? '',
    janelaPreferida: row.janela_preferida ?? '',
    janelaConfirmada: row.janela_confirmada ?? null,
    dataAgendada: row.data_agendada ?? null,
    preco: Number(row.preco ?? 0),
    // Relação 1:1 — o PostgREST pode devolver objeto ou lista de um item.
    codigoConfirmacao: (Array.isArray(row.solicitacao_codigos) ? row.solicitacao_codigos[0] : row.solicitacao_codigos)?.codigo ?? '',
    confirmadoViaFoto: !!row.confirmado_via_foto,
    pontosPrevistos: Number(row.pontos_previstos ?? 0),
    pontosCreditados: row.pontos_creditados !== null ? Number(row.pontos_creditados) : null,
    pesoRecebidoKg: row.peso_recebido_kg !== null ? Number(row.peso_recebido_kg) : null,
    rejeitoKg: row.rejeito_kg !== null ? Number(row.rejeito_kg) : null,
    cooperativaNome: row.cooperativa_nome ?? null,
    ecopontoNome: row.ecopontos?.nome ?? null,
    remarcacoesUsadas: Number(row.remarcacoes_usadas ?? 0),
    motivoRecusa: row.motivo_recusa ?? null,
    motivoCancelamento: row.motivo_cancelamento ?? null,
    canceladaEm: row.cancelada_em ?? null,
    confirmadoEm: row.confirmado_em ?? null,
    criadoEm: row.criado_em,
  };
}

/** Rótulo e cor do selo de status, do ponto de vista do morador. */
export const STATUS_DESCARTE: Record<DescarteStatus, { label: string; tom: 'good' | 'info' | 'warning' | 'neutral' | 'bad' }> = {
  pendente:  { label: 'Em análise',       tom: 'info' },
  aceita:    { label: 'Agendada',         tom: 'good' },
  concluida: { label: 'Concluída',        tom: 'neutral' },
  recusada:  { label: 'Recusada',         tom: 'bad' },
  cancelada: { label: 'Cancelada',        tom: 'neutral' },
};

const LIMITE_REMARCACOES = 2;

@Injectable({ providedIn: 'root' })
export class DescartesStore {
  private readonly client = inject(SupabaseService).client;
  private readonly moradorService = inject(MoradorService);

  private readonly _descartes = signal<Descarte[]>([]);
  readonly descartes = this._descartes.asReadonly();
  readonly carregando = signal(false);

  readonly emAndamento = computed(() => this._descartes().filter(d => d.status === 'pendente' || d.status === 'aceita'));
  readonly concluidos = computed(() => this._descartes().filter(d => d.status === 'concluida'));
  readonly cancelados = computed(() =>
    this._descartes().filter(d => d.status === 'cancelada' || d.status === 'recusada')
  );

  readonly pesoDesviadoKg = computed(() =>
    this.concluidos().reduce((total, d) => total + (d.pesoRecebidoKg ?? 0), 0)
  );

  readonly limiteRemarcacoes = LIMITE_REMARCACOES;

  async carregar(): Promise<void> {
    const morador = this.moradorService.morador();
    if (!morador) {
      this._descartes.set([]);
      return;
    }

    this.carregando.set(true);
    const { data } = await this.client
      .from('solicitacoes')
      .select('*, ecopontos(nome), solicitacao_codigos(codigo)')
      .eq('morador_id', morador.id)
      .order('criado_em', { ascending: false });

    this._descartes.set((await this.comNomeDaCooperativa(data ?? [])).map(paraDescarte));
    this.carregando.set(false);
  }

  async buscarPorId(id: string): Promise<Descarte | undefined> {
    const { data } = await this.client
      .from('solicitacoes')
      .select('*, ecopontos(nome), solicitacao_codigos(codigo)')
      .eq('id', id)
      .maybeSingle();
    if (!data) return this._descartes().find(d => d.id === id);
    const [comNome] = await this.comNomeDaCooperativa([data]);
    return paraDescarte(comNome);
  }

  /**
   * O morador não lê a tabela cooperativas (ela tem dados do responsável); o nome de quem
   * vai buscar vem da view pública `cooperativas_publicas`.
   */
  private async comNomeDaCooperativa(linhas: any[]): Promise<any[]> {
    const ids = [...new Set(linhas.map(l => l.cooperativa_id).filter((id): id is string => !!id))];
    if (ids.length === 0) return linhas;

    const { data } = await this.client.from('cooperativas_publicas').select('id, nome').in('id', ids);
    const nomes = new Map((data ?? []).map((c: any) => [c.id, c.nome]));
    return linhas.map(l => ({ ...l, cooperativa_nome: nomes.get(l.cooperativa_id) ?? null }));
  }

  /** Remarcar só muda a janela; o limite existe para não virar remarcação infinita. */
  /**
   * Quem conta as remarcações e confere a data é o banco (gatilho) — aqui só antecipamos
   * os erros óbvios para não fazer a viagem à toa.
   */
  async remarcar(descarte: Descarte, dataAgendada: string, janela: string): Promise<{ erro: string | null }> {
    if (descarte.remarcacoesUsadas >= LIMITE_REMARCACOES) {
      return { erro: `Você já usou as ${LIMITE_REMARCACOES} remarcações desta coleta.` };
    }
    if (!dataAgendada || dataAgendada < hojeISO()) {
      return { erro: 'Escolha uma data a partir de hoje.' };
    }

    const { error } = await this.client
      .from('solicitacoes')
      .update({ data_agendada: dataAgendada, janela_confirmada: janela })
      .eq('id', descarte.id);

    if (error) return { erro: mensagemDoBanco(error, 'Não foi possível remarcar. Tente novamente.') };

    await this.carregar();
    return { erro: null };
  }

  async cancelar(id: string, motivo: string): Promise<{ erro: string | null }> {
    const { error } = await this.client
      .from('solicitacoes')
      .update({
        status: 'cancelada',
        cancelada_em: new Date().toISOString(),
        cancelada_por: 'morador',
        motivo_cancelamento: motivo,
      })
      .eq('id', id);

    if (error) return { erro: mensagemDoBanco(error, 'Não foi possível cancelar. Tente novamente.') };

    await this.carregar();
    return { erro: null };
  }
}
