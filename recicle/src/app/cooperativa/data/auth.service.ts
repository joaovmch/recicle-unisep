import { Injectable, computed, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from '../../supabase.service';
import { CooperativaService } from './cooperativa.service';

function traduzirErro(mensagem: string): string {
  if (mensagem.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (mensagem.includes('User already registered')) return 'Já existe uma conta com esse e-mail.';
  return mensagem;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly client = inject(SupabaseService).client;
  private readonly cooperativaService = inject(CooperativaService);

  private readonly _sessao = signal<Session | null>(null);
  readonly autenticado = computed(() => this._sessao() !== null);

  constructor() {
    this.client.auth.getSession().then(({ data }) => this._sessao.set(data.session));
    this.client.auth.onAuthStateChange((_evento, sessao) => this._sessao.set(sessao));
  }

  async entrar(email: string, senha: string): Promise<string | null> {
    const { error } = await this.client.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) return traduzirErro(error.message);

    await this.cooperativaService.carregar();
    return null;
  }

  async sair(): Promise<void> {
    await this.client.auth.signOut();
    this.cooperativaService.limpar();
  }

  async sessaoAtual(): Promise<Session | null> {
    const { data } = await this.client.auth.getSession();
    return data.session;
  }

  async enviarLinkRecuperacao(email: string): Promise<string | null> {
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim());
    return error ? traduzirErro(error.message) : null;
  }
}
