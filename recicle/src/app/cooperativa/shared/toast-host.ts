import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-host',
  imports: [],
  template: `
    <div class="toast-host">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast">
          <svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10" /></svg>
          {{ t.mensagem }}
        </div>
      }
    </div>
  `,
  styleUrls: ['./cooperativa-shared.css'],
})
export class ToastHost {
  protected readonly toasts = inject(ToastService);
}
