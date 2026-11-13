import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenancyContextService } from '../tenancy/tenancy-context.service';
import { TenantPrismaService } from '../prisma/prisma-tenant.service';
import { AUDIT_LOG_EVENT, AuditLogEvent } from './audit-log.event';

@Injectable()
export class AuditListener {
  private readonly logger = new Logger(AuditListener.name);

  constructor(
    private readonly tenancyContext: TenancyContextService,
    private readonly prisma: TenantPrismaService,
  ) {}

  @OnEvent(AUDIT_LOG_EVENT, { async: true })
  async handle(event: AuditLogEvent) {
    // Reabre o contexto explicitamente a partir do payload do evento — não
    // dá pra confiar em ALS aqui, o listener roda fora da pilha da request
    // original (ver audit-log.event.ts).
    try {
      // A policy de RLS exige "tenantId" = current_tenant_id OU
      // is_superuser='true' pra TODO insert (ver migration SQL) — uma
      // linha de auditoria sem tenant (ação de plataforma, ou request
      // pública onde ainda não há usuário autenticado) nunca vai
      // satisfazer a primeira parte (NULL = qualquer coisa nunca é
      // verdadeiro em SQL), então precisa do bypass de superuser pra essa
      // escrita especificamente — independente de quem praticou a ação
      // original ser ou não superusuário.
      const writeContext = {
        tenantId: event.tenantId,
        isSuperuser: event.isSuperuser || event.tenantId === null,
      };
      await this.tenancyContext.run(
        writeContext,
        () =>
          this.prisma.client.auditLog.create({
            data: {
              tenantId: event.tenantId,
              userId: event.userId,
              username: event.username,
              action: event.action,
              entityType: event.entityType,
              entityId: event.entityId,
              entityRepr: event.entityRepr,
              description: event.description,
              ipAddress: event.ipAddress,
            },
          }),
      );
    } catch (err) {
      // Auditoria nunca pode derrubar a aplicação — loga e segue.
      this.logger.error('Falha ao persistir AuditLog', err as Error);
    }
  }
}
