import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../supabase.service';

export interface Admin {
  id: string;
  userId: string;
  nome: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly client = inject(SupabaseService).client;

  private readonly _admin = signal<Admin | null>(null);
  readonly admin = this._admin.asReadonly();

  /** Busca (ou recarrega) o admin ligado ao usuário autenticado no momento. */
  async carregar(): Promise<Admin | null> {
    const { data: sessao } = await this.client.auth.getSession();
    const userId = sessao.session?.user.id;
    if (!userId) {
      this._admin.set(null);
      return null;
    }

    const { data } = await this.client.from('admins').select('*').eq('user_id', userId).maybeSingle();
    const admin = data ? { id: data.id, userId: data.user_id, nome: data.nome, email: data.email } : null;

    this._admin.set(admin);
    return admin;
  }

  limpar(): void {
    this._admin.set(null);
  }
}
