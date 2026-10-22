import { randomBytes } from 'node:crypto'
import { prisma, currentSalon } from '../../lib/prisma'
import { assertAvailability, runSchedule, Tx } from '../appointments/scheduling'
import { getSettings } from '../settings/settings.service'
import { formatWhen } from '../../utils/dates'

export async function offerWaitlist(
  tx: Tx,
  id: string,
  startsAt: Date,
  barberId: string,
) {
  const entry = await tx.waitlistEntry.findUnique({
    where: { id },
    include: { client: true },
  })
  if (!entry || ['BOOKED', 'CANCELLED'].includes(entry.status))
    throw new Error('Inscrição indisponível')
  if (
    entry.status === 'OFFERED' &&
    entry.expiresAt &&
    entry.expiresAt > new Date()
  )
    throw new Error('Aguarde a oferta atual expirar')
  if (
    startsAt < entry.from ||
    startsAt > entry.to ||
    (entry.barberId && entry.barberId !== barberId)
  )
    throw new Error('Oferta fora das preferências do cliente')
  const plan = await assertAvailability(
    tx,
    barberId,
    entry.serviceIds,
    startsAt,
  )
  if (plan.endsAt > entry.to)
    throw new Error('Atendimento termina fora do intervalo solicitado')
  const base = process.env.PUBLIC_WEB_URL
  if (!base) throw new Error('Configure PUBLIC_WEB_URL')
  const token = randomBytes(24).toString('hex'),
    expiresAt = new Date(Date.now() + 15 * 60000)
  await tx.waitlistEntry.update({
    where: { id },
    data: {
      status: 'OFFERED',
      token,
      offeredAt: new Date(),
      expiresAt,
      reservedStart: startsAt,
      reservedEnd: plan.endsAt,
      reservedBarberId: barberId,
    },
  })
  const link = `${base.replace(/\/$/, '')}/oferta?salon=${currentSalon().slug}&token=${token}`
  await tx.notificationLog.create({
    data: {
      type: 'CUSTOM',
      clientId: entry.clientId,
      phone: entry.client.phone,
      dedupeKey: `waitlist:${token}`,
      message: `Olá, ${entry.client.name}! Surgiu uma vaga para ${formatWhen(startsAt)}. Reserve em até 15 minutos: ${link}`,
    },
  })
  return { link, expiresAt }
}

export async function fillCancelledSlots() {
  const settings = await getSettings()
  if (
    settings.waitlist_auto_offer !== 'true' ||
    settings.whatsapp_enabled !== 'true' ||
    !process.env.PUBLIC_WEB_URL
  )
    return
  const cancelled = await prisma.appointment.findMany({
    where: {
      status: 'CANCELLED',
      startsAt: { gt: new Date(), lt: new Date(Date.now() + 14 * 86400000) },
    },
    orderBy: { startsAt: 'asc' },
    take: 50,
  })
  for (const vacancy of cancelled) {
    // Vaga já ocupada por outro horário ou já oferecida a alguém (oferta ainda
    // valendo) não precisa de nova tentativa: evita abrir a trava da agenda à toa.
    const [taken, offered] = await Promise.all([
      prisma.appointment.count({
        where: {
          barberId: vacancy.barberId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          startsAt: { lt: vacancy.endsAt },
          endsAt: { gt: vacancy.startsAt },
        },
      }),
      prisma.waitlistEntry.count({
        where: {
          status: 'OFFERED',
          reservedStart: vacancy.startsAt,
          reservedBarberId: vacancy.barberId,
          expiresAt: { gt: new Date() },
        },
      }),
    ])
    if (taken || offered) continue
    const candidates = await prisma.waitlistEntry.findMany({
      where: {
        from: { lte: vacancy.startsAt },
        to: { gte: vacancy.endsAt },
        AND: [
          { OR: [{ barberId: null }, { barberId: vacancy.barberId }] },
          {
            OR: [
              { status: 'WAITING' },
              {
                status: 'OFFERED',
                expiresAt: { lte: new Date() },
                reservedStart: { not: vacancy.startsAt },
              },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })
    for (const candidate of candidates) {
      try {
        await runSchedule(async (tx) => {
          const plan = await assertAvailability(
            tx,
            vacancy.barberId,
            candidate.serviceIds,
            vacancy.startsAt,
          )
          if (plan.endsAt > vacancy.endsAt)
            throw new Error('Serviço maior que a vaga')
          return offerWaitlist(
            tx,
            candidate.id,
            vacancy.startsAt,
            vacancy.barberId,
          )
        })
        break
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error) throw error
        // A concurrent reservation or an incompatible service simply skips this candidate.
      }
    }
  }
}
