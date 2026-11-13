import { Global, Module } from '@nestjs/common';
import { TenantPrismaService } from './prisma-tenant.service';

@Global()
@Module({
  providers: [TenantPrismaService],
  exports: [TenantPrismaService],
})
export class PrismaModule {}
