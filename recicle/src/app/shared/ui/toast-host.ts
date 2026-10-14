import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-host',
  imports: [],
  template: `
    <div class="toast-host">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast" [class.com-acao]="t.acao">
          <svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10" /></svg>

          <div class="toast-texto">
            {{ t.mensagem }}
            @if (t.detalhe) {
              <span class="toast-detalhe">{{ t.detalhe }}</span>
            }
          </div>

          @if (t.acao; as acao) {
            <button class="toast-acao" (click)="toasts.executarAcao(t)">{{ acao.label }}</button>
          }
        </div>
      }
    </div>
  `,
  styleUrls: ['./design-system.css'],
})
export class ToastHost {
  protected readonly toasts = inject(ToastService);
}
