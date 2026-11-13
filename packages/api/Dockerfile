# Build context: a raiz do monorepo (não esta pasta) — é um app Nx, precisa
# do workspace inteiro (package.json raiz, pnpm-lock.yaml, demais packages).
# No EasyPanel: Service "api", build context = raiz do repo, Dockerfile path
# = packages/api/Dockerfile.

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN corepack prepare pnpm@12.18.0 --activate \
  && pnpm install --frozen-lockfile
ENV NX_IGNORE_UNSUPPORTED_TS_SETUP=true
RUN pnpm exec nx run api:build:production \
  && pnpm exec nx run api:prune

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/packages/api/dist ./
RUN corepack prepare pnpm@12.18.0 --activate \
  && pnpm install --prod --frozen-lockfile
EXPOSE 3000
CMD ["node", "main.js"]
