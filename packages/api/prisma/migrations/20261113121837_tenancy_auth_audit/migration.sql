-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "isSuperuser" BOOLEAN NOT NULL DEFAULT false,
    "isTenantAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "permissions" TEXT[],

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "entityRepr" TEXT,
    "description" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_name_key" ON "Role"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Row Level Security ─────────────────────────────────────────────────
-- A role adts_app (criada em docker/postgres/init.sql) NÃO é dona destas
-- tabelas — quem roda esta migration (adts_owner) é. Isso é o que faz o
-- ENABLE abaixo isolar de verdade: o dono de uma tabela ignora RLS por
-- padrão, então se a API algum dia se conectar como adts_owner, RLS para
-- de fazer qualquer coisa, mesmo com ENABLE ROW LEVEL SECURITY.
--
-- Sem FORCE ROW LEVEL SECURITY: não precisa (adts_app não é owner) e FORCE
-- quebraria as proprias migrations/seed, que precisam ver tudo como
-- adts_owner.
--
-- Comportamento default-safe: se app.current_tenant_id nunca foi setado
-- na sessão (bug, esqueceram de setar), current_setting(..., true) volta
-- NULL, a comparação com "tenantId" nunca é verdadeira (NULL = qualquer
-- coisa é NULL, não TRUE) e app.is_superuser também não é 'true' → zero
-- linhas visíveis. Nunca vazar por omissão.
--
-- Sem FOR SELECT explícito: a policy vale pra SELECT/UPDATE/DELETE via
-- USING e, por não ter WITH CHECK próprio, pra INSERT/UPDATE também via
-- WITH CHECK (Postgres usa USING como WITH CHECK quando este não é
-- informado) — ou seja, também bloqueia escrever uma linha de outro
-- tenant, não só ler.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User"
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    OR current_setting('app.is_superuser', true) = 'true'
  );

ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Role"
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    OR current_setting('app.is_superuser', true) = 'true'
  );

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog"
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    OR current_setting('app.is_superuser', true) = 'true'
  );

-- Tenant, UserRole, RefreshToken e PasswordReset NÃO têm RLS neste sprint
-- (não têm coluna tenantId própria / não entraram no escopo pedido — ver
-- observação no relatório do Sprint 1).

-- ─── Privilégios da role restrita ───────────────────────────────────────
-- adts_app só ganhou CONNECT + USAGE em docker/postgres/init.sql (as
-- tabelas não existiam ainda naquele momento). Agora que existem, concede
-- exatamente DML, nunca DDL — a role continua sem poder alterar a
-- estrutura de nada.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "Tenant", "User", "Role", "UserRole", "RefreshToken", "PasswordReset", "AuditLog"
TO adts_app;
