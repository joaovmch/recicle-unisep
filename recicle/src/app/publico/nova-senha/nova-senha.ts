import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../shared/data/auth.service';
import { SupabaseService, traduzirErroAuth } from '../../supabase.service';
import { MoradorService } from '../../morador/data/morador.service';
import { CooperativaService } from '../../cooperativa/data/cooperativa.service';
import { ToastService } from '../../shared/ui/toast.service';
import { SENHA_MIN_CARACTERES } from '../../shared/util/validators';

type Estado = 'verificando' | 'pronto' | 'linkInvalido';

/**
 * Quando o link de recuperação falha, o Supabase devolve o motivo no fragmento da URL
 * (#error=...&error_description=...) e o deixa lá — por isso dá para ler aqui e trocar o
 * aviso genérico por um que diz o que aconteceu de fato.
 */
function erroDoFragmento(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const descricao = params.get('error_description');
  if (!descricao && !params.get('error')) return null;

  if (params.get('error_code') === 'otp_expired' || /expired/i.test(descricao ?? '')) {
    return 'Esse link já expirou. Peça um novo para continuar.';
  }
  return 'Esse link não é mais válido. Peça um novo para continuar.';
}

@Component({
  selector: 'app-nova-senha',
  imports: [RouterLink],
  templateUrl: './nova-senha.html',
  styleUrls: ['../../shared/ui/design-system.css', './nova-senha.css'],
})
export class NovaSenha {
  private readonly auth = inject(AuthService);
  private readonly client = inject(SupabaseService).client;
  private readonly moradorService = inject(MoradorService);
  private readonly cooperativaService = inject(CooperativaService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly estado = signal<Estado>('verificando');
  readonly senha = signal('');
  readonly confirmacao = signal('');
  readonly erro = signal<string | null>(null);
  readonly salvando = signal(false);
  readonly senhaMinima = SENHA_MIN_CARACTERES;

  constructor() {
    this.verificarLink();
  }

  /**
   * O link do e-mail chega como /nova-senha#access_token=...&type=recovery. Quem lê esse
   * fragmento e cria a sessão de recuperação é o próprio cliente do Supabase, na sua
   * inicialização (detectSessionInUrl). getSession() espera essa inicialização terminar,
   * então basta perguntar se existe sessão: se existe, o link era válido.
   */
  private async verificarLink(): Promise<void> {
    const erroNoLink = erroDoFragmento();
    if (erroNoLink) {
      this.erro.set(erroNoLink);
      this.estado.set('linkInvalido');
      return;
    }

    const sessao = await this.auth.sessaoAtual();
    this.estado.set(sessao ? 'pronto' : 'linkInvalido');
  }

  async salvar(): Promise<void> {
    if (this.senha().length < SENHA_MIN_CARACTERES) {
      this.erro.set(`A senha precisa ter pelo menos ${SENHA_MIN_CARACTERES} caracteres.`);
      return;
    }
    if (this.senha() !== this.confirmacao()) {
      this.erro.set('A confirmação não bate com a nova senha.');
      return;
    }

    this.salvando.set(true);
    this.erro.set(null);

    const { error } = await this.client.auth.updateUser({ password: this.senha() });
    if (error) {
      this.salvando.set(false);
      this.erro.set(traduzirErroAuth(error.message));
      return;
    }

    // Mesma decisão de destino do login: a recuperação serve aos dois módulos, e só
    // depois de trocar a senha dá para saber de qual deles é a conta.
    const morador = await this.moradorService.carregar();
    const cooperativa = morador ? null : await this.cooperativaService.carregar();
    this.salvando.set(false);

    this.toast.mostrar('Senha alterada.');

    if (morador) return void this.router.navigate(['/painel']);
    if (cooperativa) return void this.router.navigate(['/cooperativa/dashboard']);
    this.router.navigate(['/entrar'], { queryParams: { aba: 'entrar' } });
  }
}
