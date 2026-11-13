/**
 * argon2 é um addon nativo (binário .node compilado pra plataforma). O
 * loader dele (node-gyp-build) detecta que está rodando dentro de um
 * bundle webpack e tenta resolver o binário relativo a `dist/` em vez da
 * pasta real do pacote em node_modules, e falha ("No native build was
 * found... loaded from: .../dist"). __non_webpack_require__ é a saída
 * oficial do próprio webpack pra isso: deixa o require intocado (sem
 * externals, sem reescrita de path), exatamente como um `node` puro
 * rodaria — foi assim que validamos que funciona antes de generalizar.
 */
declare const __non_webpack_require__: ((id: string) => unknown) | undefined;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeRequire: (id: string) => typeof import('argon2') =
  typeof __non_webpack_require__ === 'function' ? __non_webpack_require__ : require;

const argon2 = nodeRequire('argon2');

export default argon2;
