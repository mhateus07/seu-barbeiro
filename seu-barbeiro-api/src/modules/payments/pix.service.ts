import { randomBytes } from 'node:crypto'
import { prisma, currentSalon } from '../../lib/prisma'
import {
  cancelPayment,
  createPixPayment,
  getPayment,
  type MpPayment,
} from '../../lib/mercadopago'
import {
  queueClientMessage,
  releaseOrderItems,
  runSchedule,
  type Tx,
} from '../appointments/scheduling'
import { getSettings } from '../settings/settings.service'
import { formatWhen } from '../../utils/dates'
import { notifyStaff } from '../push/push.service'

export const newToken = () => randomBytes(24).toString('hex')

export function publicBase() {
  const base = process.env.PUBLIC_WEB_URL
  if (!base) throw new Error('Configure PUBLIC_WEB_URL')
  return base.replace(/\/$/, '')
}

/** Página pública com o QR Code e o "copia e cola" da cobrança. */
export const payLink = (token: string) =>
  `${publicBase()}/pagar/${token}?salon=${currentSalon().slug}`

/** Link de autoatendimento do cliente para o atendimento. */
export const manageLink = (token: string) =>
  `${publicBase()}/meu-horario/${token}?salon=${currentSalon().slug}`

export async function mercadoPagoToken(db: Pick<Tx, 'settings'> = prisma) {
  return (await getSettings(db)).mp_access_token || ''
}

const money = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Valor do sinal para um agendamento, conforme as regras do salão. */
export async function depositFor(tx: Tx, clientId: string, total: number) {
  const settings = await getSettings(tx)
  const mode = settings.deposit_mode
  if (!settings.mp_access_token || mode === 'off' || total <= 0) return 0
  if (mode === 'no_show') {
    const misses = await tx.appointment.count({
      where: {
        clientId,
        status: 'NO_SHOW',
        startsAt: { gte: new Date(Date.now() - 365 * 86400000) },
      },
    })
    if (!misses) return 0
  }
  const value = Number(settings.deposit_value)
  if (!Number.isFinite(value) || value <= 0) return 0
  const amount =
    settings.deposit_type === 'fixed'
      ? Math.min(value, total)
      : Math.round(total * Math.min(value, 100)) / 100
  return amount >= 1 ? amount : 0
}

export function depositMinutes(settings: Record<string, string>) {
  const minutes = Number(settings.deposit_expire_minutes)
  return Number.isInteger(minutes) && minutes >= 10 && minutes <= 1440
    ? minutes
    : 30
}

/**
 * Gera o Pix no Mercado Pago para uma cobrança já registrada.
 * Roda fora da transação da agenda para não segurar o bloqueio na rede.
 */
export async function issuePix(chargeId: string) {
  const charge = await prisma.pixCharge.findUnique({
    where: { id: chargeId },
    include: {
      appointment: { include: { client: true } },
      subscriptionCharge: {
        include: { subscription: { include: { client: true, plan: true } } },
      },
    },
  })
  if (!charge || charge.status !== 'PENDING' || charge.providerId) return charge
  const token = await mercadoPagoToken()
  const client =
    charge.appointment?.client ?? charge.subscriptionCharge?.subscription.client
  if (!token || !client) throw new Error('Pix indisponível')
  const settings = await getSettings()
  const description =
    charge.kind === 'DEPOSIT'
      ? `Sinal do agendamento · ${settings.shop_name}`
      : `Assinatura ${charge.subscriptionCharge?.subscription.plan.name} · ${settings.shop_name}`
  const host = new URL(publicBase()).hostname
  try {
    const payment = await createPixPayment(token, {
      amount: Number(charge.amount),
      description,
      externalReference: `${currentSalon().slug}:${charge.id}`,
      expiresAt: charge.expiresAt,
      payerEmail: client.email || `pagamentos+${client.id.slice(0, 8)}@${host}`,
      payerName: client.name,
      notificationUrl: `${publicBase()}/api/v1/webhooks/mercadopago/${currentSalon().slug}`,
      idempotencyKey: charge.id,
    })
    const data = payment.point_of_interaction?.transaction_data
    return prisma.pixCharge.update({
      where: { id: charge.id },
      data: {
        providerId: String(payment.id),
        qrCode: data?.qr_code,
        qrCodeBase64: data?.qr_code_base64,
        ticketUrl: data?.ticket_url,
        error: null,
      },
    })
  } catch (error) {
    await prisma.pixCharge.update({
      where: { id: charge.id },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Falha no Mercado Pago',
      },
    })
    throw error
  }
}

