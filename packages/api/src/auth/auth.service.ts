import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import argon2 from './argon2-safe';
import { randomUUID } from 'node:crypto';
import { TenantPrismaService } from '../prisma/prisma-tenant.service';
import { TenancyContextService } from '../tenancy/tenancy-context.service';
import { MailService } from '../mail/mail.service';
import { AUDIT_LOG_EVENT, AuditLogEvent } from '../audit/audit-log.event';
import { generateOpaqueToken, hashToken } from './token.util';
import { AccessTokenPayload } from './token.types';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const REFRESH_TOKEN_TTL_JWT = '30d';
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hora

export interface RefreshJwtPayload {
  sub: string;
  jti: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenancyContext: TenancyContextService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Login é, por natureza, uma operação pré-tenant: ainda não sabemos de
   * qual tenant o e-mail é, então precisamos de visibilidade de
   * plataforma pra encontrar a conta. Isso NÃO expõe dados de outros
   * tenants pro cliente — só é usado internamente pra resolver "quem é
   * esse e-mail" e montar o token (que aí sim fica escopado ao tenant
   * dele).
   */
  async login(email: string, password: string, ipAddress: string | null): Promise<AuthTokens & { user: { id: string; email: string; tenantId: string | null } }> {
    const user = await this.tenancyContext.run({ tenantId: null, isSuperuser: true }, () =>
      this.prisma.client.user.findUnique({ where: { email } }),
    );

    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const tokens = await this.issueTokens(user.id, user.tenantId, user.isSuperuser);

    this.events.emit(AUDIT_LOG_EVENT, {
      tenantId: user.tenantId,
      isSuperuser: user.isSuperuser,
      userId: user.id,
      username: user.email,
      action: 'login',
      description: 'Login realizado',
      ipAddress,
    } satisfies AuditLogEvent);

    return { ...tokens, user: { id: user.id, email: user.email, tenantId: user.tenantId } };
  }

  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    let payload: RefreshJwtPayload;
    try {
      payload = this.jwt.verify<RefreshJwtPayload>(rawRefreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }

    const tokenHash = hashToken(rawRefreshToken);

    return this.tenancyContext.run({ tenantId: null, isSuperuser: true }, async () => {
      const stored = await this.prisma.client.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      // Reaproveita a MESMA mensagem genérica pra token ausente/revogado/
      // expirado/usuário não encontrado — não dar pista de qual caso é.
      if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.userId !== payload.sub) {
        throw new UnauthorizedException('Refresh token inválido ou expirado.');
      }

      // Rotação: revoga o token usado e emite um novo — detectar um
      // refresh token já revogado sendo reapresentado é, em produção, um
      // sinal de possível roubo de token (replay); aqui só revogamos e
      // seguimos, mas é o gancho natural pra, no futuro, revogar TODOS os
      // tokens do usuário nesse caso.
      await this.prisma.client.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });

      // stored.user pode ser null se a FK apontar pra um usuário cujo
      // tenant mudou de visibilidade — com isSuperuser:true no contexto
      // acima isso não deveria acontecer, mas não confia: falha explícita
      // em vez de emitir token pra um "usuário" inexistente.
      if (!stored.user) {
        throw new UnauthorizedException('Refresh token inválido ou expirado.');
      }

      return this.issueTokens(stored.user.id, stored.user.tenantId, stored.user.isSuperuser);
    });
  }

  async logout(rawRefreshToken: string | undefined, user: AccessTokenPayload, ipAddress: string | null) {
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      await this.tenancyContext.run({ tenantId: user.tenantId, isSuperuser: user.isSuperuser }, () =>
        this.prisma.client.refreshToken.updateMany({
          where: { tokenHash, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      );
    }

    this.events.emit(AUDIT_LOG_EVENT, {
      tenantId: user.tenantId,
      isSuperuser: user.isSuperuser,
      userId: user.sub,
      username: null,
      action: 'logout',
      description: 'Logout realizado',
      ipAddress,
    } satisfies AuditLogEvent);
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.tenancyContext.run({ tenantId: null, isSuperuser: true }, async () => {
      const user = await this.prisma.client.user.findUnique({ where: { email } });
      // Mesma resposta pro controller exista ou não o e-mail — não dar
      // pista de quais e-mails têm conta (evita enumeração).
      if (!user) return;

      const rawToken = generateOpaqueToken();
      await this.prisma.client.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });

      const resetUrl = `${this.config.get<string>('APP_PUBLIC_URL') ?? 'http://localhost:4200'}/redefinir-senha?token=${rawToken}`;
      await this.mail.sendPasswordReset(email, resetUrl);
    });
  }

  async confirmPasswordReset(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(rawToken);

    await this.tenancyContext.run({ tenantId: null, isSuperuser: true }, async () => {
      const reset = await this.prisma.client.passwordReset.findUnique({ where: { tokenHash } });
      if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
        throw new UnauthorizedException('Link de redefinição inválido ou expirado.');
      }

      const passwordHash = await argon2.hash(newPassword);

      await this.prisma.client.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      });
      await this.prisma.client.passwordReset.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      });
      // Senha trocada → invalida todas as sessões existentes (defesa
      // contra o cenário que motivou a troca: credencial comprometida).
      await this.prisma.client.refreshToken.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  private async issueTokens(
    userId: string,
    tenantId: string | null,
    isSuperuser: boolean,
  ): Promise<AuthTokens> {
    const accessPayload: AccessTokenPayload = {
      sub: userId,
      tenantId,
      isSuperuser,
      jti: randomUUID(),
    };
    const accessToken = this.jwt.sign(accessPayload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: ACCESS_TOKEN_TTL,
    });

    const refreshJti = randomUUID();
    const refreshToken = this.jwt.sign(
      { sub: userId, jti: refreshJti } satisfies RefreshJwtPayload,
      { secret: this.config.get<string>('JWT_REFRESH_SECRET'), expiresIn: REFRESH_TOKEN_TTL_JWT },
    );
    const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.tenancyContext.run({ tenantId, isSuperuser }, () =>
      this.prisma.client.refreshToken.create({
        data: {
          userId,
          tokenHash: hashToken(refreshToken),
          expiresAt: refreshTokenExpiresAt,
        },
      }),
    );

    return { accessToken, refreshToken, refreshTokenExpiresAt };
  }
}
