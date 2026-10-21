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

/**
 * "3,2 km", ou null quando a distância não é conhecida. O pedido ainda não grava
 * coordenadas, então distancia_km chega 0 — mostrar "0,0 km" fazia parecer vizinho.
 */
export function formatarDistancia(km: number | null | undefined): string | null {
  return km && km > 0 ? `${km.toFixed(1).replace('.', ',')} km` : null;
}

/** "12.345.678/0001-90". O cadastro grava o CNPJ como foi digitado — com ou sem máscara. */
export function formatarCnpj(cnpj: string | null | undefined): string {
  const d = (cnpj ?? '').replace(/\D/g, '');
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (cnpj ?? '');
}

/**
 * Junta endereço e bairro sem duplicar: pedidos antigos guardavam o endereço já com o
 * bairro no fim ("Rua X, 45 — Centro"), então só acrescenta o bairro quando ele ainda
 * não está lá.
 */
export function enderecoComBairro(endereco: string | null | undefined, bairro: string | null | undefined): string {
  const end = (endereco ?? '').trim();
  const b = (bairro ?? '').trim();
  if (!b) return end;
  const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (normal(end).endsWith(normal(b))) return end;
  return `${end} — ${b}`;
}
