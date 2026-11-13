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

    // Também aplica a migration que estende RLS pras 4 tabelas restantes
    // (Tenant/UserRole/RefreshToken/PasswordReset) — mesma lógica: migration
    // real do projeto, não reimplementada aqui.
    const migration2Path = join(
      __dirname,
      '../../prisma/migrations/20261113205325_rls_remaining_tables/migration.sql',
    );
    await owner.query(readFileSync(migration2Path, 'utf-8'));

    // E a migration do Sprint 2 (colunas novas em Tenant/User) — o Prisma
    // Client gerado a partir do schema.prisma ATUAL já espera essas
    // colunas em qualquer query de User/Tenant, mesmo que este teste não
    // as exercite diretamente.
    const migration3Path = join(
      __dirname,
      '../../prisma/migrations/20261113210429_sprint2_branding_users/migration.sql',
    );
    await owner.query(readFileSync(migration3Path, 'utf-8'));

    // Dados de teste: dois tenants, um User em cada, mais Role/UserRole/
    // RefreshToken/PasswordReset por tenant — via owner, que ignora RLS (é
    // o dono das tabelas; é assim que seed/migrations sempre rodam).
    await owner.query(`
      INSERT INTO "Tenant" (id, name, slug) VALUES
        ('tenant_a', 'Tenant A', 'tenant-a'),
        ('tenant_b', 'Tenant B', 'tenant-b');
      INSERT INTO "User" (id, "tenantId", email, "passwordHash") VALUES
        ('user_a', 'tenant_a', 'a@example.com', 'x'),
        ('user_b', 'tenant_b', 'b@example.com', 'x');
      INSERT INTO "Role" (id, "tenantId", name, permissions) VALUES
        ('role_a', 'tenant_a', 'admin', ARRAY[]::TEXT[]),
        ('role_b', 'tenant_b', 'admin', ARRAY[]::TEXT[]);
      INSERT INTO "UserRole" ("userId", "roleId") VALUES
        ('user_a', 'role_a'),
        ('user_b', 'role_b');
      INSERT INTO "RefreshToken" (id, "userId", "tokenHash", "expiresAt") VALUES
        ('rt_a', 'user_a', 'hash_a', now() + interval '1 day'),
        ('rt_b', 'user_b', 'hash_b', now() + interval '1 day');
      INSERT INTO "PasswordReset" (id, "userId", "tokenHash", "expiresAt") VALUES
        ('pr_a', 'user_a', 'phash_a', now() + interval '1 day'),
        ('pr_b', 'user_b', 'phash_b', now() + interval '1 day');
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

  describe('RLS estendido (Tenant via id próprio; UserRole/RefreshToken/PasswordReset via EXISTS em User)', () => {
    it('Tenant: tenant A só vê a própria linha (nunca enumera B)', async () => {
      const tenants = await tenancyContext.run({ tenantId: 'tenant_a', isSuperuser: false }, () =>
        tenantPrisma.client.tenant.findMany({ select: { id: true } }),
      );
      expect(tenants).toEqual([{ id: 'tenant_a' }]);
    });

    it('Tenant: superuser vê os dois', async () => {
      const tenants = await tenancyContext.run({ tenantId: null, isSuperuser: true }, () =>
        tenantPrisma.client.tenant.findMany({ select: { id: true }, orderBy: { id: 'asc' } }),
      );
      expect(tenants).toEqual([{ id: 'tenant_a' }, { id: 'tenant_b' }]);
    });

    it('UserRole: tenant A só vê o vínculo do próprio usuário', async () => {
      const userRoles = await tenancyContext.run({ tenantId: 'tenant_a', isSuperuser: false }, () =>
        tenantPrisma.client.userRole.findMany({ select: { userId: true, roleId: true } }),
      );
      expect(userRoles).toEqual([{ userId: 'user_a', roleId: 'role_a' }]);
    });

    it('RefreshToken: tenant B só vê o próprio token (nunca o de A)', async () => {
      const tokens = await tenancyContext.run({ tenantId: 'tenant_b', isSuperuser: false }, () =>
        tenantPrisma.client.refreshToken.findMany({ select: { id: true } }),
      );
      expect(tokens).toEqual([{ id: 'rt_b' }]);
    });

    it('PasswordReset: sem contexto nenhum não vê nada — default-deny', async () => {
      const resets = await tenantPrisma.client.passwordReset.findMany({ select: { id: true } });
      expect(resets).toEqual([]);
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

    it('UserRole via EXISTS: tenant A só vê o próprio vínculo mesmo sem coluna tenantId na tabela', async () => {
      await appRaw.query(`SELECT set_config('app.current_tenant_id', 'tenant_a', false)`);
      await appRaw.query(`SELECT set_config('app.is_superuser', 'false', false)`);
      const result = await appRaw.query('SELECT "userId" FROM "UserRole" ORDER BY "userId"');
      expect(result.rows).toEqual([{ userId: 'user_a' }]);
    });

    it('Tenant via id próprio: tenant B não enumera o nome/slug de A', async () => {
      await appRaw.query(`SELECT set_config('app.current_tenant_id', 'tenant_b', false)`);
      const result = await appRaw.query('SELECT id FROM "Tenant" ORDER BY id');
      expect(result.rows).toEqual([{ id: 'tenant_b' }]);
    });
  });
});
