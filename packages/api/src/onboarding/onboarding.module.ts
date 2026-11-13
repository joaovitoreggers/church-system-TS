import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { MediaModule } from '../media/media.module';

@Module({
  // ThrottlerModule configurado aqui dentro de propósito (não em
  // AppModule/global) — o rate-limit é só pro endpoint de signup, não pro
  // resto da API. Ver onboarding.controller.ts.
  imports: [ThrottlerModule.forRoot([{ ttl: 60 * 60 * 1000, limit: 5 }]), MediaModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
