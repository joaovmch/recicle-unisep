import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../shared/data/auth.service';
import { CooperativaService } from '../../data/cooperativa.service';
import { EMAIL_RE } from '../../../shared/util/validators';
import { ToastService } from '../../../shared/ui/toast.service';

const DESTAQUES = [
  { texto: 'Só pedidos do que vocês aceitam', icone: 'chat' },
  { texto: 'Dentro do raio que vocês definem', icone: 'pin' },
  { texto: 'Pagamento direto na retirada, sem taxa', icone: 'money' },
];

@Component({
  selector: 'app-entrar',
  imports: [RouterLink],
  templateUrl: './entrar.html',
  styleUrls: ['../../../shared/ui/design-system.css', './entrar.css'],
})
export class Entrar {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly cooperativaService = inject(CooperativaService);
  private readonly toast = inject(ToastService);

  readonly destaques = DESTAQUES;

  readonly email = signal('');
  readonly senha = signal('');
  readonly senhaVisivel = signal(false);
  readonly continuarConectado = signal(true);

  readonly erro = signal<string | null>(null);

  readonly modalRecuperarAberto = signal(false);
  readonly emailRecuperacao = signal('');
  readonly linkEnviado = signal(false);
  readonly erroRecuperacao = signal<string | null>(null);

  readonly entrando = signal(false);

  async entrar(): Promise<void> {
    if (this.entrando()) return;

    if (!this.email().trim() || !this.senha()) {
      this.erro.set('Preencha e-mail e senha.');
      return;
    }

    this.entrando.set(true);

    const erro = await this.auth.entrar(this.email(), this.senha());

    if (erro) {
      this.entrando.set(false);
      this.erro.set(erro);
      return;
    }

    // O perfil é carregado aqui (e não dentro do AuthService) para que um login de
    // admin não fique buscando dados de cooperativa sem precisar.
    const cooperativa = await this.cooperativaService.carregar();
    this.entrando.set(false);
    this.erro.set(null);

    if (!cooperativa) {
      // Conta existe (login funcionou) mas não tem cadastro de cooperativa associado —
      // acontece quando um envio anterior criou a conta mas travou antes de gravar a
      // linha (ex.: CNPJ duplicado). Manda para o formulário em vez de fingir que há
      // um cadastro em andamento.
      this.toast.mostrar('Não encontramos um cadastro de cooperativa para essa conta. Complete o formulário abaixo.');
      this.router.navigate(['/cooperativa/cadastro']);
      return;
    }

    if (cooperativa.statusCadastro !== 'aprovado') {
      this.router.navigate(['/cooperativa/cadastro/analise']);
    } else {
      this.router.navigate(['/cooperativa/dashboard']);
    }
  }

  abrirRecuperarSenha(): void {
    this.emailRecuperacao.set(this.email());
    this.linkEnviado.set(false);
    this.erroRecuperacao.set(null);
    this.modalRecuperarAberto.set(true);
  }

  fecharRecuperarSenha(): void {
    this.modalRecuperarAberto.set(false);
  }

  async enviarLinkRecuperacao(): Promise<void> {
    if (!EMAIL_RE.test(this.emailRecuperacao().trim())) {
      this.erroRecuperacao.set('Digite um e-mail válido.');
      return;
    }
    this.erroRecuperacao.set(null);
    await this.auth.enviarLinkRecuperacao(this.emailRecuperacao());
    this.linkEnviado.set(true);
  }
}
