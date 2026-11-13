import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../prisma/prisma-tenant.service';
import { CaslAbilityFactory } from './casl-ability.factory';
import { CHECK_POLICIES_KEY, PolicyHandler } from './check-policies.decorator';
import { AccessTokenPayload } from '../auth/token.types';

/**
 * Roda depois de TenancyMiddleware (contexto de tenant já ativo) e depende
 * disso pra poder consultar UserRole/Role via TenantPrismaService.
 */
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: TenantPrismaService,
    private readonly caslFactory: CaslAbilityFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handlers = this.reflector.get<PolicyHandler[]>(CHECK_POLICIES_KEY, context.getHandler()) ?? [];
    if (handlers.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado.');
    }

    const userRoles = await this.prisma.client.userRole.findMany({
      where: { userId: user.sub },
      include: { role: true },
    });
    const permissions = userRoles.flatMap((ur) => ur.role.permissions);

    const userRow = await this.prisma.client.user.findUnique({ where: { id: user.sub } });
    const ability = this.caslFactory.defineAbilitiesFor({
      isSuperuser: user.isSuperuser,
      isTenantAdmin: userRow?.isTenantAdmin ?? false,
      permissions,
    });

    return handlers.every((handler) =>
      typeof handler === 'function' ? handler(ability) : handler.handle(ability),
    );
  }
}
