import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { Client } from 'pg';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenancyContextService } from '../tenancy/tenancy-context.service';
import { TenantPrismaService } from '../prisma/prisma-tenant.service';
import { ObjectStorageService } from '../media/object-storage.service';
import { OnboardingService } from './onboarding.service';
import { SignupDto } from './dto/signup.dto';

/**
 * Integração contra Postgres real (mesmo padrão do Sprint 1,
 * rls-isolation.spec.ts): aplica as migrations REAIS do projeto, não
 * reimplementa schema/RLS aqui.
 *
 * ObjectStorageService é um STUB aqui de propósito — este teste é sobre
 * atomicidade da transação (Tenant+User+Role+UserRole) e sobre RLS, não
 * sobre o S3/MinIO em si (isso é melhor testado isoladamente, com um
 * MinIO real, se algum sprint futuro achar necessário). O cast
 * `as unknown as ObjectStorageService` é só porque a classe real tem
 * campos privados — estruturalmente o stub implementa a mesma interface
 * pública.
 */
describe('OnboardingService (integração, Postgres real via Testcontainers)', () => {
  jest.setTimeout(180_000);

  let container: StartedPostgreSqlContainer;
  let owner: Client;
  let tenancyContext: TenancyContextService;
  let tenantPrisma: TenantPrismaService;
  let storage: { upload: jest.Mock; delete: jest.Mock; getSignedUrl: jest.Mock };
  let onboarding: OnboardingService;

  const baseDto = (overrides: Partial<SignupDto> = {}): SignupDto => ({
    tenantName: 'Campo Teste',
    adminEmail: 'admin@campo-teste.example',
    adminPassword: 'senha-super-segura',
    ...overrides,
  });

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
    const migrationFiles = [
      '20261113121837_tenancy_auth_audit/migration.sql',
      '20261113205325_rls_remaining_tables/migration.sql',
      '20261113210429_sprint2_branding_users/migration.sql',
    ];
    for (const file of migrationFiles) {
      await owner.query(readFileSync(join(migrationsDir, file), 'utf-8'));
    }

    const host = container.getHost();
    const port = container.getPort();
    const appConnectionString = `postgresql://adts_app:adts_app@${host}:${port}/adts`;

    tenancyContext = new TenancyContextService();
    tenantPrisma = new TenantPrismaService(tenancyContext, {
      get: () => appConnectionString,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  afterAll(async () => {
    await owner?.end();
    await tenantPrisma?.onModuleDestroy();
    await container?.stop();
  });

  beforeEach(() => {
    storage = {
      upload: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/fake'),
    };
    onboarding = new OnboardingService(
      tenantPrisma,
      storage as unknown as ObjectStorageService,
      new EventEmitter2(),
    );
  });

  it('cria Tenant + User + Role + UserRole atomicamente', async () => {
    const result = await onboarding.signup(baseDto());

    const tenant = await owner.query('SELECT * FROM "Tenant" WHERE id = $1', [result.tenantId]);
    expect(tenant.rows).toHaveLength(1);
    expect(tenant.rows[0].slug).toBe('campo-teste');
    expect(tenant.rows[0].cardTheme).toBe('navy');

    const user = await owner.query('SELECT * FROM "User" WHERE id = $1', [result.userId]);
    expect(user.rows).toHaveLength(1);
    expect(user.rows[0].isTenantAdmin).toBe(true);
    expect(user.rows[0].tenantId).toBe(result.tenantId);

    const role = await owner.query('SELECT * FROM "Role" WHERE "tenantId" = $1', [result.tenantId]);
    expect(role.rows).toHaveLength(1);
    expect(role.rows[0].name).toBe('Administrador');

    const userRole = await owner.query('SELECT * FROM "UserRole" WHERE "userId" = $1', [result.userId]);
    expect(userRole.rows).toHaveLength(1);
    expect(userRole.rows[0].roleId).toBe(role.rows[0].id);
  });

  it('nome de tenant duplicado é rejeitado e não deixa nada órfão', async () => {
    await onboarding.signup(
      baseDto({ tenantName: 'Campo Duplicado', adminEmail: 'primeiro@campo-duplicado.example' }),
    );

    const countBefore = await owner.query('SELECT count(*) FROM "Tenant"');

    await expect(
      onboarding.signup(baseDto({ tenantName: 'Campo Duplicado', adminEmail: 'segundo@campo-duplicado.example' })),
    ).rejects.toThrow();

    const countAfter = await owner.query('SELECT count(*) FROM "Tenant"');
    expect(countAfter.rows[0].count).toBe(countBefore.rows[0].count);

    const usersWithSecondEmail = await owner.query('SELECT * FROM "User" WHERE email = $1', [
      'segundo@campo-duplicado.example',
    ]);
    expect(usersWithSecondEmail.rows).toHaveLength(0);
  });

  it('e-mail de admin duplicado (corrida passando pela pré-checagem) também não deixa nada órfão', async () => {
    const sharedEmail = 'mesmo-email@example.com';
    await onboarding.signup(baseDto({ tenantName: 'Campo Um', adminEmail: sharedEmail }));

    const countBefore = await owner.query('SELECT count(*) FROM "Tenant"');

    // Mesmo e-mail do admin, nome de tenant diferente — a pré-checagem de
    // slug passa, só a unique constraint de User.email no banco pega.
    await expect(onboarding.signup(baseDto({ tenantName: 'Campo Dois', adminEmail: sharedEmail }))).rejects.toThrow();

    const countAfter = await owner.query('SELECT count(*) FROM "Tenant"');
    expect(countAfter.rows[0].count).toBe(countBefore.rows[0].count);

    const tenantDois = await owner.query('SELECT * FROM "Tenant" WHERE slug = $1', ['campo-dois']);
    expect(tenantDois.rows).toHaveLength(0);
  });

  it('com logo válido: chama storage.upload com a key esperada e salva logoKey no Tenant', async () => {
    const logoBuffer = await sharp(Buffer.alloc(10 * 10 * 4, 255), {
      raw: { width: 10, height: 10, channels: 4 },
    })
      .png()
      .toBuffer();

    const result = await onboarding.signup(
      baseDto({ tenantName: 'Campo Com Logo', adminEmail: 'logo@example.com' }),
      { buffer: logoBuffer, mimetype: 'image/png' },
    );

    const expectedKey = `tenants/${result.tenantId}/logos/logo.png`;
    expect(storage.upload).toHaveBeenCalledWith(expectedKey, expect.any(Buffer), 'image/png');
    expect(storage.delete).not.toHaveBeenCalled();

    const tenant = await owner.query('SELECT "logoKey" FROM "Tenant" WHERE id = $1', [result.tenantId]);
    expect(tenant.rows[0].logoKey).toBe(expectedKey);
  });

  it('se a transação falhar depois do upload do logo, o objeto é removido do storage (sem órfão)', async () => {
    await onboarding.signup(baseDto({ tenantName: 'Campo Original', adminEmail: 'duplicado@example.com' }));

    const logoBuffer = await sharp(Buffer.alloc(10 * 10 * 4, 255), {
      raw: { width: 10, height: 10, channels: 4 },
    })
      .png()
      .toBuffer();

    // Mesmo e-mail de admin do signup acima → User.email unique falha
    // DEPOIS que o logo já foi validado/processado/subido pro storage.
    await expect(
      onboarding.signup(baseDto({ tenantName: 'Campo Com Logo Órfão', adminEmail: 'duplicado@example.com' }), {
        buffer: logoBuffer,
        mimetype: 'image/png',
      }),
    ).rejects.toThrow();

    expect(storage.delete).toHaveBeenCalledTimes(1);

    const tenant = await owner.query('SELECT * FROM "Tenant" WHERE slug = $1', ['campo-com-logo-orfao']);
    expect(tenant.rows).toHaveLength(0);
  });
});
