import { fillCancelledSlots } from '../operations/waitlist.service'
import { NotificationType, NotificationStatus } from '@prisma/client'
import { prisma, salons, salonContext } from '../../lib/prisma'
import { getSettings } from '../settings/settings.service'
import { formatWhen } from '../../utils/dates'
import { normalizePhone } from '../../utils/phone'
import { randomBytes } from 'node:crypto'
import { confirmUrl } from '../appointments/scheduling'
import { expireDeposits } from '../payments/pix.service'
import { runSubscriptionCycle } from '../subscriptions/subscriptions.service'
import { assertOutboundUrl } from '../../utils/outbound-url'

export async function sendAndLog(params: {
  type: NotificationType
  phone: string
  message: string
  clientId?: string
  appointmentId?: string
  dedupeKey?: string
}) {
  const data = { ...params, phone: normalizePhone(params.phone) }
  const log = params.dedupeKey
    ? await prisma.notificationLog.upsert({
        where: { dedupeKey: params.dedupeKey },
        create: data,
        update: {},
      })
    : await prisma.notificationLog.create({ data })
  return { log, sent: log.status === 'SENT', queued: true }
}

export async function sendPendingReminders() {
  const settings = await getSettings()
  if (settings.whatsapp_enabled !== 'true')
    return { sent: 0, failed: 0, queued: 0 }
  const hours = Number(settings.whatsapp_reminder_hours || 24)
  const appointments = await prisma.appointment.findMany({
    where: {
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      startsAt: { gt: new Date(), lte: new Date(Date.now() + hours * 3600000) },
      // Horário com sinal pendente ainda não está garantido.
      OR: [{ depositAmount: null }, { depositPaidAt: { not: null } }],
    },
    include: { client: true, barber: true },
  })
  // Uma consulta só para saber quem já tem lembrete na fila: o worker roda a
  // cada minuto e não precisa regravar os mesmos lembretes toda vez.
  const reminderKey = (a: (typeof appointments)[number]) =>
    `reminder:${a.id}:${a.startsAt.toISOString()}`
  const queued = new Set(
    (
      await prisma.notificationLog.findMany({
        where: { dedupeKey: { in: appointments.map(reminderKey) } },
        select: { dedupeKey: true },
      })
    ).map((log) => log.dedupeKey),
  )
  const pending = appointments.filter((a) => !queued.has(reminderKey(a)))
  for (const a of pending) {
    const date = formatWhen(a.startsAt)
    // Atendimentos antigos ganham o link de autoatendimento no primeiro lembrete.
    const token =
      a.manageToken ??
      (
        await prisma.appointment.update({
          where: { id: a.id },
          data: { manageToken: randomBytes(24).toString('hex') },
        })
      ).manageToken
    await sendAndLog({
      type: 'APPOINTMENT_REMINDER',
      phone: a.client.phone,
      clientId: a.clientId,
      appointmentId: a.id,
      dedupeKey: reminderKey(a),
      message: `Olá, ${a.client.name}! Lembrete do seu atendimento de ${date}, com ${a.barber.name}. ${settings.shop_name}.${confirmUrl(token) || ` Para alterar, entre em contato: ${settings.shop_phone}.`}`,
    })
  }
  return { sent: 0, failed: 0, queued: pending.length }
}

