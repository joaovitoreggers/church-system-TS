/**
 * Mesma ideia do `django.utils.text.slugify` usado em `cadastro_step1`:
 * normaliza acentos (NFD + remove diacríticos), baixa pra minúsculo, troca
 * qualquer sequência de não-alfanumérico por um único hífen e tira hífens
 * nas pontas.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