/** Registra o pagamento aprovado. Idempotente: pode ser chamado várias vezes. */
export async function markPixPaid(chargeId: string, payment: MpPayment) {
  const result = await runSchedule(async (tx) => {
    const charge = await tx.pixCharge.findUnique({
      where: { id: chargeId },
      include: {
        appointment: { include: { client: true, barber: true } },
        subscriptionCharge: {
          include: { subscription: { include: { client: true, plan: true } } },
        },
      },
    })
    if (!charge || charge.status === 'PAID') return null
    const amount = Number(payment.transaction_amount ?? charge.amount)
    const paidAt = payment.date_approved ? new Date(payment.date_approved) : new Date()
    await tx.pixCharge.update({
      where: { id: charge.id },
      data: { status: 'PAID', paidAt },
    })
    const settings = await getSettings(tx)
    if (charge.kind === 'DEPOSIT' && charge.appointment) {
      const a = charge.appointment
      await tx.payment.create({
        data: {
          amount,
          method: 'PIX',
          paidAt,
          appointmentId: a.id,
          notes: `Sinal via Pix (Mercado Pago ${payment.id})`,
        },
      })
      await tx.appointment.update({
        where: { id: a.id },
        data: { depositPaidAt: paidAt, depositExpiresAt: null },
      })
      const late = ['CANCELLED', 'NO_SHOW'].includes(a.status)
      if (!late && settings.whatsapp_enabled === 'true' && a.manageToken)
        await tx.notificationLog.upsert({
          where: { dedupeKey: `confirmation:${a.id}` },
          create: {
            type: 'APPOINTMENT_CONFIRMATION',
            appointmentId: a.id,
            clientId: a.clientId,
            phone: a.client.phone,
            dedupeKey: `confirmation:${a.id}`,
            message: `Olá, ${a.client.name}! Recebemos o sinal de ${money(amount)}. Seu horário está confirmado para ${formatWhen(a.startsAt)}, com ${a.barber.name}. ${settings.shop_name}. Para remarcar ou cancelar: ${manageLink(a.manageToken)}`,
          },
          update: {},
        })
      return {
        barberId: a.barberId,
        title: late ? 'Pix recebido de horário já cancelado' : 'Sinal recebido',
        body: `${a.client.name} · ${money(amount)} · ${a.startsAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${late ? ' · faça o estorno ou remarque' : ''}`,
      }
    }
    if (charge.kind === 'SUBSCRIPTION' && charge.subscriptionCharge) {
      const sc = charge.subscriptionCharge
      const sub = sc.subscription
      const created = await tx.payment.create({
        data: {
          amount,
          method: 'PIX',
          paidAt,
          notes: `Assinatura ${sub.plan.name} · ${sub.client.name} (Mercado Pago ${payment.id})`,
        },
      })
      await activateCharge(tx, sc.id, created.id, paidAt)
      return {
        title: 'Mensalidade recebida',
        body: `${sub.client.name} · ${sub.plan.name} · ${money(amount)}`,
      }
    }
    return null
  })
  if (result)
    void notifyStaff(
      { title: result.title, body: result.body, url: '/operacao', tag: chargeId },
      'barberId' in result ? result.barberId : undefined,
    )
  return result
}

/** Marca a mensalidade como paga e estende o período da assinatura. */
export async function activateCharge(
  tx: Tx,
  subscriptionChargeId: string,
  paymentId: string,
  paidAt: Date,
) {
  const sc = await tx.subscriptionCharge.update({
    where: { id: subscriptionChargeId },
    data: { status: 'PAID', paidAt, paymentId },
    include: { subscription: true },
  })
  const sub = sc.subscription
  if (sub.status === 'CANCELLED') return sc
  const end =
    sub.currentPeriodEnd && sub.currentPeriodEnd > sc.periodEnd
      ? sub.currentPeriodEnd
      : sc.periodEnd
  await tx.subscription.update({
    where: { id: sub.id },
    data: {
      status: 'ACTIVE',
      currentPeriodStart:
        !sub.currentPeriodStart || sc.periodStart > sub.currentPeriodStart
          ? sc.periodStart
          : sub.currentPeriodStart,
      currentPeriodEnd: end,
    },
  })
  return sc
}

