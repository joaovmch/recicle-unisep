/** Erros lançados pelos gatilhos do banco (raise exception → P0001) já vêm em português claro. */
export function mensagemDoBanco(error: { code?: string; message: string }, padrao: string): string {
  return error.code === 'P0001' ? error.message : padrao;
}
