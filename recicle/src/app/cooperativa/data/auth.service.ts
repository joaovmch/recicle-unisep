import { Injectable, signal } from '@angular/core';

const CREDENCIAL = { email: 'admin@gmail.com', senha: '1234' };
const SESSAO_STORAGE_KEY = 'recicle-cooperativa-sessao';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _autenticado = signal(this.lerSessaoSalva());
  readonly autenticado = this._autenticado.asReadonly();

  entrar(email: string, senha: string, manterConectado: boolean): boolean {
    const valido = email.trim().toLowerCase() === CREDENCIAL.email && senha === CREDENCIAL.senha;
    if (!valido) return false;

    this._autenticado.set(true);
    if (manterConectado) {
      this.salvarSessao();
    }
    return true;
  }

  sair(): void {
    this._autenticado.set(false);
    this.limparSessao();
  }

  private lerSessaoSalva(): boolean {
    try {
      return localStorage.getItem(SESSAO_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private salvarSessao(): void {
    try {
      localStorage.setItem(SESSAO_STORAGE_KEY, '1');
    } catch {
      /* navegador sem localStorage disponível */
    }
  }

  private limparSessao(): void {
    try {
      localStorage.removeItem(SESSAO_STORAGE_KEY);
    } catch {
      /* navegador sem localStorage disponível */
    }
  }
}
