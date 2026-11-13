/* eslint-disable */
const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: 'api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  // @nestjs/config@12 e @nestjs/event-emitter@12 publicam só ESM (sem
  // build CJS) — sem isso, o require() do Jest quebra em "Unexpected
  // token 'export'" assim que qualquer arquivo (direto ou
  // transitivamente) importa ConfigService/EventEmitter2.
  // @adts/shared-types (Sprint 2) é resolvido via symlink do pnpm workspace
  // pro .ts fonte (não tem build próprio) — precisa do mesmo tratamento,
  // senão o require() tenta carregar `export const ...` sem transform.
  transformIgnorePatterns: [
    'node_modules/\\.pnpm/(?!(@nestjs\\+config|@nestjs\\+event-emitter|@adts\\+shared-types))',
  ],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
