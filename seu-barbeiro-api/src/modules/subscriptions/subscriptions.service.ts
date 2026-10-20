import { prisma } from '../../lib/prisma'
import { runSchedule, type Tx } from '../appointments/scheduling'
import { getSettings } from '../settings/settings.service'
import { cancelPayment } from '../../lib/mercadopago'
import {
  activateCharge,
  issuePix,
  mercadoPagoToken,
  newToken,
  payLink,
  refreshPix,
} from '../payments/pix.service'

const OPEN = ['PENDING', 'ACTIVE', 'PAST_DUE']

export function addMonths(date: Date, months: number) {
  const d = new Date(date)
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  // 31/01 + 1 mês vira o último dia de fevereiro, não 03/03.
  if (d.getDate() < day) d.setDate(0)
  return d
}

const money = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function graceDays(settings: Record<string, string>) {
  const days = Number(settings.subscription_grace_days)
  return Number.isInteger(days) && days >= 1 && days <= 30 ? days : 5
}

/** Assinatura que dá direito a usar o plano agora (inclui cancelada no período pago). */
export async function benefitFor(db: Tx | typeof prisma, clientId: string, at: Date) {
  return db.subscription.findFirst({
    where: {
      clientId,
      status: { in: ['ACTIVE', 'PAST_DUE', 'CANCELLED'] },
      currentPeriodStart: { lte: at },
      currentPeriodEnd: { gt: at },
    },
    include: { plan: true },
    orderBy: { currentPeriodEnd: 'desc' },
  })
}

export async function usesInPeriod(
  db: Tx | typeof prisma,
  subscriptionId: string,
  from: Date,
  to: Date,
  excludeAppointmentId?: string,
) {
  return db.appointment.count({
    where: {
      subscriptionId,
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      startsAt: { gte: from, lt: to },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
  })
}

/**
 * Gera o Pix de uma mensalidade e avisa o cliente pelo WhatsApp.
 * Sem Mercado Pago configurado, a mensalidade fica para baixa manual.
 */
export async function startCharge(subscriptionChargeId: string) {
  const token = await mercadoPagoToken()
  if (!token) return null
  const settings = await getSettings()
  const pix = await runSchedule(async (tx) => {
    const sc = await tx.subscriptionCharge.findUnique({
      where: { id: subscriptionChargeId },
      include: { pixCharges: true },
    })
    if (!sc || sc.status !== 'PENDING') return null
    const open = sc.pixCharges.find(
      (p) => p.status === 'PENDING' && p.expiresAt > new Date(),
    )
    if (open) return open
    const base = sc.periodStart > new Date() ? sc.periodStart : new Date()
    return tx.pixCharge.create({
      data: {
        kind: 'SUBSCRIPTION',
        token: newToken(),
        amount: sc.amount,
        expiresAt: new Date(base.getTime() + graceDays(settings) * 86400000),
        subscriptionChargeId: sc.id,
      },
    })
  })
  if (!pix) return null
  const issued = pix.providerId ? pix : await issuePix(pix.id)
  const sc = await prisma.subscriptionCharge.findUnique({
    where: { id: subscriptionChargeId },
    include: { subscription: { include: { client: true, plan: true } } },
  })
  if (sc && issued && settings.whatsapp_enabled === 'true') {
    const { client, plan } = sc.subscription
    await prisma.notificationLog.upsert({
      where: { dedupeKey: `subscription:${issued.id}` },
      create: {
        type: 'CUSTOM',
        phone: client.phone,
        clientId: client.id,
        dedupeKey: `subscription:${issued.id}`,
        message: `Olá, ${client.name}! A mensalidade do plano ${plan.name} (${money(Number(sc.amount))}) referente a ${sc.periodStart.toLocaleDateString('pt-BR')} – ${sc.periodEnd.toLocaleDateString('pt-BR')} já pode ser paga pelo Pix: ${payLink(issued.token)} · ${settings.shop_name}`,
      },
      update: {},
    })
  }
  return issued
}

export async function createSubscription(input: {
  clientId: string
  planId: string
  startsAt?: Date
}) {
  const charge = await runSchedule(async (tx) => {
    const plan = await tx.plan.findFirst({
      where: { id: input.planId, isActive: true },
    })
    if (!plan) throw new Error('Plano não encontrado')
    if (!(await tx.client.findUnique({ where: { id: input.clientId } })))
      throw new Error('Cliente não encontrado')
    if (
      await tx.subscription.count({
        where: { clientId: input.clientId, status: { in: OPEN } },
      })
    )
      throw new Error('Este cliente já possui uma assinatura em andamento')
    const start = input.startsAt ?? new Date()
    const sub = await tx.subscription.create({
      data: {
        clientId: input.clientId,
        planId: plan.id,
        priceSnapshot: plan.price,
      },
    })
    return tx.subscriptionCharge.create({
      data: {
        subscriptionId: sub.id,
        periodStart: start,
        periodEnd: addMonths(start, 1),
        amount: plan.price,
      },
    })
  })
  await startCharge(charge.id).catch((error) =>
    console.error('Falha ao gerar Pix da assinatura', error),
  )
  return prisma.subscription.findUnique({
    where: { id: charge.subscriptionId },
    include: { plan: true, client: true, charges: true },
  })
}

/** Baixa manual (dinheiro, cartão ou Pix fora do sistema). */
export async function payChargeManually(
  subscriptionChargeId: string,
  method: 'CASH' | 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD',
) {
  const providerIds = await runSchedule(async (tx) => {
    const sc = await tx.subscriptionCharge.findUnique({
      where: { id: subscriptionChargeId },
      include: {
        pixCharges: true,
        subscription: { include: { plan: true, client: true } },
      },
    })
    if (!sc) throw new Error('Mensalidade não encontrada')
    if (sc.status === 'PAID') throw new Error('Mensalidade já está paga')
    if (sc.subscription.status === 'CANCELLED')
      throw new Error('Assinatura cancelada')
    const payment = await tx.payment.create({
      data: {
        amount: sc.amount,
        method,
        notes: `Assinatura ${sc.subscription.plan.name} · ${sc.subscription.client.name}`,
      },
    })
    await activateCharge(tx, sc.id, payment.id, new Date())
    const pending = sc.pixCharges.filter((p) => p.status === 'PENDING')
    await tx.pixCharge.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { status: 'CANCELLED' },
    })
    return pending.map((p) => p.providerId).filter((id): id is string => !!id)
  })
  const token = await mercadoPagoToken()
  if (token)
    for (const id of providerIds) await cancelPayment(token, id).catch(() => undefined)
}

