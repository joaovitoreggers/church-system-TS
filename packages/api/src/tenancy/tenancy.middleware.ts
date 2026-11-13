import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { TenancyContextService } from './tenancy-context.service';
import { AccessTokenPayload } from '../auth/token.types';

// Caminhos que não exigem autenticação. Checado contra req.originalUrl
// (sem query string) — dentro de uma middleware global
// (consumer.apply().forRoutes('*')), req.path/req.url vêm relativos a
// onde o Nest montou o router internamente (aqui, vazio: "/"), só
// req.originalUrl preserva o caminho completo de verdade. Confirmado
// rodando de verdade com um log antes de generalizar (req.path chegou a
// imprimir "/" pra "/api/health"). Mantido como lista explícita simples —
// dá pra evoluir pra um decorator @Public() + Reflector se isso crescer,
// mas middleware não tem acesso fácil a metadata de rota como um Guard
// tem.
const PUBLIC_PATHS = [
  '/api/health',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/password-reset/request',
  '/api/auth/password-reset/confirm',
  '/api/onboarding/signup', // criação de tenant — rate-limitado no próprio controller (ver onboarding.controller.ts)
];

/**
 * Faz DUAS coisas de propósito na mesma middleware, nessa ordem:
 *  1. Valida o JWT de acesso e popula req.user.
 *  2. Estabelece o contexto de tenant (AsyncLocalStorage) ANTES de chamar
 *     next() — é só assim que ele cobre Guards, Interceptors e o handler
 *     em si (Guards rodam antes de Interceptors no Nest; se o contexto só
 *     fosse estabelecido num Interceptor, um Guard como o PoliciesGuard,
 *     que também precisa ler o banco pra resolver permissões, rodaria
 *     SEM contexto nenhum).
 *
 * tenantId/isSuperuser vêm SEMPRE do payload do JWT já validado — nunca de
 * query param, header customizado ou body. É isso que fecha a classe de
 * IDOR que existia no sistema original.
 */
@Injectable()
export class TenancyMiddleware implements NestMiddleware {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly tenancyContext: TenancyContextService,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const path = req.originalUrl.split('?')[0];
    if (PUBLIC_PATHS.includes(path)) {
      return this.tenancyContext.run({ tenantId: null, isSuperuser: false }, next);
    }

    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    if (!token) {
      res.status(401).json({ message: 'Token de acesso ausente.' });
      return;
    }

    let payload: AccessTokenPayload;
    try {
      payload = this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      res.status(401).json({ message: 'Token de acesso inválido ou expirado.' });
      return;
    }

    (req as Request & { user?: AccessTokenPayload }).user = payload;

    this.tenancyContext.run(
      { tenantId: payload.tenantId, isSuperuser: payload.isSuperuser },
      next,
    );
  }
}
