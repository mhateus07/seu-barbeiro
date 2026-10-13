-- Versão da sessão: invalida tokens ao trocar a senha ou desativar o acesso.
ALTER TABLE "admins" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Registro de ações sensíveis (exportação, anonimização, acessos, configurações).
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
