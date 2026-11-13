import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditListener } from './audit.listener';
import { AuditInterceptor } from './audit.interceptor';

@Module({
  providers: [
    AuditListener,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AuditModule {}
