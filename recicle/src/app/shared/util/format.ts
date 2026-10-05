export function formatarPreco(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

/** Data de hoje no formato que o Postgres espera para colunas `date` (AAAA-MM-DD, no fuso local). */
export function hojeISO(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
}
