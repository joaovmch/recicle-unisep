import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../data/auth.service';

const DESTAQUES = [
  { texto: 'Só pedidos do que vocês aceitam', icone: 'chat' },
  { texto: 'Dentro do raio que vocês definem', icone: 'pin' },
  { texto: 'Pagamento direto na retirada, sem taxa', icone: 'money' },
];

@Component({
  selector: 'app-entrar',
  imports: [RouterLink],
  templateUrl: './entrar.html',
  styleUrls: ['../../shared/cooperativa-shared.css', './entrar.css'],
})
export class Entrar {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly destaques = DESTAQUES;

  readonly emailOuCnpj = signal('');
  readonly senha = signal('');
  readonly senhaVisivel = signal(false);
  readonly continuarConectado = signal(true);

  readonly erro = signal<string | null>(null);

  readonly modalRecuperarAberto = signal(false);
  readonly emailRecuperacao = signal('');
  readonly linkEnviado = signal(false);

  entrar(): void {
    const sucesso = this.auth.entrar(this.emailOuCnpj(), this.senha(), this.continuarConectado());

    if (!sucesso) {
      this.erro.set('E-mail ou senha incorretos.');
      return;
    }

    this.erro.set(null);
    this.router.navigate(['/cooperativa/dashboard']);
  }

  abrirRecuperarSenha(): void {
    this.emailRecuperacao.set(this.emailOuCnpj().includes('@') ? this.emailOuCnpj() : '');
    this.linkEnviado.set(false);
    this.modalRecuperarAberto.set(true);
  }

  fecharRecuperarSenha(): void {
    this.modalRecuperarAberto.set(false);
  }

  enviarLinkRecuperacao(): void {
    if (!this.emailRecuperacao().trim()) return;
    this.linkEnviado.set(true);
  }
}
