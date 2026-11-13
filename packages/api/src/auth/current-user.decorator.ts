import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AccessTokenPayload } from './token.types';

/**
 * Lê req.user, já populado e validado pelo TenancyMiddleware a partir do
 * JWT (nunca de query param/body) — a mesma garantia anti-IDOR do
 * Sprint 1. Usar sempre isto em vez de ler req.user manualmente.
 */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AccessTokenPayload => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>();
  if (!req.user) {
    throw new Error('CurrentUser usado numa rota sem TenancyMiddleware/autenticação.');
  }
  return req.user;
});
