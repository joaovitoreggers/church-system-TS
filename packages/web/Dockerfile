# Build context: a raiz do monorepo (não esta pasta) — é um app Nx, precisa
# do workspace inteiro. No EasyPanel: Service "web", build context = raiz do
# repo, Dockerfile path = packages/web/Dockerfile.

FROM node:24-alpine AS build
RUN corepack enable && corepack prepare pnpm@12.18.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ENV NX_IGNORE_UNSUPPORTED_TS_SETUP=true
RUN pnpm exec nx run web:build:production

FROM nginx:alpine AS runtime
COPY --from=build /app/dist/packages/web/browser /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
