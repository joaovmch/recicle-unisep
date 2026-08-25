export type TipoDocumentoDb =
  | 'licenca_operacao'
  | 'licenca_residuo_perigoso'
  | 'cartao_cnpj'
  | 'ata_eleicao_diretoria'
  | 'comprovante_endereco'
  | 'outro';

export type StatusDocumentoDb = 'nao_enviado' | 'em_analise' | 'validado' | 'reprovado';

export const NOME_TIPO_DOCUMENTO: Record<Exclude<TipoDocumentoDb, 'outro'>, string> = {
  licenca_operacao: 'Licença ambiental de operação',
  licenca_residuo_perigoso: 'Licença para resíduo perigoso',
  cartao_cnpj: 'Cartão CNPJ',
  ata_eleicao_diretoria: 'Ata de eleição da diretoria',
  comprovante_endereco: 'Comprovante de endereço do galpão',
};

/** Ordem fixa de exibição — sem isso, o Postgres devolve as linhas em ordem arbitrária
 * e a lista "embaralha" a cada carregamento (admin e cooperativa viam ordens diferentes). */
const ORDEM_TIPO_DOCUMENTO: TipoDocumentoDb[] = [
  'licenca_operacao',
  'licenca_residuo_perigoso',
  'cartao_cnpj',
  'ata_eleicao_diretoria',
  'comprovante_endereco',
  'outro',
];

export function ordenarPorTipoDocumento<T extends { tipo: string }>(itens: T[]): T[] {
  return [...itens].sort(
    (a, b) => ORDEM_TIPO_DOCUMENTO.indexOf(a.tipo as TipoDocumentoDb) - ORDEM_TIPO_DOCUMENTO.indexOf(b.tipo as TipoDocumentoDb)
  );
}
