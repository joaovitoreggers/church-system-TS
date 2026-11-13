import { Controller, Get } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/prisma-tenant.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly prisma: TenantPrismaService) {}

  // Listagem simples (RLS já restringe ao tenant atual) — usada pra
  // popular o seletor de atribuição de Role na criação/edição de usuário.
  // Sem @CheckPolicies: qualquer usuário autenticado do tenant pode ver
  // que roles existem (não é informação sensível), só a atribuição em si
  // (POST/PATCH /users) exige a policy "users.manage".
  @Get()
  list() {
    return this.prisma.client.role.findMany({
      select: { id: true, name: true, permissions: true },
      orderBy: { name: 'asc' },
    });
  }
}
