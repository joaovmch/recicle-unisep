import { Injectable, inject, signal } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { SupabaseService, traduzirErroAuth } from '../../supabase.service';
import { AuthService } from '../../shared/data/auth.service';

export interface Admin {
  id: string;
  userId: string;
  nome: string;
  email: string;
  criadoEm: string;
}

function paraAdmin(row: any): Admin {
  return { id: row.id, userId: row.user_id, nome: row.nome, email: row.email, criadoEm: row.criado_em };
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly client = inject(SupabaseService).client;

  private readonly _admin = signal<Admin | null>(null);
  readonly admin = this._admin.asReadonly();

  private readonly _admins = signal<Admin[]>([]);
  readonly admins = this._admins.asReadonly();

  constructor() {
    // Mesmo padrão do CooperativaService/MoradorService: sair da conta limpa o
    // perfil carregado aqui, sem o AuthService precisar conhecer cada módulo.
    inject(AuthService).registrarLimpeza(() => this.limpar());
  }

  /** Busca (ou recarrega) o admin ligado ao usuário autenticado no momento. */
  async carregar(): Promise<Admin | null> {
    const { data: sessao } = await this.client.auth.getSession();
    const userId = sessao.session?.user.id;
    if (!userId) {
      this._admin.set(null);
      return null;
    }

    const { data } = await this.client.from('admins').select('*').eq('user_id', userId).maybeSingle();
    const admin = data ? paraAdmin(data) : null;

    this._admin.set(admin);
    return admin;
  }

  async carregarLista(): Promise<void> {
    const { data } = await this.client.from('admins').select('*').order('criado_em');
    this._admins.set((data ?? []).map(paraAdmin));
  }

  /**
   * Cria a conta de login (e-mail + senha) e a linha em public.admins de um novo admin.
   * Usa um client Supabase à parte, sem persistir sessão, porque `auth.signUp` troca a
   * sessão ativa do client que o chama — sem isso, criar um admin derrubaria quem está logado.
   */
  async criarAdmin(nome: string, email: string, senha: string): Promise<{ erro: string | null }> {
    const clienteTemporario = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error: signUpError } = await clienteTemporario.auth.signUp({
      email: email.trim(),
      password: senha,
    });
    if (signUpError || !data.user) {
      const erro = signUpError ? traduzirErroAuth(signUpError.message) : 'Não foi possível criar a conta.';
      return { erro };
    }

    const { error: insertError } = await this.client.from('admins').insert({
      user_id: data.user.id,
      nome: nome.trim(),
      email: email.trim(),
    });
    if (insertError) {
      return { erro: insertError.message };
    }

    await this.carregarLista();
    return { erro: null };
  }

  async removerAdmin(id: string): Promise<{ erro: string | null }> {
    const { error } = await this.client.from('admins').delete().eq('id', id);
    if (error) return { erro: error.message };

    await this.carregarLista();
    return { erro: null };
  }

  limpar(): void {
    this._admin.set(null);
  }
}
