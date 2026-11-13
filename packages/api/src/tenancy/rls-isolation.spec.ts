import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { TenancyContextService } from './tenancy-context.service';
import { TenantPrismaService } from '../prisma/prisma-tenant.service';

/**
 * Critério de aceite do Sprint 1: prova, contra um Postgres REAL (não
 * mock), que o isolamento por tenant funciona de verdade — tanto pelo
 * client tenant-scoped da aplicação quanto por SQL direto conectado como
 * adts_app (a role restrita, sem BYPASSRLS). Reproduz exatamente o setup
 * de produção: duas roles distintas, as mesmas migrations (schema + RLS +
 * grants) que rodam em dev/produção, nenhuma simplificação.
 */
describe('Isolamento multi-tenant via RLS (Postgres real, Testcontainers)', () => {
  jest.setTimeout(180_000);

  let container: StartedPostgreSqlContainer;
  let owner: Client;
  let appRaw: Client;
  let tenancyContext: TenancyContextService;
  let tenantPrisma: TenantPrismaService;

  const APP_PASSWORD = 'adts_app';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine')
      .withUsername('adts_owner')
      .withPassword('adts_owner')
      .withDatabase('adts')
      .start();

    owner = new Client({ connectionString: container.getConnectionUri() });
    await owner.connect();

    // Mesmo conteúdo de docker/postgres/init.sql — cria a role restrita.
    await owner.query(`CREATE ROLE adts_app WITH LOGIN PASSWORD '${APP_PASSWORD}';`);
    await owner.query('GRANT CONNECT ON DATABASE adts TO adts_app;');
    await owner.query('GRANT USAGE ON SCHEMA public TO adts_app;');

    // A migration REAL do projeto (schema + RLS + grants) — não uma
    // reimplementação simplificada pro teste.
    const migrationPath = join(
      __dirname,
      '../../prisma/migrations/20261113121837_tenancy_auth_audit/migration.sql',
    );
    const migrationSql = readFileSync(migrationPath, 'utf-8');
    await owner.query(migrationSql);

    // Dados de teste: dois tenants, um User em cada — via owner, que
    // ignora RLS (é o dono das tabelas; é assim que seed/migrations
    // sempre rodam).
    await owner.query(`
      INSERT INTO "Tenant" (id, name, slug) VALUES
        ('tenant_a', 'Tenant A', 'tenant-a'),
        ('tenant_b', 'Tenant B', 'tenant-b');
      INSERT INTO "User" (id, "tenantId", email, "passwordHash") VALUES
        ('user_a', 'tenant_a', 'a@example.com', 'x'),
        ('user_b', 'tenant_b', 'b@example.com', 'x');
    `);

    const host = container.getHost();
    const port = container.getPort();
    const appConnectionString = `postgresql://adts_app:${APP_PASSWORD}@${host}:${port}/adts`;

    appRaw = new Client({ connectionString: appConnectionString });
    await appRaw.connect();

    tenancyContext = new TenancyContextService();
    tenantPrisma = new TenantPrismaService(tenancyContext, {
      get: () => appConnectionString,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  afterAll(async () => {
    await owner?.end();
    await appRaw?.end();
    await tenantPrisma?.onModuleDestroy();
    await container?.stop();
  });

  describe('pelo client tenant-scoped da aplicação (TenantPrismaService)', () => {
    it('tenant A só vê o próprio usuário', async () => {
      const users = await tenancyContext.run({ tenantId: 'tenant_a', isSuperuser: false }, () =>
        tenantPrisma.client.user.findMany({ select: { id: true } }),
      );
      expect(users).toEqual([{ id: 'user_a' }]);
    });

    it('tenant B só vê o próprio usuário (nunca o de A)', async () => {
      const users = await tenancyContext.run({ tenantId: 'tenant_b', isSuperuser: false }, () =>
        tenantPrisma.client.user.findMany({ select: { id: true } }),
      );
      expect(users).toEqual([{ id: 'user_b' }]);
    });

    it('sem contexto nenhum (bug/esquecimento) não vê NADA — default-deny', async () => {
      const users = await tenantPrisma.client.user.findMany({ select: { id: true } });
      expect(users).toEqual([]);
    });

    it('contexto explicitamente setado só pra tenant errado não enxerga o outro', async () => {
      const usersSeenByA = await tenancyContext.run({ tenantId: 'tenant_a', isSuperuser: false }, () =>
        tenantPrisma.client.user.findMany({ where: { id: 'user_b' } }),
      );
      expect(usersSeenByA).toEqual([]);
    });

    it('superuser (sem tenant) vê os dois', async () => {
      const users = await tenancyContext.run({ tenantId: null, isSuperuser: true }, () =>
        tenantPrisma.client.user.findMany({ select: { id: true }, orderBy: { id: 'asc' } }),
      );
      expect(users).toEqual([{ id: 'user_a' }, { id: 'user_b' }]);
    });
  });

  describe('direto via SQL, conectado como adts_app (sem passar pelo Prisma)', () => {
    it('tenant A só vê o próprio usuário', async () => {
      await appRaw.query(`SELECT set_config('app.current_tenant_id', 'tenant_a', false)`);
      await appRaw.query(`SELECT set_config('app.is_superuser', 'false', false)`);
      const result = await appRaw.query('SELECT id FROM "User" ORDER BY id');
      expect(result.rows).toEqual([{ id: 'user_a' }]);
    });

    it('tenant B só vê o próprio usuário', async () => {
      await appRaw.query(`SELECT set_config('app.current_tenant_id', 'tenant_b', false)`);
      const result = await appRaw.query('SELECT id FROM "User" ORDER BY id');
      expect(result.rows).toEqual([{ id: 'user_b' }]);
    });

    it('sessão nova, nunca setada, não vê nada', async () => {
      const fresh = new Client({
        connectionString: `postgresql://adts_app:${APP_PASSWORD}@${container.getHost()}:${container.getPort()}/adts`,
      });
      await fresh.connect();
      try {
        const result = await fresh.query('SELECT id FROM "User" ORDER BY id');
        expect(result.rows).toEqual([]);
      } finally {
        await fresh.end();
      }
    });

    it('adts_app não consegue DDL (não é dono de nada)', async () => {
      await expect(appRaw.query('ALTER TABLE "User" ADD COLUMN hacked BOOLEAN')).rejects.toThrow();
    });

    it('adts_owner (dono da tabela) ignora RLS e vê tudo mesmo sem contexto', async () => {
      const result = await owner.query('SELECT id FROM "User" ORDER BY id');
      expect(result.rows).toEqual([{ id: 'user_a' }, { id: 'user_b' }]);
    });
  });
});
