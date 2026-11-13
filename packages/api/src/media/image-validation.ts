import sharp from './sharp-safe';
// Tipo importado direto de 'sharp' (import type é inteiramente apagado na
// compilação — nunca gera um require() real, então nunca passa pelo
// problema de bundling nativo que o sharp-safe.ts resolve pro VALOR).
import type SharpNamespace from 'sharp';

// 5 MB — mesmo limite do Django original. Exportado pra também ser usado
// como `limits.fileSize` do Multer nos controllers (ver onboarding/users),
// rejeitando o upload ANTES de bufferizar o arquivo inteiro em memória —
// sem isso, um endpoint público aceitaria um arquivo arbitrariamente
// grande antes dessa validação sequer rodar.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BYTES = MAX_IMAGE_BYTES;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'gif', 'webp']);

export class InvalidImageError extends Error {}

/**
 * Valida que o buffer enviado é realmente uma imagem rasterizável — decodifica
 * de verdade com `sharp`, não confia em Content-Type/extensão. Mesma defesa
 * que o Django tinha (Pillow + img.verify()) contra SVG e outros formatos que
 * podem embutir script (XSS armazenado).
 */
export async function validateImage(buffer: Buffer): Promise<void> {
  if (buffer.byteLength > MAX_BYTES) {
    throw new InvalidImageError(`A imagem deve ter no máximo ${MAX_BYTES / (1024 * 1024)} MB.`);
  }

  let metadata: SharpNamespace.Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw new InvalidImageError('O arquivo enviado não é uma imagem válida.');
  }

  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
    throw new InvalidImageError('Formato de imagem não suportado. Use PNG, JPG, GIF ou WEBP.');
  }
}
