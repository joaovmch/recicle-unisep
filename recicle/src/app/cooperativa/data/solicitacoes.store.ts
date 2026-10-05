import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from '../../supabase.service';
import { CooperativaService } from './cooperativa.service';
import { mensagemDoBanco } from '../../shared/util/erros';

export type SolicitacaoStatus = 'pendente' | 'aceita' | 'concluida' | 'recusada' | 'cancelada';

export interface TriagemItem {
  material: string;
  kg: number;
  checado: boolean;
}

export interface DadosColeta {
  pesoRecebidoKg: number;
  rejeitoKg: number;
  triagem: TriagemItem[];
  viaFoto?: boolean;
}

export interface Solicitacao {
  id: string;
  /** null = pedido de coleta em casa ainda aberto, visível a todas as cooperativas aprovadas. */
  cooperativaId: string | null;
  numero: number;
  titulo: string;
  categoria: string;
  pesoEstimadoKg: number;
  solicitante: string;
  endereco: string;
  bairro: string;
  distanciaKm: number;
  janela: string;
  preco: number;
  status: SolicitacaoStatus;
  criadoEm: string;
  novo?: boolean;
  nota?: string;
  motivoRecusa?: string;
  observacaoRecusa?: string;
  dadosColeta?: DadosColeta;
  problemaMotivo?: string;
  problemaDescricao?: string;
  confirmadoEm?: string;
  dataAgendada?: string;
  janelaConfirmada?: string;
  atribuidoEquipeId?: string;
  atribuidoVeiculoId?: string;
  avaliacaoNota?: number;
}

function paraSolicitacao(row: any): Solicitacao {
  return {
    id: row.id,
    cooperativaId: row.cooperativa_id ?? null,
    numero: row.numero,
    titulo: row.titulo,
    categoria: row.categoria,
    pesoEstimadoKg: Number(row.peso_estimado_kg),
    solicitante: row.solicitante_nome,
    endereco: row.endereco,
    bairro: row.bairro,
    distanciaKm: row.distancia_km !== null ? Number(row.distancia_km) : 0,
    janela: row.janela_preferida ?? '',
    preco: Number(row.preco),
    status: row.status,
    criadoEm: row.criado_em,
    novo: row.novo,
    nota: row.nota ?? undefined,
    motivoRecusa: row.motivo_recusa ?? undefined,
    observacaoRecusa: row.observacao_recusa ?? undefined,
    problemaMotivo: row.problema_motivo ?? undefined,
    problemaDescricao: row.problema_descricao ?? undefined,
    confirmadoEm: row.confirmado_em ?? undefined,
    dataAgendada: row.data_agendada ?? undefined,
    janelaConfirmada: row.janela_confirmada ?? undefined,
    atribuidoEquipeId: row.atribuido_equipe_id ?? undefined,
    atribuidoVeiculoId: row.atribuido_veiculo_id ?? undefined,
    avaliacaoNota: row.avaliacao_nota ?? undefined,
    dadosColeta:
      row.peso_recebido_kg !== null
        ? {
            pesoRecebidoKg: Number(row.peso_recebido_kg),
            rejeitoKg: Number(row.rejeito_kg ?? 0),
            triagem: [],
            viaFoto: row.confirmado_via_foto,
          }
        : undefined,
  };
}

@Injectable({ providedIn: 'root' })
export class SolicitacoesStore {
  private readonly client = inject(SupabaseService).client;
  private readonly cooperativaService = inject(CooperativaService);

  private readonly _solicitacoes = signal<Solicitacao[]>([]);
  readonly solicitacoes = this._solicitacoes.asReadonly();

  readonly pendentes = computed(() => this._solicitacoes().filter(s => s.status === 'pendente'));
  readonly aceitas = computed(() => this._solicitacoes().filter(s => s.status === 'aceita'));
  readonly concluidas = computed(() => this._solicitacoes().filter(s => s.status === 'concluida'));
  readonly recusadas = computed(() => this._solicitacoes().filter(s => s.status === 'recusada'));

  /**
   * Pedidos abertos que esta cooperativa dispensou — somem da lista dela e continuam abertos
   * para as outras. Ficam no navegador por cooperativa: sem isso voltavam a cada novo login.
   */
  private dispensadas = new Set<string>();

