export const AUDIT_LOG_EVENT = 'audit.log';

/**
 * Payload autocontido: carrega tenantId/isSuperuser explicitamente porque o
 * listener roda fora da pilha de chamadas da request original (EventEmitter2
 * não propaga o AsyncLocalStorage da request) — ele precisa reabrir o
 * próprio contexto de tenant pra conseguir gravar no AuditLog (que tem RLS).
 */
export interface AuditLogEvent {
  tenantId: string | null;
  isSuperuser: boolean;
  userId: string | null;
  username: string | null;
  action: 'create' | 'update' | 'delete' | 'login' | 'logout' | 'view' | 'export';
  entityType?: string;
  entityId?: string;
  entityRepr?: string;
  description?: string;
  ipAddress?: string | null;
}
