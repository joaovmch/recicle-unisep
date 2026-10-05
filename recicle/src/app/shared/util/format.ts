export function formatarPreco(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}