  private chaveDispensadas(cooperativaId: string): string {
    return `recicle-dispensadas-${cooperativaId}`;
  }

  private lerDispensadas(cooperativaId: string): Set<string> {
    try {
      return new Set(JSON.parse(localStorage.getItem(this.chaveDispensadas(cooperativaId)) ?? '[]'));
    } catch {
      return new Set();
    }
  }

  private salvarDispensadas(cooperativaId: string): void {
    try {
      localStorage.setItem(this.chaveDispensadas(cooperativaId), JSON.stringify([...this.dispensadas]));
    } catch {
      /* navegador sem localStorage: vale só nesta sessão */
    }
  }

  async carregar(): Promise<void> {
    const cooperativaId = this.cooperativaService.cooperativa()?.id;
    if (!cooperativaId) {
      this._solicitacoes.set([]);
      return;
    }
    this.dispensadas = this.lerDispensadas(cooperativaId);

    // O RLS já limita ao que é desta cooperativa + pedidos de coleta em casa ainda sem dono
    // (só para cooperativa aprovada). O filtro explícito evita trazer outra coisa por engano.
    const { data } = await this.client
      .from('solicitacoes')
      .select('*')
      .or(`cooperativa_id.eq.${cooperativaId},and(cooperativa_id.is.null,status.eq.pendente,destino.eq.coleta_casa)`)
      .order('criado_em', { ascending: false });

    this._solicitacoes.set((data ?? []).map(paraSolicitacao).filter(s => !this.dispensadas.has(s.id)));
  }

  async buscarPorId(id: string): Promise<Solicitacao | undefined> {
    const local = this._solicitacoes().find(s => s.id === id);

    const { data: row } = await this.client.from('solicitacoes').select('*').eq('id', id).maybeSingle();
    if (!row) return local;

    const solicitacao = paraSolicitacao(row);

    const { data: triagemRows } = await this.client
      .from('solicitacao_triagem')
      .select('material, kg, checado')
      .eq('solicitacao_id', id);

    if (solicitacao.dadosColeta && triagemRows) {
      solicitacao.dadosColeta.triagem = triagemRows.map((t: any) => ({
        material: t.material,
        kg: Number(t.kg),
        checado: t.checado,
      }));
    }

    return solicitacao;
  }

  /**
   * Aceitar um pedido aberto também o assume para esta cooperativa. A condição no update
   * (ainda sem dono ou já nosso, ainda pendente) faz o banco recusar se outra cooperativa
   * aceitou um instante antes — nesse caso nenhuma linha volta e avisamos.
   */
  async aceitar(
    id: string,
    agenda: { dataAgendada: string; janelaConfirmada: string; equipeId: string | null; veiculoId: string | null }
  ): Promise<{ erro: string | null }> {
    const cooperativaId = this.cooperativaService.cooperativa()?.id;
    if (!cooperativaId) return { erro: 'Cooperativa não carregada.' };

    const { data, error } = await this.client
      .from('solicitacoes')
      .update({
        cooperativa_id: cooperativaId,
        status: 'aceita',
        novo: false,
        data_agendada: agenda.dataAgendada,
        janela_confirmada: agenda.janelaConfirmada,
        atribuido_equipe_id: agenda.equipeId,
        atribuido_veiculo_id: agenda.veiculoId,
      })
      .eq('id', id)
      .eq('status', 'pendente')
      .or(`cooperativa_id.is.null,cooperativa_id.eq.${cooperativaId}`)
      .select('id');

    if (error) return { erro: 'Não foi possível aceitar a solicitação. Tente novamente.' };
    if (!data || data.length === 0) {
      await this.carregar();
      return { erro: 'Esse pedido já foi aceito por outra cooperativa ou cancelado pelo morador.' };
    }

    this.atualizarLocal(id, {
      cooperativaId,
      status: 'aceita',
      novo: false,
      dataAgendada: agenda.dataAgendada,
      janelaConfirmada: agenda.janelaConfirmada,
      atribuidoEquipeId: agenda.equipeId ?? undefined,
      atribuidoVeiculoId: agenda.veiculoId ?? undefined,
    });
    return { erro: null };
  }

