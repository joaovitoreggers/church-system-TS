import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { TenancyContextService, TenancyContext } from '../tenancy/tenancy-context.service';

/**
 * Client Prisma único do processo, conectado SEMPRE com a role restrita
 * (RUNTIME_DATABASE_URL / adts_app — nunca a owner). Toda operação passa
 * por uma transação que primeiro seta app.current_tenant_id/app.is_superuser
 * (session vars locais à transação) e só então executa a query de fato —
 * sempre usando o delegate do PRÓPRIO `tx` (a mesma conexão onde acabamos
 * de setar a sessão), nunca a função `query(args)` capturada do escopo
 * externo, que rodaria no client base, fora da transação, sem ver o
 * set_config que acabamos de fazer (validado manualmente contra o Postgres
 * real — ver relatório do Sprint 1).
 *
 * IMPORTANTE (também validado manualmente, com log, antes de generalizar):
 * ler `TenancyContextService.get()` DE DENTRO do callback `$allOperations`
 * NÃO funciona — o AsyncLocalStorage se perde especificamente na travessia
 * pro dispatch interno do Prisma (confirmado comparando dois logs: o
 * contexto certo aparecia imediatamente antes de chamar
 * `prisma.client.user.findUnique(...)`, e já errado — revertido pro
 * contexto do middleware — um passo depois, dentro do próprio
 * `$allOperations`). Por isso o getter `client` lê o contexto ANTES de
 * entrar no Prisma (em JS puro, onde AsyncLocalStorage.getStore() é
 * confiável) e o passa por CLOSURE pro `$allOperations` daquela instância
 * — nunca re-lido de dentro do hook.
 *
 * Isso significa que `client` é um getter: cada acesso (`prisma.client.user
 * .findMany()`) cria um `$extends()` novo, barato, com o contexto da
 * request ATUAL fechado por closure. Services de domínio devem sempre
 * acessar via `this.prisma.client`, nunca guardar a referência numa
 * variável de instância de longa duração (perderia a atualização por
 * request) nem instanciar um PrismaClient por conta própria — é isso que
 * torna estruturalmente impossível esquecer o escopo por tenant.
 */
@Injectable()
export class TenantPrismaService implements OnModuleDestroy {
  private readonly base: PrismaClient;

  constructor(
    private readonly tenancyContext: TenancyContextService,
    configService: ConfigService,
  ) {
    const adapter = new PrismaPg({
      connectionString: configService.get<string>('RUNTIME_DATABASE_URL'),
    });
    this.base = new PrismaClient({ adapter });
  }

  get client(): PrismaClient {
    // Lido AQUI, fora de qualquer hook do Prisma — é o único ponto onde
    // comprovadamente funciona.
    const ctx = this.tenancyContext.get();
    return this.buildScopedClient(ctx);
  }

  private buildScopedClient(ctx: TenancyContext | undefined): PrismaClient {
    return this.base.$extends({
      query: {
        $allOperations: ({ model, operation, args }) => {
          if (!model) {
            throw new Error(
              `TenantPrismaService: operação "${operation}" sem model associado não é suportada pelo client ` +
                `tenant-scoped (ex.: $queryRaw/$executeRaw fora de um model) — use o PrismaClient bruto ` +
                `explicitamente, documentando por quê, nunca por acidente.`,
            );
          }

          return this.base.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
              `SELECT set_config('app.current_tenant_id', $1, true), set_config('app.is_superuser', $2, true)`,
              ctx?.tenantId ?? '',
              ctx?.isSuperuser ? 'true' : 'false',
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (tx as any)[model][operation](args);
          });
        },
      },
    }) as PrismaClient;
  }

  onModuleDestroy() {
    return this.base.$disconnect();
  }
}
