import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import sharp from '../media/sharp-safe';
import argon2 from '../auth/argon2-safe';
import { Prisma } from '../generated/prisma/client';
import { TenantPrismaService } from '../prisma/prisma-tenant.service';
import { ObjectStorageService } from '../media/object-storage.service';
import { validateImage } from '../media/image-validation';
import { AccessTokenPayload } from '../auth/token.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

const USER_LIST_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  isTenantAdmin: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  async list() {
    // Nunca aceita tenantId do cliente (query/body) — o filtro é só RLS,
    // a partir do contexto que o TenancyMiddleware já estabeleceu pelo JWT.
    return this.prisma.client.user.findMany({ select: USER_LIST_SELECT, orderBy: { createdAt: 'asc' } });
  }

  async create(currentUser: AccessTokenPayload, dto: CreateUserDto) {
    if (!currentUser.tenantId) {
      throw new ForbiddenException('Esta rota exige um tenant ativo.');
    }

    if (dto.roleIds && dto.roleIds.length > 0) {
      // A leitura já é tenant-scoped via RLS: uma Role de outro tenant
      // nunca aparece aqui, mesmo que o id tenha sido adivinhado/vazado.
      // Se faltar algum, a requisição inteira é rejeitada — nunca
      // atribuímos "o que deu pra achar" silenciosamente.
      const found = await this.prisma.client.role.findMany({
        where: { id: { in: dto.roleIds } },
        select: { id: true },
      });
      if (found.length !== dto.roleIds.length) {
        throw new BadRequestException('Um ou mais roleIds não pertencem a este tenant.');
      }
    }

    const passwordHash = await argon2.hash(dto.password);

    // Atômico de propósito (user + atribuição de roles juntos): usa
    // runInTenantTransaction (ver prisma-tenant.service.ts), nunca
    // `this.prisma.client.$transaction` — este último NÃO serviria aqui,
    // já que `client` é um getter que cria um `$extends()` novo a cada
    // acesso, então uma chamada subsequente a `this.prisma.client...`
    // dentro do callback rodaria numa transação completamente separada
    // da externa, sem atomicidade real nenhuma entre as duas escritas.
    const ctx = { tenantId: currentUser.tenantId, isSuperuser: currentUser.isSuperuser };
    try {
      return await this.prisma.runInTenantTransaction(ctx, async (tx) => {
        const user = await tx.user.create({
          data: {
            tenantId: currentUser.tenantId,
            email: dto.email,
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
          },
          select: USER_LIST_SELECT,
        });

        if (dto.roleIds && dto.roleIds.length > 0) {
          await tx.userRole.createMany({
            data: dto.roleIds.map((roleId) => ({ userId: user.id, roleId })),
          });
        }

        return user;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Já existe um usuário com este e-mail.');
      }
      throw err;
    }
  }

  async deactivate(id: string) {
    try {
      // RLS filtra: se `id` for de outro tenant, a linha simplesmente não
      // é visível pra este UPDATE e o Prisma lança "record not found" —
      // nunca confirma pro chamador que o id existe em outro tenant.
      return await this.prisma.client.user.update({
        where: { id },
        data: { isActive: false },
        select: USER_LIST_SELECT,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('Usuário não encontrado.');
      }
      throw err;
    }
  }

  async getMe(currentUser: AccessTokenPayload) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: currentUser.sub },
      select: { ...USER_LIST_SELECT, signatureKey: true },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    const { signatureKey, ...rest } = user;
    return {
      ...rest,
      signatureUrl: signatureKey ? await this.storage.getSignedUrl(signatureKey) : null,
    };
  }

  async updateMe(currentUser: AccessTokenPayload, dto: UpdateProfileDto) {
    return this.prisma.client.user.update({
      where: { id: currentUser.sub },
      data: { firstName: dto.firstName, lastName: dto.lastName },
      select: USER_LIST_SELECT,
    });
  }

  /**
   * Diferente do logo: a assinatura NUNCA passa por remoção de fundo —
   * mesmo comportamento do Django original (só valida e guarda).
   */
  async uploadSignature(currentUser: AccessTokenPayload, file: { buffer: Buffer; mimetype: string }) {
    await validateImage(file.buffer);
    const metadata = await sharp(file.buffer).metadata();
    const extension = metadata.format ?? 'png';

    const previous = await this.prisma.client.user.findUnique({
      where: { id: currentUser.sub },
      select: { signatureKey: true },
    });

    const key = `tenants/${currentUser.tenantId}/signatures/${currentUser.sub}/signature.${extension}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    await this.prisma.client.user.update({
      where: { id: currentUser.sub },
      data: { signatureKey: key },
    });

    if (previous?.signatureKey && previous.signatureKey !== key) {
      await this.storage.delete(previous.signatureKey).catch(() => undefined);
    }

    return { signatureUrl: await this.storage.getSignedUrl(key) };
  }

  async deleteSignature(currentUser: AccessTokenPayload) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: currentUser.sub },
      select: { signatureKey: true },
    });
    if (user?.signatureKey) {
      await this.storage.delete(user.signatureKey).catch(() => undefined);
    }
    await this.prisma.client.user.update({
      where: { id: currentUser.sub },
      data: { signatureKey: null },
    });
  }
}
