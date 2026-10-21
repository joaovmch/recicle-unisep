export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Id de linha do banco. Id que não é UUID (URL digitada, link quebrado) nem vai ao Supabase, que responderia 400. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Nome de pessoa ou organização: cabe em cartão, lista e cabeçalho sem estourar o layout. */
export const NOME_MAX_CARACTERES = 80;

/**
 * Telefone brasileiro com DDD — 10 dígitos (fixo) ou 11 (celular), com ou sem +55 e
 * máscara. Antes qualquer texto passava ("abcdefgh" ficava salvo como telefone).
 */
export function telefoneValido(texto: string): boolean {
  const t = texto.trim();
  if (!/^[\d\s()+.-]+$/.test(t)) return false;
  const digitos = t.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  return digitos.length === 10 || digitos.length === 11;
}

/** Abaixo de 8 caracteres não é recomendado (OWASP / guia de senhas do Supabase). */
export const SENHA_MIN_CARACTERES = 8;

/** O Supabase (bcrypt) usa só os primeiros 72 bytes; acima disso o resto é ignorado. */
export const SENHA_MAX_CARACTERES = 72;

/**
 * Valida a senha e devolve a mensagem de erro, ou null se estiver boa. Além do tamanho,
 * recusa senha formada só por espaços (passava na contagem de 8 caracteres).
 */
export function erroSenha(senha: string): string | null {
  if (senha.length < SENHA_MIN_CARACTERES) return `A senha precisa ter pelo menos ${SENHA_MIN_CARACTERES} caracteres.`;
  if (senha.length > SENHA_MAX_CARACTERES) return `A senha pode ter no máximo ${SENHA_MAX_CARACTERES} caracteres.`;
  if (!senha.trim()) return 'A senha não pode ser só espaços.';
  return null;
}

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

/**
 * Nome de pessoa conforme a seção 5.2 do documento de requisitos: 3 a 100 caracteres,
 * apenas letras e espaços, e exige nome e sobrenome.
 */
export const NOME_PESSOA_MIN = 3;
export const NOME_PESSOA_MAX = 100;

export function nomePessoaValido(texto: string): boolean {
  const t = texto.trim().replace(/\s+/g, ' ');
  if (t.length < NOME_PESSOA_MIN || t.length > NOME_PESSOA_MAX) return false;
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' ]+$/.test(t)) return false;
  return t.split(' ').filter(p => p.length >= 2).length >= 2;
}

/**
 * Placa no padrão Mercosul (AAA-0A00) ou no antigo (AAA-0000). Veículos de uso urbano
 * sem emplacamento são registrados como "sem placa" (US12 FA03).
 */
export const SEM_PLACA = 'sem placa';

export function normalizarPlaca(texto: string): string {
  const t = texto.trim();
  if (!t || t.toLowerCase() === SEM_PLACA) return SEM_PLACA;
  return t.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]{3})(.*)$/, '$1-$2');
}

export function placaValida(texto: string): boolean {
  const placa = normalizarPlaca(texto);
  if (placa === SEM_PLACA) return true;
  return /^[A-Z]{3}-\d[A-Z]\d{2}$/.test(placa) || /^[A-Z]{3}-\d{4}$/.test(placa);
}
