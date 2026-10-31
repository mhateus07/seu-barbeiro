import { randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma, currentSalon } from '../../lib/prisma'
import { getSettings } from '../settings/settings.service'
import { formatWhen } from '../../utils/dates'

export type Tx = Prisma.TransactionClient
export const activeStatuses = [
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
] as const
export async function lockSchedule(tx: Tx) {
  // A database belongs to one salon. Serialize changes to its shared agenda.
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(7241901)`
}
export function overlaps(a: Date, b: Date, c: Date, d: Date) {
  return a < d && b > c
}
export function parseHours(value: string) {
  if (!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(value || '')) return null
  const [a, b] = value.split('-').map((t) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  })
  return a >= 0 && b <= 1440 && a < b ? { open: a, close: b } : null
}
export function makeSegments(
  services: {
    durationMin: number
    processingMin: number
    finishingMin: number
    resourceId: string | null
  }[],
  startsAt: Date,
  barberId: string,
) {
  let cursor = startsAt.getTime()
  const segments: {
    barberId: string
    resourceId: string | null
    startsAt: Date
    endsAt: Date
    kind: string
  }[] = []
  for (const service of services) {
    for (const [kind, minutes] of [
      ['ACTIVE', service.durationMin],
      ['PROCESSING', service.processingMin],
      ['FINISHING', service.finishingMin],
    ] as const) {
      if (minutes > 0)
        segments.push({
          barberId,
          resourceId: service.resourceId,
          startsAt: new Date(cursor),
          endsAt: new Date(cursor + minutes * 60000),
          kind,
        })
      cursor += minutes * 60000
    }
  }
  return { segments, endsAt: new Date(cursor) }
}
export async function assertAvailability(
  tx: Tx,
  barberId: string,
  serviceIds: string[],
  startsAt: Date,
  excludeId?: string,
  holdToken?: string,
  allowPast = false,
  snapshots?: {
    serviceId: string
    priceSnapshot: Prisma.Decimal
    durationSnapshot: number
    processingSnapshot: number
    finishingSnapshot: number
    resourceSnapshot: string | null
  }[],
) {
  if (
    !Number.isFinite(startsAt.getTime()) ||
    (!allowPast && startsAt <= new Date())
  )
    throw new Error('Escolha um horário futuro válido')
  if (!serviceIds.length || new Set(serviceIds).size !== serviceIds.length)
    throw new Error('Selecione serviços distintos')
  const barber = await tx.barber.findFirst({
    where: { id: barberId, isActive: true },
  })
  if (!barber) throw new Error('Profissional indisponível')
  if (
    barber.serviceIds.length &&
    serviceIds.some((id) => !barber.serviceIds.includes(id))
  )
    throw new Error('Profissional não realiza todos os serviços selecionados')
  const rows = await tx.service.findMany({
    where: { id: { in: serviceIds }, isActive: true },
  })
  if (rows.length !== serviceIds.length) throw new Error('Serviço indisponível')
  const services = serviceIds.map((id) => {
    const original = rows.find((row) => row.id === id)!
    const override = (
      barber.serviceOverrides as Record<
        string,
        { price?: number; durationMin?: number }
      >
    )[id]
    const row = {
      ...original,
      ...(override?.price !== undefined
        ? { price: new Prisma.Decimal(override.price) }
        : {}),
      ...(override?.durationMin ? { durationMin: override.durationMin } : {}),
    }
    const snapshot = snapshots?.find((s) => s.serviceId === id)
    return snapshot
      ? {
          ...row,
          price: snapshot.priceSnapshot,
          durationMin:
            snapshot.durationSnapshot -
            snapshot.processingSnapshot -
            snapshot.finishingSnapshot,
          processingMin: snapshot.processingSnapshot,
          finishingMin: snapshot.finishingSnapshot,
          resourceId: snapshot.resourceSnapshot,
        }
      : row
  })
  const { segments, endsAt } = makeSegments(services, startsAt, barberId)
  const settings = await getSettings(tx)
  const names = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ]
  const hours = parseHours(settings[`hours_${names[startsAt.getDay()]}`])
  const schedule = await tx.workSchedule.findUnique({
    where: { barberId_weekday: { barberId, weekday: startsAt.getDay() } },
  })
  const minutes = startsAt.getHours() * 60 + startsAt.getMinutes()
  const endMinutes = minutes + (endsAt.getTime() - startsAt.getTime()) / 60000
  if (
    !hours ||
    minutes < hours.open ||
    endMinutes > hours.close ||
    (schedule &&
      (minutes < schedule.openMinute || endMinutes > schedule.closeMinute))
  )
    throw new Error('Horário fora do expediente')
  if (
    await tx.scheduleBlock.findFirst({
      where: { barberId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
    })
  )
    throw new Error('Profissional possui um bloqueio neste horário')
  const holding = await tx.waitlistEntry.findFirst({
    where: {
      status: 'OFFERED',
      expiresAt: { gt: new Date() },
      reservedBarberId: barberId,
      reservedStart: { lt: endsAt },
      reservedEnd: { gt: startsAt },
      ...(holdToken ? { NOT: { token: holdToken } } : {}),
    },
  })
  const heldResources = await tx.waitlistEntry.findMany({
    where: {
      status: 'OFFERED',
      expiresAt: { gt: new Date() },
      reservedStart: { lt: endsAt },
      reservedEnd: { gt: startsAt },
      ...(holdToken ? { NOT: { token: holdToken } } : {}),
    },
  })
  const resourceIds = services
    .map((s) => s.resourceId)
    .filter((id): id is string => !!id)
  if (resourceIds.length && heldResources.length) {
    const reservedServices = await tx.service.count({
      where: {
        id: { in: heldResources.flatMap((h) => h.serviceIds) },
        resourceId: { in: resourceIds },
      },
    })
    if (reservedServices) throw new Error('Recurso reservado temporariamente')
  }
  if (holding) throw new Error('Horário reservado temporariamente')
  for (const segment of segments) {
    if (
      segment.resourceId &&
      !(await tx.resource.findFirst({
        where: { id: segment.resourceId, isActive: true },
      }))
    )
      throw new Error('Recurso indisponível')
    const conflict = await tx.appointmentSegment.findFirst({
      where: {
        appointment: {
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        startsAt: { lt: segment.endsAt },
        endsAt: { gt: segment.startsAt },
        OR: [
          ...(segment.kind !== 'PROCESSING'
            ? [{ barberId, kind: { not: 'PROCESSING' } }]
            : []),
          ...(segment.resourceId ? [{ resourceId: segment.resourceId }] : []),
        ],
      },
    })
    if (conflict)
      throw new Error('Profissional ou recurso já reservado neste horário')
  }
  // Protect legacy appointments until their first edit creates segments.
  const legacy = await tx.appointment.findFirst({
    where: {
      barberId,
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      segments: { none: {} },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  })
  if (legacy)
    throw new Error('Profissional já possui agendamento neste horário')
  return { barber, services, segments, endsAt }
}
export async function bookInTransaction(
  tx: Tx,
  input: {
    clientId: string
    barberId: string
    serviceIds: string[]
    startsAt: string
    notes?: string
    source?: string
    returnOfId?: string
    holdToken?: string
    visitId?: string
    /** Sinal exigido: o horário fica reservado até o prazo de pagamento. */
    deposit?: { amount: number; expiresAt: Date }
    /** Encaixe no balcão: o cliente está ali, não precisa de confirmação. */
    silent?: boolean
  },
) {
  const startsAt = new Date(input.startsAt)
  if (!(await tx.client.findUnique({ where: { id: input.clientId } })))
    throw new Error('Cliente não encontrado')
  const data = await assertAvailability(
    tx,
    input.barberId,
    input.serviceIds,
    startsAt,
    undefined,
    input.holdToken,
  )
  if (input.returnOfId) {
    const original = await tx.appointment.findFirst({
      where: {
        id: input.returnOfId,
        clientId: input.clientId,
        status: 'COMPLETED',
      },
    })
    if (!original) throw new Error('Atendimento de origem inválido')
    if (
      await tx.appointment.count({
        where: {
          returnOfId: input.returnOfId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
      })
    )
      throw new Error('Já existe retorno para este atendimento')
  }
  const appointment = await tx.appointment.create({
    data: {
      clientId: input.clientId,
      barberId: input.barberId,
      startsAt,
      endsAt: data.endsAt,
      notes: input.notes,
      totalPrice: data.services.reduce((sum, s) => sum + Number(s.price), 0),
      commissionRateSnapshot: data.barber.commissionRate ?? 0,
      source: input.source ?? 'DIRECT',
      visitId: input.visitId,
      returnOfId: input.returnOfId,
      manageToken: randomBytes(24).toString('hex'),
      ...(input.deposit
        ? {
            depositAmount: input.deposit.amount,
            depositExpiresAt: input.deposit.expiresAt,
          }
        : {}),
      services: {
        create: data.services.map((s) => ({
          serviceId: s.id,
          priceSnapshot: s.price,
          durationSnapshot: s.durationMin + s.processingMin + s.finishingMin,
          processingSnapshot: s.processingMin,
          finishingSnapshot: s.finishingMin,
          resourceSnapshot: s.resourceId,
        })),
      },
      segments: { create: data.segments },
    },
    include: {
      client: { select: { id: true, name: true, phone: true } },
      barber: { select: { id: true, name: true } },
      services: { include: { service: true } },
    },
  })
  const settings = await getSettings(tx)
  // Com sinal, a confirmação só sai depois que o Pix for pago.
  if (settings.whatsapp_enabled === 'true' && !input.deposit && !input.silent)
    await tx.notificationLog.create({
      data: {
        type: 'APPOINTMENT_CONFIRMATION',
        appointmentId: appointment.id,
        clientId: input.clientId,
        phone: appointment.client.phone,
        dedupeKey: `confirmation:${appointment.id}`,
        message: `Olá, ${appointment.client.name}! Agendamento registrado para ${formatWhen(startsAt)}, com ${appointment.barber.name}. ${settings.shop_name}.${manageUrl(appointment.manageToken)}`,
      },
    })
  return appointment
}
/** Mensagem ao cliente na fila, se o WhatsApp estiver ligado. Cliente removido não recebe. */
export async function queueClientMessage(
  tx: Tx,
  input: {
    appointmentId: string
    clientId: string
    phone: string
    type: 'APPOINTMENT_CANCELLATION' | 'CUSTOM'
    dedupeKey: string
    message: string
  },
) {
  const settings = await getSettings(tx)
  if (settings.whatsapp_enabled !== 'true') return
  if (input.phone.startsWith('removido-')) return
  const { dedupeKey, ...data } = input
  await tx.notificationLog.upsert({
    where: { dedupeKey },
    create: { ...data, dedupeKey },
    update: {},
  })
}
/** Atendimento desfeito: sem recebimento ativo, os produtos da comanda voltam ao estoque. */
export async function releaseOrderItems(tx: Tx, appointmentId: string) {
  const paid = await tx.payment.count({
    where: { appointmentId, refundedAt: null },
  })
  if (paid) return
  const items = await tx.orderItem.findMany({ where: { appointmentId } })
  for (const item of items) {
    if (item.productId)
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      })
    await tx.orderItem.delete({ where: { id: item.id } })
  }
}
/** Trecho da mensagem com o link de autoatendimento (vazio sem PUBLIC_WEB_URL). */
export function manageUrl(token: string | null) {
  const base = process.env.PUBLIC_WEB_URL
  if (!token || !base) return ''
  return ` Para confirmar, remarcar ou cancelar: ${base.replace(/\/$/, '')}/meu-horario/${token}?salon=${currentSalon().slug}`
}
/** Link do lembrete: abrir já confirma a presença (um toque no WhatsApp). */
export function confirmUrl(token: string | null) {
  const base = process.env.PUBLIC_WEB_URL
  if (!token || !base) return ''
  return ` Toque para confirmar sua presença: ${base.replace(/\/$/, '')}/meu-horario/${token}?salon=${currentSalon().slug}&confirmar=1 (pelo mesmo link você remarca ou cancela).`
}
export async function runSchedule<T>(work: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(
    async (tx) => {
      await lockSchedule(tx)
      return work(tx)
    },
    { timeout: 20000 },
  )
}
