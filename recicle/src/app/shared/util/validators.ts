export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Abaixo de 8 caracteres não é recomendado (OWASP / guia de senhas do Supabase). */
export const SENHA_MIN_CARACTERES = 8;

/** "08:30" ou "08:30:00" (como o Postgres devolve colunas `time`). */
export const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/**
 * Validade da licença é digitada como "MM/AAAA". Aceita também "AAAA-MM-DD" por
 * compatibilidade. Devolve null para qualquer coisa fora disso (ex.: "102026").
 */
export function lerMesAno(texto: string | null | undefined): { mes: number; ano: number } | null {
  const t = (texto ?? '').trim();
  const m = t.match(/^(\d{1,2})\/(\d{4})$/) ?? t.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!m) return null;
  const [mes, ano] = t.includes('/') ? [Number(m[1]), Number(m[2])] : [Number(m[2]), Number(m[1])];
  return mes >= 1 && mes <= 12 && ano >= 1900 ? { mes, ano } : null;
}

/** A licença vale até o último dia do mês informado. */
export function licencaVencida(validade: { mes: number; ano: number }, agora = new Date()): boolean {
  return new Date(validade.ano, validade.mes, 1).getTime() <= agora.getTime();
}

/** As 27 UFs. Campo livre com maxlength=2 transformava "Paraná" em "PA" (Pará) sem aviso. */
export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export function ufValida(uf: string): boolean {
  return (UFS as readonly string[]).includes(uf.trim().toUpperCase());
}
