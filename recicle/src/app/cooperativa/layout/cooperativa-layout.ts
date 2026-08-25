import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastHost } from '../shared/toast-host';
import { AuthService } from '../data/auth.service';
import { CooperativaService } from '../data/cooperativa.service';

const STATUS_INFO: Record<string, { classe: string; texto: string }> = {
  aprovado: { classe: 'aprovado', texto: 'cadastro aprovado' },
  reprovado: { classe: 'reprovado', texto: 'cadastro não aprovado' },
  em_analise: { classe: 'pendente', texto: 'cadastro em andamento' },
};

@Component({
  selector: 'app-cooperativa-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ToastHost],
  templateUrl: './cooperativa-layout.html',
  styleUrls: ['../shared/cooperativa-shared.css', './cooperativa-layout.css'],
})
export class CooperativaLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cooperativaService = inject(CooperativaService);

  readonly cooperativa = this.cooperativaService.cooperativa;

  readonly statusInfo = computed(
    () => STATUS_INFO[this.cooperativa()?.statusCadastro ?? 'em_analise']
  );

  async sair(): Promise<void> {
    await this.auth.sair();
    this.router.navigate(['/cooperativa/entrar']);
  }
}
