import { Injectable, signal } from '@angular/core';

export interface AcaoToast {
  label: string;
  executar: () => void;
}

export interface Toast {
  id: number;
  mensagem: string;
  /** Linha de apoio: o resumo do que mudou, exigido pela RG07 nas telas de configuração. */
  detalhe?: string;
  acao?: AcaoToast;
}

/** Com "Desfazer" o aviso espera a decisão da pessoa em vez de sumir sozinho. */
const DURACAO_PADRAO_MS = 2600;
const DURACAO_COM_ACAO_MS = 10000;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  private proximoId = 1;

  mostrar(mensagem: string, duracaoMs = DURACAO_PADRAO_MS): void {
    this.enfileirar({ mensagem }, duracaoMs);
  }

  /**
   * Confirmação com resumo do que mudou e um "Desfazer" — é o padrão que a RG07 pede
   * depois de salvar tipos de resíduo, área de cobertura e dados do perfil.
   */
  mostrarComAcao(mensagem: string, detalhe: string, acao: AcaoToast, duracaoMs = DURACAO_COM_ACAO_MS): void {
    this.enfileirar({ mensagem, detalhe: detalhe || undefined, acao }, duracaoMs);
  }

  private enfileirar(toast: Omit<Toast, 'id'>, duracaoMs: number): void {
    const id = this.proximoId++;
    this._toasts.update(lista => [...lista, { id, ...toast }]);
    setTimeout(() => this.remover(id), duracaoMs);
  }

  /** Dispara a ação e fecha o aviso — "Desfazer" só vale uma vez. */
  executarAcao(toast: Toast): void {
    toast.acao?.executar();
    this.remover(toast.id);
  }

  remover(id: number): void {
    this._toasts.update(lista => lista.filter(t => t.id !== id));
  }
}
