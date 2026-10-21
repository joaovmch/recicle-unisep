import { Component, HostListener } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHost } from './shared/ui/toast-host';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHost],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  /**
   * Esc fecha o modal aberto. Todo modal do app usa `.modal-overlay` com um clique no fundo
   * que o fecha (o `.modal-card` interno faz stopPropagation). Em vez de um tratador por
   * componente, disparamos aqui um clique no fundo do modal mais recente — fecha qualquer um
   * sem precisar registrar nada.
   */
  @HostListener('document:keydown.escape')
  fecharModalComEsc(): void {
    const overlays = document.querySelectorAll<HTMLElement>('.modal-overlay');
    const topo = overlays[overlays.length - 1];
    topo?.click();
  }
}
