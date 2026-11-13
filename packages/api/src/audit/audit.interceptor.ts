import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AUDIT_LOG_EVENT, AuditLogEvent } from './audit-log.event';
import { AccessTokenPayload } from '../auth/token.types';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const METHOD_TO_ACTION: Record<string, AuditLogEvent['action']> = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

/**
 * Cobertura automática de baseline: toda request mutante que terminar com
 * sucesso emite um evento de auditoria — não depende de cada view lembrar
 * de chamar algo (essa era a lacuna real do sistema Django original:
 * login/logout/export nunca eram logados na prática porque dependia de
 * disciplina manual). Módulos de domínio podem emitir eventos próprios,
 * mais ricos (entityType/entityId/description específicos) — este
 * interceptor garante que, no mínimo, toda mutação fica registrada.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly events: EventEmitter2) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!MUTATING_METHODS.has(req.method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((response) => {
        const user = (req as Request & { user?: AccessTokenPayload }).user;
        const entityId =
          response && typeof response === 'object' && 'id' in response
            ? String((response as { id: unknown }).id)
            : undefined;

        this.events.emit(AUDIT_LOG_EVENT, {
          tenantId: user?.tenantId ?? null,
          isSuperuser: user?.isSuperuser ?? false,
          userId: user?.sub ?? null,
          username: null,
          action: METHOD_TO_ACTION[req.method],
          entityId,
          description: `${req.method} ${req.route?.path ?? req.path}`,
          ipAddress: req.ip ?? null,
        } satisfies AuditLogEvent);
      }),
    );
  }
}
