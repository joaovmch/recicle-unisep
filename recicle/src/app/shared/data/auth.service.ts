import { Injectable, inject } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService, traduzirErroAuth } from '../../supabase.service';

/**
 * Autenticação pura — só fala com o Supabase Auth. Quem carrega o perfil depois do
 * login é cada módulo (cooperativa, morador, admin), porque um login de admin não
 * tem por que buscar dados de cooperativa, e vice-versa.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly client = inject(SupabaseService).client;

  /** Perfis a limpar no logout — cada módulo registra o seu ao ser carregado. */
  private readonly aoSair: (() => void)[] = [];

  registrarLimpeza(limpar: () => void): void {
    if (!this.aoSair.includes(limpar)) this.aoSair.push(limpar);
  }

  async entrar(email: string, senha: string): Promise<string | null> {
    const { error } = await this.client.auth.signInWithPassword({ email: email.trim(), password: senha });
    return error ? traduzirErroAuth(error.message) : null;
  }

  /**
   * `metadados` vai para raw_user_meta_data — é por ele que o gatilho do banco cria o
   * perfil (ex.: { tipo: 'morador', nome }) no mesmo instante da conta, sem uma segunda
   * chamada que poderia falhar e deixar a conta de login órfã.
   */
  async criarConta(
    email: string,
    senha: string,
    metadados?: Record<string, string>
  ): Promise<{ erro: string | null; userId: string | null; jaExiste: boolean; comSessao: boolean }> {
    const { data, error } = await this.client.auth.signUp({
      email: email.trim(),
      password: senha,
      options: metadados ? { data: metadados } : undefined,
    });
    if (error) {
      const jaExiste = /already registered/i.test(error.message);
      return { erro: traduzirErroAuth(error.message), userId: null, jaExiste, comSessao: false };
    }
    return { erro: null, userId: data.user?.id ?? null, jaExiste: false, comSessao: !!data.session };
  }

  /** `global` encerra a sessão em todos os dispositivos, não só neste navegador. */
  async sair(global = false): Promise<void> {
    await this.client.auth.signOut(global ? { scope: 'global' } : undefined);
    for (const limpar of this.aoSair) limpar();
  }

  async sessaoAtual(): Promise<Session | null> {
    const { data } = await this.client.auth.getSession();
    return data.session;
  }

  async enviarLinkRecuperacao(email: string): Promise<string | null> {
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim());
    return error ? traduzirErroAuth(error.message) : null;
  }
}
