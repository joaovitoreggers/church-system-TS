-- Sem mudança de RLS nesta migration: Tenant já tem policy por "id" próprio
-- e User já tem policy por "tenantId" (ambas de migrations anteriores) —
-- novas colunas em tabelas que já têm RLS continuam cobertas pela mesma
-- policy, não precisam de uma nova.

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "cardTheme" TEXT NOT NULL DEFAULT 'navy',
ADD COLUMN     "city" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "logoKey" TEXT,
ADD COLUMN     "pastorPresidente" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "signatureKey" TEXT;
