-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "commissionPaymentId" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "minStock" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "appointments_barberId_commissionPaymentId_idx" ON "appointments"("barberId", "commissionPaymentId");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_commissionPaymentId_fkey" FOREIGN KEY ("commissionPaymentId") REFERENCES "commission_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Atendimentos cobertos por pagamentos anteriores ficam marcados como acertados,
-- para não serem pagos de novo.
UPDATE "appointments" a
SET "commissionPaymentId" = c."id"
FROM "commission_payments" c
WHERE a."barberId" = c."barberId"
  AND a."status" = 'COMPLETED'
  AND a."startsAt" BETWEEN c."periodFrom" AND c."periodTo";
