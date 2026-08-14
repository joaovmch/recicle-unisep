import { Injectable, computed, signal } from '@angular/core';

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

const SOLICITACOES_MOCK: Solicitacao[] = [];

@Injectable({ providedIn: 'root' })
export class SolicitacoesStore {
  private readonly _solicitacoes = signal<Solicitacao[]>(SOLICITACOES_MOCK);
  readonly solicitacoes = this._solicitacoes.asReadonly();

  readonly pendentes = computed(() => this._solicitacoes().filter(s => s.status === 'pendente'));
  readonly aceitas = computed(() => this._solicitacoes().filter(s => s.status === 'aceita'));
  readonly concluidas = computed(() => this._solicitacoes().filter(s => s.status === 'concluida'));
  readonly recusadas = computed(() => this._solicitacoes().filter(s => s.status === 'recusada'));

  buscarPorId(id: string): Solicitacao | undefined {
    return this._solicitacoes().find(s => s.id === id);
  }

  aceitar(id: string): void {
    this.atualizar(id, { status: 'aceita', novo: false });
  }

  recusar(id: string, motivo: string, observacao: string): void {
    this.atualizar(id, { status: 'recusada', novo: false, motivoRecusa: motivo, observacaoRecusa: observacao });
  }

  confirmarRecebimento(id: string, dados: DadosColeta): void {
    this.atualizar(id, { status: 'concluida', dadosColeta: dados });
  }

  registrarProblema(id: string, motivo: string, descricao: string): void {
    this.atualizar(id, { problemaMotivo: motivo, problemaDescricao: descricao });
  }

  private atualizar(id: string, changes: Partial<Solicitacao>): void {
    this._solicitacoes.update(list => list.map(s => (s.id === id ? { ...s, ...changes } : s)));
  }
}
