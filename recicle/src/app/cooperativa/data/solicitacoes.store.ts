import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from '../../supabase.service';
import { CooperativaService } from './cooperativa.service';

export type SolicitacaoStatus = 'pendente' | 'aceita' | 'concluida' | 'recusada';

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
  novo?: boolean;
  nota?: string;
  motivoRecusa?: string;
  observacaoRecusa?: string;
  dadosColeta?: DadosColeta;
  problemaMotivo?: string;
  problemaDescricao?: string;
}

function paraSolicitacao(row: any): Solicitacao {
  return {
    id: row.id,
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
    novo: row.novo,
    nota: row.nota ?? undefined,
    motivoRecusa: row.motivo_recusa ?? undefined,
    observacaoRecusa: row.observacao_recusa ?? undefined,
    problemaMotivo: row.problema_motivo ?? undefined,
    problemaDescricao: row.problema_descricao ?? undefined,
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

  async carregar(): Promise<void> {
    const cooperativaId = this.cooperativaService.cooperativa()?.id;
    if (!cooperativaId) {
      this._solicitacoes.set([]);
      return;
    }

    const { data } = await this.client
      .from('solicitacoes')
      .select('*')
      .eq('cooperativa_id', cooperativaId)
      .order('criado_em', { ascending: false });

    this._solicitacoes.set((data ?? []).map(paraSolicitacao));
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

  async aceitar(id: string): Promise<void> {
    await this.client.from('solicitacoes').update({ status: 'aceita', novo: false }).eq('id', id);
    this.atualizarLocal(id, { status: 'aceita', novo: false });
  }

  async recusar(id: string, motivo: string, observacao: string): Promise<void> {
    await this.client
      .from('solicitacoes')
      .update({ status: 'recusada', novo: false, motivo_recusa: motivo, observacao_recusa: observacao })
      .eq('id', id);
    this.atualizarLocal(id, { status: 'recusada', novo: false, motivoRecusa: motivo, observacaoRecusa: observacao });
  }

  async confirmarRecebimento(id: string, dados: DadosColeta): Promise<void> {
    await this.client
      .from('solicitacoes')
      .update({
        status: 'concluida',
        peso_recebido_kg: dados.pesoRecebidoKg,
        rejeito_kg: dados.rejeitoKg,
        confirmado_via_foto: dados.viaFoto ?? false,
        confirmado_em: new Date().toISOString(),
      })
      .eq('id', id);

    await this.client.from('solicitacao_triagem').delete().eq('solicitacao_id', id);
    if (dados.triagem.length > 0) {
      await this.client.from('solicitacao_triagem').insert(
        dados.triagem.map(item => ({
          solicitacao_id: id,
          material: item.material,
          kg: item.kg,
          checado: item.checado,
        }))
      );
    }

    this.atualizarLocal(id, { status: 'concluida', dadosColeta: dados });
  }

  async registrarProblema(id: string, motivo: string, descricao: string): Promise<void> {
    await this.client
      .from('solicitacoes')
      .update({ problema_motivo: motivo, problema_descricao: descricao })
      .eq('id', id);
    this.atualizarLocal(id, { problemaMotivo: motivo, problemaDescricao: descricao });
  }

  private atualizarLocal(id: string, changes: Partial<Solicitacao>): void {
    this._solicitacoes.update(list => list.map(s => (s.id === id ? { ...s, ...changes } : s)));
  }
}
