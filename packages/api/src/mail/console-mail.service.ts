import { Injectable, Logger } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * Implementação provisória: só loga no console. A integração real
 * (Resend, como no sistema Django original) fica pro módulo de tesouraria
 * (Sprint 8), que já tem isso no escopo — aqui é só o suficiente pra não
 * bloquear o fluxo de reset de senha.
 */
@Injectable()
export class ConsoleMailService implements MailService {
  private readonly logger = new Logger(ConsoleMailService.name);

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    this.logger.log(`[mail stub] reset de senha para ${to}: ${resetUrl}`);
  }
}
