import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../data/auth.service';
import { CooperativaService } from '../../data/cooperativa.service';

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
  private readonly cooperativaService = inject(CooperativaService);

  readonly destaques = DESTAQUES;

  readonly emailOuCnpj = signal('');
  readonly senha = signal('');
  readonly senhaVisivel = signal(false);
  readonly continuarConectado = signal(true);

  readonly erro = signal<string | null>(null);

  readonly modalRecuperarAberto = signal(false);
  readonly emailRecuperacao = signal('');
  readonly linkEnviado = signal(false);

  readonly entrando = signal(false);

  async entrar(): Promise<void> {
    if (this.entrando()) return;
    this.entrando.set(true);

    const erro = await this.auth.entrar(this.emailOuCnpj(), this.senha());

    this.entrando.set(false);

    if (erro) {
      this.erro.set(erro);
      return;
    }

    this.erro.set(null);
    const cooperativa = this.cooperativaService.cooperativa();
    if (cooperativa && cooperativa.statusCadastro !== 'aprovado') {
      this.router.navigate(['/cooperativa/cadastro/analise']);
    } else {
      this.router.navigate(['/cooperativa/dashboard']);
    }
  }

  abrirRecuperarSenha(): void {
    this.emailRecuperacao.set(this.emailOuCnpj().includes('@') ? this.emailOuCnpj() : '');
    this.linkEnviado.set(false);
    this.modalRecuperarAberto.set(true);
  }

  fecharRecuperarSenha(): void {
    this.modalRecuperarAberto.set(false);
  }

  async enviarLinkRecuperacao(): Promise<void> {
    if (!this.emailRecuperacao().trim()) return;
    await this.auth.enviarLinkRecuperacao(this.emailRecuperacao());
    this.linkEnviado.set(true);
  }
}