export async function cancelSubscription(id: string) {
  const providerIds = await runSchedule(async (tx) => {
    const sub = await tx.subscription.findUnique({
      where: { id },
      include: { charges: { include: { pixCharges: true } } },
    })
    if (!sub) throw new Error('Assinatura não encontrada')
    if (sub.status === 'CANCELLED') return []
    await tx.subscription.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })
    const pendingCharges = sub.charges.filter((c) => c.status === 'PENDING')
    await tx.subscriptionCharge.updateMany({
      where: { id: { in: pendingCharges.map((c) => c.id) } },
      data: { status: 'CANCELLED' },
    })
    const pix = pendingCharges.flatMap((c) =>
      c.pixCharges.filter((p) => p.status === 'PENDING'),
    )
    await tx.pixCharge.updateMany({
      where: { id: { in: pix.map((p) => p.id) } },
      data: { status: 'CANCELLED' },
    })
    return pix.map((p) => p.providerId).filter((v): v is string => !!v)
  })
  const token = await mercadoPagoToken()
  if (token)
    for (const providerId of providerIds)
      await cancelPayment(token, providerId).catch(() => undefined)
}

/** Usa a assinatura na comanda: os serviços cobertos deixam de ser cobrados. */
export async function applyToAppointment(appointmentId: string) {
  return runSchedule(async (tx) => {
    const a = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: { services: true, payments: true, items: true },
    })
    if (!a) throw new Error('Atendimento não encontrado')
    if (['CANCELLED', 'NO_SHOW'].includes(a.status))
      throw new Error('Atendimento cancelado ou ausente')
    if (a.subscriptionId) throw new Error('Assinatura já aplicada')
    const sub = await benefitFor(tx, a.clientId, a.startsAt)
    if (!sub) throw new Error('Cliente sem assinatura válida para esta data')
    const covered = a.services
      .filter(
        (s) => !sub.plan.serviceIds.length || sub.plan.serviceIds.includes(s.serviceId),
      )
      .reduce((sum, s) => sum + Number(s.priceSnapshot), 0)
    if (!covered) throw new Error('O plano não cobre os serviços deste atendimento')
    if (sub.plan.usesPerCycle !== null) {
      const used = await usesInPeriod(
        tx,
        sub.id,
        sub.currentPeriodStart!,
        sub.currentPeriodEnd!,
        a.id,
      )
      if (used >= sub.plan.usesPerCycle)
        throw new Error(`Limite de ${sub.plan.usesPerCycle} uso(s) do plano neste período`)
    }
    const due =
      Number(a.totalPrice) -
      Number(a.discount) -
      Math.min(covered, Number(a.totalPrice) - Number(a.discount)) +
      a.items.reduce((sum, i) => sum + i.quantity * Number(i.unitPrice), 0)
    const paid = a.payments
      .filter((p) => !p.refundedAt)
      .reduce((sum, p) => sum + Number(p.amount), 0)
    if (Math.round(paid * 100) > Math.round(due * 100))
      throw new Error('Estorne o recebimento excedente antes de usar a assinatura')
    return tx.appointment.update({
      where: { id: a.id },
      data: {
        subscriptionId: sub.id,
        subscriptionCovered: Math.min(covered, Number(a.totalPrice) - Number(a.discount)),
      },
    })
  })
}

