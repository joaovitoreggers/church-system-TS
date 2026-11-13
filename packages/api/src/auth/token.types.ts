export interface AccessTokenPayload {
  sub: string; // userId
  tenantId: string | null;
  isSuperuser: boolean;
  jti: string;
}
