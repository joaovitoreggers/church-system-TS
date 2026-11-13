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
docker compose up -d        # Postgres (porta 5433) + Redis (porta 6379)
cp packages/api/.env.example packages/api/.env  # já aponta pro compose acima
pnpm exec nx serve api       # http://localhost:3000/api (health em /api/health)
pnpm exec nx serve web       # http://localhost:4200
```

> Angular ainda não suporta o setup de TypeScript project references do
> `@nx/js` nesta versão do Nx. Os comandos de build/generate do `web`
> precisam de `NX_IGNORE_UNSUPPORTED_TS_SETUP=true` no ambiente — já
> resolvido nos Dockerfiles e documentado aqui para quem rodar manualmente.
> Acompanhe https://github.com/angular/angular/issues/37276.

### Prisma

```bash
cd packages/api
pnpm exec prisma generate   # gera o client em src/generated/prisma
pnpm exec prisma migrate dev --name <nome>   # quando houver models (Sprint 1+)
```

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

## Estado atual (Sprint 0)

Infraestrutura e esqueleto apenas — sem lógica de negócio, autenticação ou
multi-tenancy ainda (isso é Sprint 1+). `api` expõe só `/api/health`; `web`
é a página inicial padrão do Angular.
