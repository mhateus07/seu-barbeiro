-- Índices das consultas mais frequentes: agenda, histórico do cliente, comanda,
-- fila de mensagens e financeiro. Só criam índices, sem mexer nos dados.
-- CreateIndex
CREATE INDEX "appointment_segments_appointmentId_idx" ON "appointment_segments"("appointmentId");

-- CreateIndex
CREATE INDEX "appointments_status_startsAt_idx" ON "appointments"("status", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_clientId_startsAt_idx" ON "appointments"("clientId", "startsAt");

-- CreateIndex
CREATE INDEX "expenses_status_paidAt_idx" ON "expenses"("status", "paidAt");

-- CreateIndex
CREATE INDEX "notification_logs_status_nextAttemptAt_idx" ON "notification_logs"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "notification_logs_createdAt_idx" ON "notification_logs"("createdAt");

-- CreateIndex
CREATE INDEX "notification_logs_appointmentId_idx" ON "notification_logs"("appointmentId");

-- CreateIndex
CREATE INDEX "order_items_appointmentId_idx" ON "order_items"("appointmentId");

-- CreateIndex
CREATE INDEX "payments_appointmentId_idx" ON "payments"("appointmentId");

-- CreateIndex
CREATE INDEX "payments_refundedAt_idx" ON "payments"("refundedAt");

-- CreateIndex
CREATE INDEX "pix_charges_appointmentId_idx" ON "pix_charges"("appointmentId");

-- CreateIndex
CREATE INDEX "pix_charges_subscriptionChargeId_idx" ON "pix_charges"("subscriptionChargeId");

