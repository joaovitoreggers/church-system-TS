import { ConflictException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import argon2 from '../auth/argon2-safe';
import { Prisma } from '../generated/prisma/client';
import { TenantPrismaService } from '../prisma/prisma-tenant.service';
import { ObjectStorageService } from '../media/object-storage.service';
import { validateImage, InvalidImageError } from '../media/image-validation';
import { removeLogoBackground } from '../media/remove-logo-background';
import { AUDIT_LOG_EVENT, AuditLogEvent } from '../audit/audit-log.event';
import { DEFAULT_CARD_THEME } from '@adts/shared-types';
import { SignupDto } from './dto/signup.dto';
import { slugify } from './slugify';

export interface SignupResult {
  tenantId: string;
  tenantSlug: string;
  userId: string;
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly storage: ObjectStorageService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Fluxo único e atômico (diferente do Django, que usava sessão + arquivo
   * temp em disco entre dois requests): o cliente manda tudo de uma vez, e
   * tudo que toca o banco acontece dentro de UMA transação real
   * (`runInTenantTransaction`) — se qualquer parte falhar (ex.: nome de
   * tenant duplicado), nada fica órfão.
   *
   * Contexto de tenancy: como o Tenant ainda não existe, não tem um
   * `tenantId` real pra setar antes da transação — usamos
   * {tenantId: null, isSuperuser: true}, o mesmo padrão "pré-tenant" já
   * usado em AuthService.login. Isso é seguro aqui porque todas as linhas
   * criadas dentro da transação já nascem com o tenantId do tenant novo
   * (nunca de outro tenant existente), então não há leitura nem escrita
   * cross-tenant de verdade — é só bootstrap de um tenant que não existia.
   */
  async signup(dto: SignupDto, logo?: { buffer: Buffer; mimetype: string }): Promise<SignupResult> {
    const slug = slugify(dto.tenantName);
    if (!slug) {
      throw new ConflictException('Nome do campo inválido — não gera um identificador válido.');
    }

    // Pré-checagem (UX melhor, sem round-trip até a transação) — a
    // garantia real contra corrida continua sendo a unique constraint do
    // banco, tratada no catch abaixo.
    const existing = await this.prisma.runInTenantTransaction(
      { tenantId: null, isSuperuser: true },
      (tx) => tx.tenant.findUnique({ where: { slug } }),
    );
    if (existing) {
      throw new ConflictException('Já existe um campo cadastrado com esse nome. Tente um nome diferente.');
    }

    // UUID nativo (node:crypto), não cuid — só precisamos de um id
    // imprevisível conhecido ANTES da transação (pra montar a key do logo
    // no storage sem segurar a transação aberta durante o upload, que é
    // I/O de rede). Inconsistência cosmética com o formato cuid usado nos
    // outros ids (gerados pelo próprio Prisma via @default(cuid())) — sem
    // efeito funcional, já que a coluna é só String.
    const tenantId = randomUUID();
    const userId = randomUUID();

    let logoKey: string | undefined;
    if (logo) {
      await validateImage(logo.buffer).catch((err) => {
        throw err instanceof InvalidImageError ? new ConflictException(err.message) : err;
      });
      const processed = await removeLogoBackground(logo.buffer);
      logoKey = `tenants/${tenantId}/logos/logo.png`;
      await this.storage.upload(logoKey, processed, 'image/png');
    }

    const passwordHash = await argon2.hash(dto.adminPassword);

    try {
      await this.prisma.runInTenantTransaction({ tenantId: null, isSuperuser: true }, async (tx) => {
        await tx.tenant.create({
          data: {
            id: tenantId,
            name: dto.tenantName,
            slug,
            city: dto.city,
            state: dto.state,
            pastorPresidente: dto.pastorPresidente,
            phone: dto.phone,
            contactEmail: dto.contactEmail,
            cardTheme: DEFAULT_CARD_THEME,
            logoKey,
          },
        });

        await tx.user.create({
          data: {
            id: userId,
            tenantId,
            email: dto.adminEmail,
            passwordHash,
            firstName: dto.adminFirstName,
            lastName: dto.adminLastName,
            isTenantAdmin: true,
          },
        });

        // Role "Administrador" visível/atribuída explicitamente — a
        // autorização de fato já vem de isTenantAdmin (CaslAbilityFactory
        // trata isTenantAdmin como "manage all", ver Sprint 1). Esta Role
        // não carrega nenhuma permissão própria: seria redundante repetir
        // "*" aqui quando isTenantAdmin já concede tudo, e uma string "*"
        // nas permissions não teria efeito nenhum no CaslAbilityFactory
        // atual de qualquer forma (ele espera "subject.action").
        const role = await tx.role.create({
          data: { tenantId, name: 'Administrador', permissions: [] },
        });

        await tx.userRole.create({ data: { userId, roleId: role.id } });
      });
    } catch (err) {
      if (logoKey) {
        await this.storage.delete(logoKey).catch(() => undefined);
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Já existe um campo ou e-mail cadastrado com esses dados.');
      }
      throw err;
    }

    this.events.emit(AUDIT_LOG_EVENT, {
      tenantId,
      isSuperuser: false,
      userId,
      username: dto.adminEmail,
      action: 'create',
      entityType: 'Tenant',
      entityId: tenantId,
      entityRepr: dto.tenantName,
      description: 'Tenant criado via onboarding (autocadastro)',
      ipAddress: null,
    } satisfies AuditLogEvent);

    return { tenantId, tenantSlug: slug, userId };
  }
}
