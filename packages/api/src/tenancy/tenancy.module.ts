import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TenancyContextService } from './tenancy-context.service';
import { TenancyMiddleware } from './tenancy.middleware';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [TenancyContextService, TenancyMiddleware],
  exports: [JwtModule, TenancyContextService, TenancyMiddleware],
})
export class TenancyModule {}
