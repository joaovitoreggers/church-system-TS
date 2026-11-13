import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenancyContext {
  tenantId: string | null;
  isSuperuser: boolean;
}

/**
 * Propaga tenantId/isSuperuser pela árvore de chamadas de uma request via
 * AsyncLocalStorage — nunca via query param/header (isso é o que evita o
 * IDOR: o contexto só pode vir do payload do JWT já validado, setado uma
 * vez por request em TenancyInterceptor).
 */
@Injectable()
export class TenancyContextService {
  private readonly als = new AsyncLocalStorage<TenancyContext>();

  run<T>(context: TenancyContext, fn: () => T): T {
    return this.als.run(context, fn);
  }

  get(): TenancyContext | undefined {
    return this.als.getStore();
  }
}
