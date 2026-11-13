/**
 * `sharp` é um addon nativo (binário .node + libvips compilado pra
 * plataforma) — mesmo problema do argon2 no Sprint 1 (ver
 * `auth/argon2-safe.ts`): o webpack tenta seguir/bundlar o require() dele
 * e falha tentando parsear o binário como JS ("Module parse failed:
 * Unexpected character"). `__non_webpack_require__` é a saída oficial do
 * próprio webpack pra isso: deixa esse require() intocado, exatamente como
 * um `node` puro rodaria.
 */
declare const __non_webpack_require__: ((id: string) => unknown) | undefined;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeRequire: (id: string) => typeof import('sharp') =
  typeof __non_webpack_require__ === 'function' ? __non_webpack_require__ : require;

const sharp = nodeRequire('sharp');

export default sharp;
