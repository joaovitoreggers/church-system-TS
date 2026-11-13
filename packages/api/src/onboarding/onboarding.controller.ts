import { Body, Controller, HttpCode, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { OnboardingService } from './onboarding.service';
import { SignupDto } from './dto/signup.dto';
import { MAX_IMAGE_BYTES } from '../media/image-validation';

// Endpoint público (ver PUBLIC_PATHS em tenancy.middleware.ts). Criação de
// tenant é o primeiro endpoint público além do login desde o Sprint 1, e é
// abuso óbvio (spam de tenant, esgotamento de recursos) — rate-limit SÓ
// aqui, não é auditoria geral de rate-limit do sistema (isso é Sprint 12,
// hardening, conforme o plano original).
const SIGNUP_LIMIT = 5;
const SIGNUP_TTL_MS = 60 * 60 * 1000; // 1 hora

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('signup')
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: SIGNUP_LIMIT, ttl: SIGNUP_TTL_MS } })
  // limits.fileSize rejeita ANTES de bufferizar — endpoint público, sem
  // isso o rate-limit acima não impede um único request com um arquivo
  // gigante de esgotar memória.
  @UseInterceptors(FileInterceptor('logo', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  async signup(@Body() dto: SignupDto, @UploadedFile() logo?: Express.Multer.File) {
    return this.onboarding.signup(dto, logo ? { buffer: logo.buffer, mimetype: logo.mimetype } : undefined);
  }
}