/** Consulta o Mercado Pago e aplica o resultado da cobrança. */
export async function refreshPix(chargeId: string) {
  const charge = await prisma.pixCharge.findUnique({ where: { id: chargeId } })
  // Cancelada também é consultada: o cliente pode pagar antes de o provedor
  // receber o cancelamento, e esse dinheiro precisa aparecer para a equipe.
  if (!charge?.providerId || !['PENDING', 'EXPIRED', 'CANCELLED'].includes(charge.status))
    return charge
  const token = await mercadoPagoToken()
  if (!token) return charge
  const payment = await getPayment(token, charge.providerId)
  if (payment.status === 'approved') await markPixPaid(charge.id, payment)
  else if (['cancelled', 'rejected', 'refunded'].includes(payment.status))
    await prisma.pixCharge.updateMany({
      where: { id: charge.id, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    })
  return prisma.pixCharge.findUnique({ where: { id: chargeId } })
}

/** Aviso do Mercado Pago (webhook). O pagamento é sempre reconsultado na API. */
export async function handleMercadoPagoNotification(paymentId: string) {
  const charge = await prisma.pixCharge.findUnique({
    where: { providerId: paymentId },
  })
  if (charge) await refreshPix(charge.id)
}

/**
 * Libera horários cujo sinal não foi pago no prazo. Antes de cancelar,
 * reconsulta o Mercado Pago para não perder um pagamento sem webhook.
 */
export async function expireDeposits() {
  const overdue = await prisma.pixCharge.findMany({
    where: { kind: 'DEPOSIT', status: 'PENDING', expiresAt: { lt: new Date() } },
    take: 20,
  })
  for (const charge of overdue) {
    try {
      const fresh = await refreshPix(charge.id)
      if (fresh?.status === 'PAID') continue
    } catch {
      // Sem resposta do provedor: tenta de novo no próximo ciclo.
      if (charge.expiresAt > new Date(Date.now() - 15 * 60000)) continue
    }
    const released = await runSchedule(async (tx) => {
      const current = await tx.pixCharge.findUnique({
        where: { id: charge.id },
        include: { appointment: { include: { client: true } } },
      })
      if (!current || !['PENDING', 'EXPIRED'].includes(current.status))
        return null
      await tx.pixCharge.update({
        where: { id: charge.id },
        data: { status: 'EXPIRED' },
      })
      const a = current.appointment
      if (!a || a.depositPaidAt || !['SCHEDULED', 'CONFIRMED'].includes(a.status))
        return null
      await tx.appointment.update({
        where: { id: a.id },
        data: {
          status: 'CANCELLED',
          depositExpiresAt: null,
          notes: [a.notes, 'Cancelado automaticamente: sinal não pago no prazo.']
            .filter(Boolean)
            .join('\n'),
        },
      })
      await releaseOrderItems(tx, a.id)
      const settings = await getSettings(tx)
      await queueClientMessage(tx, {
        appointmentId: a.id,
        clientId: a.clientId,
        phone: a.client.phone,
        type: 'APPOINTMENT_CANCELLATION',
        dedupeKey: `deposit-expired:${a.id}`,
        message: `Olá, ${a.client.name}! O sinal do horário de ${formatWhen(a.startsAt)} não foi pago no prazo, e a vaga foi liberada. Para marcar de novo: ${publicBase()}/agendar?salon=${currentSalon().slug} · ${settings.shop_name}`,
      })
      return a
    })
    if (charge.providerId) {
      const token = await mercadoPagoToken()
      if (token) await cancelPayment(token, charge.providerId).catch(() => undefined)
    }
    if (released)
      void notifyStaff(
        {
          title: 'Horário liberado',
          body: `${released.client.name} não pagou o sinal de ${released.startsAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`,
          url: '/operacao',
        },
        released.barberId,
      )
  }
}

/** Dados públicos de uma cobrança, sem identificar o cliente. */
export async function publicCharge(token: string) {
  let charge = await prisma.pixCharge.findUnique({ where: { token } })
  if (!charge) return null
  if (charge.status === 'PENDING' && charge.providerId)
    charge = (await refreshPix(charge.id).catch(() => charge)) ?? charge
  const settings = await getSettings()
  return {
    kind: charge.kind,
    status: charge.status,
    amount: Number(charge.amount),
    qrCode: charge.status === 'PENDING' ? charge.qrCode : null,
    qrCodeBase64: charge.status === 'PENDING' ? charge.qrCodeBase64 : null,
    expiresAt: charge.expiresAt,
    shopName: settings.shop_name,
  }
}
