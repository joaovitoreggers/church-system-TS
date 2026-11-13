import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { BadRequestException } from '@nestjs/common';
import { TenancyContextService } from '../tenancy/tenancy-context.service';
import { TenantPrismaService } from '../prisma/prisma-tenant.service';
import { ObjectStorageService } from '../media/object-storage.service';
import { UsersService } from './users.service';
import { AccessTokenPayload } from '../auth/token.types';

/**
 * Prova, contra Postgres real, que UsersService nunca deixa um tenant ver,
 * alterar ou atribuir Role de outro — mesma garantia anti-IDOR do Sprint 1
 * (rls-isolation.spec.ts), agora exercitada através do service de domínio
 * em vez de SQL cru. ObjectStorageService é stub aqui (não é o foco deste
 * teste — ver onboarding.service.spec.ts pro teste que exercita o storage
 * de verdade).
 */
describe('UsersService (integração, isolamento por tenant via RLS)', () => {
  jest.setTimeout(180_000);

  let container: StartedPostgreSqlContainer;
  let owner: Client;
  let tenancyContext: TenancyContextService;
  let tenantPrisma: TenantPrismaService;
  let users: UsersService;

  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;
  let userBId: string;
  let roleAId: string;
  let roleBId: string;

  const ctxA: AccessTokenPayload = { sub: '', tenantId: '', isSuperuser: false, jti: 'x' };
  const ctxB: AccessTokenPayload = { sub: '', tenantId: '', isSuperuser: false, jti: 'x' };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine')
      .withUsername('adts_owner')
      .withPassword('adts_owner')
      .withDatabase('adts')
      .start();

    owner = new Client({ connectionString: container.getConnectionUri() });
    await owner.connect();
    await owner.query(`CREATE ROLE adts_app WITH LOGIN PASSWORD 'adts_app';`);
    await owner.query('GRANT CONNECT ON DATABASE adts TO adts_app;');
    await owner.query('GRANT USAGE ON SCHEMA public TO adts_app;');

    const migrationsDir = join(__dirname, '../../prisma/migrations');
    for (const file of [
      '20261113121837_tenancy_auth_audit/migration.sql',
      '20261113205325_rls_remaining_tables/migration.sql',
      '20261113210429_sprint2_branding_users/migration.sql',
    ]) {
      await owner.query(readFileSync(join(migrationsDir, file), 'utf-8'));
    }

    await owner.query(`
      INSERT INTO "Tenant" (id, name, slug) VALUES
        ('tenant_a', 'Tenant A', 'tenant-a'),
        ('tenant_b', 'Tenant B', 'tenant-b');
      INSERT INTO "User" (id, "tenantId", email, "passwordHash", "isTenantAdmin") VALUES
        ('user_a', 'tenant_a', 'a@example.com', 'x', true),
        ('user_b', 'tenant_b', 'b@example.com', 'x', true);
      INSERT INTO "Role" (id, "tenantId", name, permissions) VALUES
        ('role_a', 'tenant_a', 'Role A', ARRAY[]::TEXT[]),
        ('role_b', 'tenant_b', 'Role B', ARRAY[]::TEXT[]);
    `);
    tenantAId = 'tenant_a';
    tenantBId = 'tenant_b';
    userAId = 'user_a';
    userBId = 'user_b';
    roleAId = 'role_a';
    roleBId = 'role_b';
    ctxA.sub = userAId;
    ctxA.tenantId = tenantAId;
    ctxB.sub = userBId;
    ctxB.tenantId = tenantBId;

    const host = container.getHost();
    const port = container.getPort();
    const appConnectionString = `postgresql://adts_app:adts_app@${host}:${port}/adts`;

    tenancyContext = new TenancyContextService();
    tenantPrisma = new TenantPrismaService(tenancyContext, {
      get: () => appConnectionString,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const storageStub = {
      upload: async () => undefined,
      delete: async () => undefined,
      getSignedUrl: async () => 'https://signed.example/fake',
    } as unknown as ObjectStorageService;

    users = new UsersService(tenantPrisma, storageStub);
  });

  afterAll(async () => {
    await owner?.end();
    await tenantPrisma?.onModuleDestroy();
    await container?.stop();
  });

  const runAs = <T>(ctx: AccessTokenPayload, fn: () => Promise<T>): Promise<T> =>
    tenancyContext.run({ tenantId: ctx.tenantId, isSuperuser: ctx.isSuperuser }, fn);

  it('list() só devolve usuários do próprio tenant', async () => {
    const asA = await runAs(ctxA, () => users.list());
    expect(asA.map((u) => u.id)).toEqual([userAId]);

    const asB = await runAs(ctxB, () => users.list());
    expect(asB.map((u) => u.id)).toEqual([userBId]);
  });

  it('create() rejeita roleIds que pertencem a outro tenant (nunca atribui "o que achou")', async () => {
    await expect(
      runAs(ctxA, () =>
        users.create(ctxA, {
          email: 'novo@tenant-a.example',
          password: 'senha-123456',
          roleIds: [roleAId, roleBId], // roleBId é do tenant B
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const created = await owner.query('SELECT * FROM "User" WHERE email = $1', ['novo@tenant-a.example']);
    expect(created.rows).toHaveLength(0); // nada criado — rejeitado antes da transação
  });

  it('create() com roleIds válidos do próprio tenant funciona e atribui corretamente', async () => {
    const created = await runAs(ctxA, () =>
      users.create(ctxA, {
        email: 'valido@tenant-a.example',
        password: 'senha-123456',
        roleIds: [roleAId],
      }),
    );

    const userRole = await owner.query('SELECT * FROM "UserRole" WHERE "userId" = $1', [created.id]);
    expect(userRole.rows.map((r) => r.roleId)).toEqual([roleAId]);
  });

  it('deactivate() não consegue desativar usuário de outro tenant (NotFound, nunca confirma que o id existe)', async () => {
    await expect(runAs(ctxA, () => users.deactivate(userBId))).rejects.toThrow();

    const userB = await owner.query('SELECT "isActive" FROM "User" WHERE id = $1', [userBId]);
    expect(userB.rows[0].isActive).toBe(true); // intocado
  });

  it('getMe()/updateMe() nunca aceitam outro :id — sempre o do próprio token', async () => {
    const me = await runAs(ctxA, () => users.getMe(ctxA));
    expect(me.id).toBe(userAId);

    const updated = await runAs(ctxA, () => users.updateMe(ctxA, { firstName: 'Fulano' }));
    expect(updated.id).toBe(userAId);

    const other = await owner.query('SELECT "firstName" FROM "User" WHERE id = $1', [userBId]);
    expect(other.rows[0].firstName).toBeNull(); // B nunca foi tocado
  });
});
