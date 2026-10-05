export const TAMANHO_MAXIMO_ARQUIVO_BYTES = 10 * 1024 * 1024;

export const TIPOS_ARQUIVO_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** Mesmo limite (10 MB, PDF ou imagem) configurado no bucket "documentos-cooperativa" no Supabase. */
export function erroArquivoInvalido(arquivo: File): string | null {
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO_BYTES) {
    return `${arquivo.name} passa de 10 MB. Envie um arquivo menor.`;
  }
  if (!TIPOS_ARQUIVO_PERMITIDOS.includes(arquivo.type)) {
    return `${arquivo.name} não é PDF nem imagem (JPEG, PNG ou WEBP).`;
  }
  return null;
}

export function formatarTamanhoArquivo(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
