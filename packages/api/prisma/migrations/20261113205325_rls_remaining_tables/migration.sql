-- ─── RLS nas 4 tabelas que ficaram de fora no Sprint 1 ─────────────────────
-- Decisão (fechada): estender agora, não deixar pro Sprint 9. Motivo: todas
-- as 4 já estavam liberadas (GRANT) pra adts_app desde a migration anterior
-- — ou seja, hoje mesmo, um bug que deixe passar uma query sem contexto de
-- tenant devidamente restrito já consegue ler/escrever nelas sem filtro
-- nenhum. Esperar um sprint só aumenta a janela de exposição sem ganhar
-- nada em troca.
--
-- Tenant: não tem coluna tenantId própria (ela É o tenant) — a policy
-- compara o próprio "id" com app.current_tenant_id. Sem isso, qualquer
-- contexto não-superuser consegue enumerar nome/slug de TODOS os tenants
-- via Tenant.findMany() — pequeno, mas é exatamente o tipo de vazamento
-- cross-tenant que RLS existe pra fechar.
--
-- UserRole/RefreshToken/PasswordReset: não têm tenantId próprio, mas têm
-- userId → User (que já tem RLS). A policy usa EXISTS contra "User" pra
-- herdar o mesmo isolamento sem duplicar a coluna. Isso NÃO quebra os
-- fluxos existentes de login/refresh/reset-confirm: esses já rodam dentro
-- de um contexto {tenantId: null, isSuperuser: true} explícito em
-- AuthService (ver auth.service.ts) exatamente porque precisam resolver
-- "quem é esse token" antes de um tenant ser conhecido — o mesmo padrão
-- que User.findUnique por email já usa no login.

ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Tenant"
  USING (
    "id" = current_setting('app.current_tenant_id', true)
    OR current_setting('app.is_superuser', true) = 'true'
  );

ALTER TABLE "UserRole" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "UserRole"
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "UserRole"."userId"
        AND (
          u."tenantId" = current_setting('app.current_tenant_id', true)
          OR current_setting('app.is_superuser', true) = 'true'
        )
    )
  );

ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RefreshToken"
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "RefreshToken"."userId"
        AND (
          u."tenantId" = current_setting('app.current_tenant_id', true)
          OR current_setting('app.is_superuser', true) = 'true'
        )
    )
  );

ALTER TABLE "PasswordReset" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PasswordReset"
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "PasswordReset"."userId"
        AND (
          u."tenantId" = current_setting('app.current_tenant_id', true)
          OR current_setting('app.is_superuser', true) = 'true'
        )
    )
  );
