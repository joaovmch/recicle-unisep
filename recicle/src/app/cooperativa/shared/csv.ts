function escaparCampo(valor: unknown): string {
  const texto = String(valor ?? '');
  return /[",;\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function baixarCsv(nomeArquivo: string, cabecalho: string[], linhas: unknown[][]): void {
  const conteudo = [cabecalho, ...linhas].map(linha => linha.map(escaparCampo).join(';')).join('\n');
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}
