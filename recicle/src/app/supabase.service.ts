import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
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

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor() {
    const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    this.client = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        persistSession: isBrowser,
        autoRefreshToken: isBrowser,
        detectSessionInUrl: isBrowser,
      },
    });
  }
}
