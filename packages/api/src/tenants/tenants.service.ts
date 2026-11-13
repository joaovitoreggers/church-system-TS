import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CARD_PALETTES, CardThemeKey } from '@adts/shared-types';
import { TenantPrismaService } from '../prisma/prisma-tenant.service';
import { AccessTokenPayload } from '../auth/token.types';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: TenantPrismaService) {}

  async getCardTheme(currentUser: AccessTokenPayload) {
    const tenant = await this.getOwnTenant(currentUser);
    return { current: tenant.cardTheme, catalog: CARD_PALETTES };
  }

  async updateCardTheme(currentUser: AccessTokenPayload, theme: string) {
    if (!(theme in CARD_PALETTES)) {
      throw new ForbiddenException('Modelo de carteirinha inválido.');
    }
    if (!currentUser.tenantId) {
      throw new ForbiddenException('Esta rota exige um tenant ativo.');
    }
    await this.prisma.client.tenant.update({
      where: { id: currentUser.tenantId },
      data: { cardTheme: theme as CardThemeKey },
    });
    return { current: theme };
  }

  private async getOwnTenant(currentUser: AccessTokenPayload) {
    if (!currentUser.tenantId) {
      throw new ForbiddenException('Esta rota exige um tenant ativo.');
    }
    // RLS (policy por id próprio, ver migration do Sprint 1) já garante
    // que isto só pode resolver o tenant do próprio usuário.
    const tenant = await this.prisma.client.tenant.findUnique({ where: { id: currentUser.tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado.');
    }
    return tenant;
  }
}
