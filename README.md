# adTSsystem

Reescrita do sistema de gestão eclesiástica (hoje em Django) em NestJS +
Angular. Monorepo Nx, deploy inicial no EasyPanel.

## Estrutura

```
packages/
  api/                 NestJS — API
  web/                 Angular (standalone + signals) — painel administrativo
  shared-types/        tipos compartilhados entre api e web
  shared-validation/   schemas de validação (Zod) compartilhados
```

## Rodando localmente

```bash
corepack enable
pnpm install
docker compose up -d        # Postgres (porta 5434, 2 roles — ver abaixo) + Redis (6379)
cp packages/api/.env.example packages/api/.env  # já aponta pro compose acima
cd packages/api && pnpm exec prisma generate && pnpm exec prisma migrate dev && cd ../..
pnpm exec nx serve api       # http://localhost:3000/api (health em /api/health)
pnpm exec nx serve web       # http://localhost:4200
```

> Angular ainda não suporta o setup de TypeScript project references do
> `@nx/js` nesta versão do Nx. Os comandos de build/generate do `web`
> precisam de `NX_IGNORE_UNSUPPORTED_TS_SETUP=true` no ambiente — já
> resolvido nos Dockerfiles e documentado aqui para quem rodar manualmente.
> Acompanhe https://github.com/angular/angular/issues/37276.

### Multi-tenancy via Row Level Security — duas roles, não uma

- `adts_owner` — dona das tabelas, usada SÓ por `prisma migrate`/seed
  (`DATABASE_URL`). Ignora RLS (é o comportamento padrão do Postgres pro
  dono de uma tabela).
- `adts_app` — role restrita (só `SELECT/INSERT/UPDATE/DELETE`, sem
  privilégio de owner), usada pela API em runtime (`RUNTIME_DATABASE_URL`).
  Criada em [`docker/postgres/init.sql`](docker/postgres/init.sql); os
  `GRANT`s nas tabelas de negócio ficam dentro da própria migration SQL que
  as cria (ela só roda depois que as tabelas já existem).
- **Nunca** use `DATABASE_URL` (owner) para servir requisições — RLS não
  isola nada se a conexão em runtime for a dona das tabelas.
- Em produção (EasyPanel), isso precisa ser replicado manualmente no
  Postgres gerenciado por ele — não tem como automatizar por fora: conecte
  como owner no banco criado pelo template do EasyPanel e rode o conteúdo
  de `docker/postgres/init.sql` uma vez, depois `prisma migrate deploy`.

`tenantId`/`isSuperuser` chegam ao Postgres via `set_config(..., true)`
(local à transação) logo antes de cada query, setados a partir do payload
do JWT já validado — nunca de query param/header. Ver
[`prisma-tenant.service.ts`](packages/api/src/prisma/prisma-tenant.service.ts)
para o mecanismo exato (inclui uma observação importante sobre
AsyncLocalStorage não sobreviver a uma leitura de dentro do hook
`$allOperations` do Prisma — por isso o contexto é lido num getter, antes
de entrar no Prisma, não re-lido de dentro do hook).

Teste de isolamento cross-tenant contra Postgres real (Testcontainers,
critério de aceite do Sprint 1):

```bash
cd packages/api && pnpm exec jest --config jest.config.cts --testPathPatterns=rls-isolation
```

### Prisma

```bash
cd packages/api
pnpm exec prisma generate   # gera o client em src/generated/prisma
pnpm exec prisma migrate dev --name <nome>
```

### Autenticação

`POST /api/auth/login`, `/refresh`, `/logout`, `/password-reset/request`,
`/password-reset/confirm`. Access token (15min) no corpo da resposta;
refresh token (30 dias, rotativo a cada uso) em cookie `httpOnly`. Senhas
com `argon2`. JWT nunca carrega permissões — elas são sempre resolvidas do
banco a cada request (`PoliciesGuard` + CASL), pra uma permissão revogada
não continuar valendo até o token expirar.

> `argon2` é um addon nativo; o loader dele detecta bundle webpack e
> resolve o binário relativo a `dist/` em vez do pacote real, e falha. Ver
> [`argon2-safe.ts`](packages/api/src/auth/argon2-safe.ts) — usa
> `__non_webpack_require__`, a saída oficial do webpack pra isso.

## Deploy (EasyPanel)

Cada app é um Dockerfile próprio, pensado para ser um **Service** separado
no EasyPanel, todos apontando para este mesmo repositório:

| Service | Build context | Dockerfile |
|---|---|---|
| `api` | raiz do repo | `packages/api/Dockerfile` |
| `web` | raiz do repo | `packages/web/Dockerfile` |

Postgres e Redis em produção usam os **templates prontos do EasyPanel**
(não os do `docker-compose.yml`, que é só para desenvolvimento local) — crie
um serviço de banco e um de Redis pela própria UI dele e aponte
`DATABASE_URL` / `REDIS_URL` do Service `api` para eles. SSL e domínio
também são gerenciados pelo EasyPanel (Traefik + Let's Encrypt).

## Estado atual (Sprint 1)

Núcleo transversal completo: tenancy via RLS (duas roles), auth
(JWT access/refresh, argon2, rotação, reset de senha), CASL (ability
factory + `PoliciesGuard`/`@CheckPolicies()`) e auditoria automática
(interceptor global + `@nestjs/event-emitter`, sem depender de chamada
manual por view). Ainda sem módulos de negócio nem ACL de recurso (ex.:
liderança de departamento) — isso é sprint futuro. `web` continua só a
página inicial padrão do Angular.