  /** "Desfazer aceite": volta a solicitação para pendente e limpa o agendamento. */
  async desfazerAceite(id: string): Promise<{ erro: string | null }> {
    const { error } = await this.client
      .from('solicitacoes')
      .update({
        status: 'pendente',
        data_agendada: null,
        janela_confirmada: null,
        atribuido_equipe_id: null,
        atribuido_veiculo_id: null,
      })
      .eq('id', id)
      .eq('status', 'aceita');
    if (error) return { erro: 'Não foi possível desfazer o aceite.' };

    this.atualizarLocal(id, {
      status: 'pendente',
      dataAgendada: undefined,
      janelaConfirmada: undefined,
      atribuidoEquipeId: undefined,
      atribuidoVeiculoId: undefined,
    });
    return { erro: null };
  }

  /**
   * Recusar um pedido que já é desta cooperativa grava a recusa. Recusar um pedido aberto
   * (sem dono) só o tira da lista desta cooperativa — gravar "recusada" aí cancelaria o
   * pedido para todas as outras que ainda poderiam atender.
   */
  async recusar(id: string, motivo: string, observacao: string): Promise<{ erro: string | null }> {
    const solicitacao = this._solicitacoes().find(s => s.id === id);
    if (solicitacao && solicitacao.cooperativaId === null) {
      this.dispensadas.add(id);
      const cooperativaId = this.cooperativaService.cooperativa()?.id;
      if (cooperativaId) this.salvarDispensadas(cooperativaId);
      this._solicitacoes.update(lista => lista.filter(s => s.id !== id));
      return { erro: null };
    }

    const { error } = await this.client
      .from('solicitacoes')
      .update({ status: 'recusada', novo: false, motivo_recusa: motivo, observacao_recusa: observacao })
      .eq('id', id);
    if (error) return { erro: 'Não foi possível recusar a solicitação.' };

    this.atualizarLocal(id, { status: 'recusada', novo: false, motivoRecusa: motivo, observacaoRecusa: observacao });
    return { erro: null };
  }

  /**
   * Concluir passa obrigatoriamente pela função do banco, que confere o código que só o
   * morador tem (exceto na confirmação por foto, que não credita pontos automaticamente).
   */
  async confirmarRecebimento(
    id: string,
    dados: DadosColeta,
    confirmadoPor: string | null,
    codigo: string | null
  ): Promise<{ erro: string | null }> {
    // Triagem primeiro: se ela falhar, a coleta ainda não foi concluída.
    const { error: erroLimpeza } = await this.client.from('solicitacao_triagem').delete().eq('solicitacao_id', id);
    if (erroLimpeza) return { erro: 'Não foi possível registrar a triagem.' };

    if (dados.triagem.length > 0) {
      const { error: erroTriagem } = await this.client.from('solicitacao_triagem').insert(
        dados.triagem.map(item => ({
          solicitacao_id: id,
          material: item.material,
          kg: item.kg,
          checado: item.checado,
        }))
      );
      if (erroTriagem) return { erro: 'Não foi possível registrar a triagem.' };
    }

    const { error } = await this.client.rpc('confirmar_recebimento', {
      p_solicitacao_id: id,
      p_codigo: codigo,
      p_peso_recebido_kg: dados.pesoRecebidoKg,
      p_rejeito_kg: dados.rejeitoKg,
      p_via_foto: dados.viaFoto ?? false,
      p_confirmado_por: confirmadoPor,
    });
    if (error) {
      return { erro: mensagemDoBanco(error, 'Não foi possível confirmar o recebimento. Tente novamente.') };
    }

    this.atualizarLocal(id, { status: 'concluida', dadosColeta: dados, confirmadoEm: new Date().toISOString() });
    return { erro: null };
  }

  async registrarProblema(id: string, motivo: string, descricao: string): Promise<{ erro: string | null }> {
    const { error } = await this.client
      .from('solicitacoes')
      .update({ problema_motivo: motivo, problema_descricao: descricao })
      .eq('id', id);
    if (error) return { erro: 'Não foi possível registrar o problema.' };

    this.atualizarLocal(id, { problemaMotivo: motivo, problemaDescricao: descricao });
    return { erro: null };
  }

  private atualizarLocal(id: string, changes: Partial<Solicitacao>): void {
    this._solicitacoes.update(list => list.map(s => (s.id === id ? { ...s, ...changes } : s)));
  }
}