export async function processNotificationQueue() {
  const settings = await getSettings()
  if (settings.whatsapp_enabled !== 'true') return
  const {
    whatsapp_api_url: url,
    whatsapp_api_key: key,
    whatsapp_instance: instance,
  } = settings
  if (!url || !key || !instance) return
  const logs = await prisma.notificationLog.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      attempts: { lt: 5 },
      nextAttemptAt: { lte: new Date() },
      OR: [
        { lockedAt: null },
        { lockedAt: { lt: new Date(Date.now() - 120000) } },
      ],
    },
    take: 20,
    orderBy: { createdAt: 'asc' },
  })
  for (const log of logs) {
    const claimed = await prisma.notificationLog.updateMany({
      where: {
        id: log.id,
        attempts: log.attempts,
        status: { not: 'SENT' },
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: new Date(Date.now() - 120000) } },
        ],
      },
      data: { lockedAt: new Date(), attempts: { increment: 1 } },
    })
    if (!claimed.count) continue
    try {
      if (log.type === 'APPOINTMENT_REMINDER' && log.appointmentId) {
        const a = await prisma.appointment.findUnique({
          where: { id: log.appointmentId },
        })
        if (
          !a ||
          !['SCHEDULED', 'CONFIRMED'].includes(a.status) ||
          a.startsAt <= new Date() ||
          log.dedupeKey !== `reminder:${a.id}:${a.startsAt.toISOString()}`
        ) {
          await prisma.notificationLog.update({
            where: { id: log.id },
            data: {
              status: 'FAILED',
              attempts: 5,
              lockedAt: null,
              error: 'Lembrete obsoleto: atendimento alterado ou encerrado',
            },
          })
          continue
        }
      }
      if (log.dedupeKey?.startsWith('waitlist:')) {
        const offer = await prisma.waitlistEntry.findFirst({
          where: {
            token: log.dedupeKey.slice(9),
            status: 'OFFERED',
            expiresAt: { gt: new Date() },
          },
        })
        if (!offer) {
          await prisma.notificationLog.update({
            where: { id: log.id },
            data: {
              status: 'FAILED',
              attempts: 5,
              lockedAt: null,
              error: 'Oferta expirada',
            },
          })
          continue
        }
      }
      if (log.dedupeKey?.startsWith('outreach:') && log.clientId) {
        const client = await prisma.client.findUnique({
          where: { id: log.clientId },
        })
        if (!client?.marketingConsent) {
          await prisma.notificationLog.update({
            where: { id: log.id },
            data: {
              status: 'FAILED',
              attempts: 5,
              lockedAt: null,
              error: 'Autorização revogada',
            },
          })
          continue
        }
      }
      await assertOutboundUrl(url)
      const response = await fetch(
        `${url.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(instance)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: key,
            'Idempotency-Key': log.id,
          },
          body: JSON.stringify({
            number: normalizePhone(log.phone),
            text: log.message,
          }),
          signal: AbortSignal.timeout(15000),
        },
      )
      if (!response.ok)
        throw new Error(`Provedor retornou HTTP ${response.status}`)
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          lockedAt: null,
          error: null,
        },
      })
    } catch (error) {
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          lockedAt: null,
          // Erro de rede vira texto genérico: o painel não deve revelar detalhes da conexão.
          error:
            error instanceof Error && /^(Provedor retornou HTTP \d+|Endereço|Use um)/.test(error.message)
              ? error.message
              : 'Falha de conexão com o provedor',
          nextAttemptAt: new Date(
            Date.now() + Math.pow(2, log.attempts + 1) * 60000,
          ),
        },
      })
    }
  }
}
let running = false
/*
  Retenção (LGPD): mensagens enviadas ou que falharam guardam telefone e texto.
  Depois de 12 meses não servem mais para a operação e são apagadas; o
  registro de ações sensíveis fica 5 anos.
*/
const MESSAGE_RETENTION_DAYS = 365
const AUDIT_RETENTION_DAYS = 5 * 365
export async function purgeOldRecords(now = new Date()) {
  const day = 86400000
  const [messages, audits] = await Promise.all([
    prisma.notificationLog.deleteMany({
      where: {
        status: { in: ['SENT', 'FAILED'] },
        createdAt: { lt: new Date(now.getTime() - MESSAGE_RETENTION_DAYS * day) },
      },
    }),
    prisma.auditLog.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - AUDIT_RETENTION_DAYS * day) } },
    }),
  ])
  return { messages: messages.count, audits: audits.count }
}

let lastPurge = 0
export function startNotificationWorker() {
  const tick = async () => {
    if (running) return
    running = true
    try {
      for (const salon of salons.values())
        await salonContext.run(salon, async () => {
          try {
            await expireDeposits()
            await fillCancelledSlots()
            await runSubscriptionCycle()
            await sendPendingReminders()
            await processNotificationQueue()
            if (Date.now() - lastPurge > 3600000) await purgeOldRecords()
          } catch {
            console.error(`Falha no worker do salão ${salon.slug}`)
          }
        })
    } finally {
      if (Date.now() - lastPurge > 3600000) lastPurge = Date.now()
      running = false
    }
  }
  const timer = setInterval(() => {
    void tick()
  }, 60000)
  timer.unref()
  return timer
}
export async function listNotificationLogs(filters: {
  status?: NotificationStatus
  type?: NotificationType
  page?: number
  limit?: number
}) {
  const page = Math.max(1, filters.page || 1),
    limit = Math.min(100, Math.max(1, filters.limit || 50))
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
  }
  const [data, total] = await Promise.all([
    prisma.notificationLog.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        appointment: { select: { id: true, startsAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notificationLog.count({ where }),
  ])
  return { data, total, page, limit }
}