export async function removeFromAppointment(appointmentId: string) {
  return runSchedule(async (tx) => {
    const a = await tx.appointment.findUnique({ where: { id: appointmentId } })
    if (!a) throw new Error('Atendimento não encontrado')
    if (a.status === 'COMPLETED')
      throw new Error('Atendimento concluído não pode ser alterado')
    return tx.appointment.update({
      where: { id: a.id },
      data: { subscriptionId: null, subscriptionCovered: 0 },
    })
  })
}

/**
 * Ciclo das assinaturas (worker): gera a próxima mensalidade alguns dias
 * antes do vencimento, marca inadimplência e expira Pix vencidos.
 */
export async function runSubscriptionCycle() {
  const settings = await getSettings()
  const days = Number(settings.subscription_notice_days)
  const notice = (Number.isInteger(days) && days >= 0 && days <= 15 ? days : 3) * 86400000
  const now = new Date()
  const renewing = await prisma.subscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'PAST_DUE'] },
      currentPeriodEnd: { lte: new Date(now.getTime() + notice) },
    },
    take: 500,
  })
  for (const sub of renewing) {
    const periodStart = sub.currentPeriodEnd!
    const charge = await prisma.subscriptionCharge.upsert({
      where: { subscriptionId_periodStart: { subscriptionId: sub.id, periodStart } },
      create: {
        subscriptionId: sub.id,
        periodStart,
        periodEnd: addMonths(periodStart, 1),
        amount: sub.priceSnapshot,
      },
      update: {},
    })
    // Gera o Pix enquanto a mensalidade não tiver nenhum emitido no Mercado Pago:
    // se uma rodada falhar, a seguinte tenta de novo. Pix vencido não é refeito.
    if (
      charge.status === 'PENDING' &&
      !(await prisma.pixCharge.count({
        where: { subscriptionChargeId: charge.id, providerId: { not: null } },
      }))
    )
      await startCharge(charge.id).catch((error) =>
        console.error('Falha ao gerar mensalidade', error),
      )
  }
  await prisma.subscription.updateMany({
    where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } },
    data: { status: 'PAST_DUE' },
  })
  const expired = await prisma.pixCharge.findMany({
    where: { kind: 'SUBSCRIPTION', status: 'PENDING', expiresAt: { lt: now } },
    take: 20,
  })
  for (const pix of expired) {
    const fresh = await refreshPix(pix.id).catch(() => pix)
    if (fresh?.status === 'PENDING')
      await prisma.pixCharge.update({
        where: { id: pix.id },
        data: { status: 'EXPIRED' },
      })
  }
}
