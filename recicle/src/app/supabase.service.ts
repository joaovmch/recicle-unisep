import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseClient, createClient, navigatorLock } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

/** Traduz as mensagens de erro mais comuns da autenticação do Supabase para português. */
export function traduzirErroAuth(mensagem: string): string {
  if (mensagem.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (mensagem.includes('User already registered')) return 'Já existe uma conta com esse e-mail.';
  if (mensagem.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.';
  const senhaCurta = mensagem.match(/Password should be at least (\d+) characters/);
  if (senhaCurta) return `A senha precisa ter pelo menos ${senhaCurta[1]} caracteres.`;
  if (mensagem.includes('Unable to validate email address')) return 'Digite um e-mail válido.';
  if (mensagem.includes('rate limit')) return 'Muitas tentativas. Aguarde um pouco antes de tentar de novo.';
  if (mensagem.includes('should be different')) return 'A nova senha precisa ser diferente da atual.';
  if (/session|jwt|reauthenticat/i.test(mensagem)) return 'Sua sessão expirou. Entre de novo e tente outra vez.';
  return mensagem;
}

const CHAVE_CONTINUAR_CONECTADO = 'recicle-continuar-conectado';

/** Marcado (padrão) = sessão no localStorage, sobrevive a fechar o navegador. */
function querContinuarConectado(): boolean {
  try {
    return localStorage.getItem(CHAVE_CONTINUAR_CONECTADO) !== 'nao';
  } catch {
    return true;
  }
}

/**
 * Guarda a escolha do "Continuar conectado" das telas de login. Precisa ser gravada antes
 * do signIn: é ela que decide em qual armazenamento a sessão nova vai cair.
 */
export function definirContinuarConectado(continuar: boolean): void {
  try {
    localStorage.setItem(CHAVE_CONTINUAR_CONECTADO, continuar ? 'sim' : 'nao');
  } catch {
    // Navegador sem storage (aba anônima restrita): segue com o padrão.
  }
}

/**
 * Faz o "Continuar conectado" valer de verdade. O Supabase grava a sessão no localStorage
 * por padrão, ou seja, ela sobrevivia a fechar o navegador mesmo com a caixa desmarcada —
 * o contrário do que o rótulo promete, e um problema em computador compartilhado. Aqui a
 * sessão vai para o sessionStorage quando a pessoa desmarca (morre junto com a aba) e para
 * o localStorage quando marca. A leitura olha os dois porque a preferência pode ter mudado
 * depois da última gravação, e toda escrita limpa o outro lado para nunca ficar cópia velha.
 */
function armazenamentoDaSessao() {
  const principal = () => (querContinuarConectado() ? localStorage : sessionStorage);
  const secundario = () => (querContinuarConectado() ? sessionStorage : localStorage);

  return {
    getItem: (chave: string): string | null => {
      try {
        return principal().getItem(chave) ?? secundario().getItem(chave);
      } catch {
        return null;
      }
    },
    setItem: (chave: string, valor: string): void => {
      try {
        secundario().removeItem(chave);
        principal().setItem(chave, valor);
      } catch {
        // Sem storage não dá para persistir — a sessão vive só em memória.
      }
    },
    removeItem: (chave: string): void => {
      try {
        localStorage.removeItem(chave);
        sessionStorage.removeItem(chave);
      } catch {
        // Nada a limpar.
      }
    },
  };
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor() {
    const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    // A sessão mora em uma única chave do localStorage ("sb-<projeto>-auth-token"), dividida
    // por todas as abas abertas no mesmo navegador. Sem trava, cada aba roda o próprio
    // temporizador de renovação (a cada 30s) e duas delas podem renovar o token ao mesmo
    // tempo: o Supabase rotaciona o refresh token, a primeira ganha e a segunda fica com um
    // token morto — que é a conta "caindo sozinha" depois de um tempo com duas abas abertas.
    // navigatorLock serializa isso entre abas (navigator.locks não existe no SSR nem em
    // navegadores antigos, daí a checagem).
    const travaEntreAbas = isBrowser && typeof navigator !== 'undefined' && 'locks' in navigator;

    this.client = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        persistSession: isBrowser,
        autoRefreshToken: isBrowser,
        detectSessionInUrl: isBrowser,
        ...(isBrowser ? { storage: armazenamentoDaSessao() } : {}),
        ...(travaEntreAbas ? { lock: navigatorLock } : {}),
      },
    });
  }
}
