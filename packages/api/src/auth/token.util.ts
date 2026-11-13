import { createHash, randomBytes } from 'node:crypto';

/** Gera um token opaco (refresh / reset de senha) — só o hash é persistido. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

/** Hash determinístico pra comparar token recebido com o que está no banco. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
