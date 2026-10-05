import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  mensagem: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  private proximoId = 1;

  mostrar(mensagem: string, duracaoMs = 2600): void {
    const id = this.proximoId++;
    this._toasts.update(lista => [...lista, { id, mensagem }]);
    setTimeout(() => this.remover(id), duracaoMs);
  }

  remover(id: number): void {
    this._toasts.update(lista => lista.filter(t => t.id !== id));
  }
}
