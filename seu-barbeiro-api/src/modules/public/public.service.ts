import {
  assertAvailability,
  runSchedule,
  bookInTransaction,
  parseHours,
} from '../appointments/scheduling'
import { normalizePhone } from '../../utils/phone'
import { prisma } from '../../lib/prisma'
import { getSettings } from '../settings/settings.service'
import { manageUrl } from '../appointments/scheduling'
import {
  depositFor,
  depositMinutes,
  issuePix,
  newToken,
} from '../payments/pix.service'
import { notifyStaff } from '../push/push.service'

export async function getPublicInfo() {
  const settings = await getSettings()
  return {
    shopLogo: settings.shop_logo,
    shopDescription: settings.shop_description,
    shopName: settings.shop_name,
    segment: settings.shop_segment,
    shopPhone: settings.shop_phone,
    shopAddress: settings.shop_address,
    shopInstagram: settings.shop_instagram,
    hours: {
      sunday: settings.hours_sunday,
      monday: settings.hours_monday,
      tuesday: settings.hours_tuesday,
      wednesday: settings.hours_wednesday,
      thursday: settings.hours_thursday,
      friday: settings.hours_friday,
      saturday: settings.hours_saturday,
    },
  }
}

export async function getPublicServices() {
  return prisma.service.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      durationMin: true,
      processingMin: true,
      finishingMin: true,
    },
  })
}

export async function getPublicBarbers() {
  return prisma.barber.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      serviceIds: true,
      serviceOverrides: true,
    },
  })
}

export async function getAvailableSlots(
  barberId: string,
  date: string,
  totalDuration: number,
  serviceIds?: string[],
  /** Atendimento sendo remarcado: o horário atual dele não conta como ocupado. */
  excludeId?: string,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isInteger(totalDuration) ||
    totalDuration <= 0 ||
    totalDuration > 1440
  )
    throw new Error('Data ou duração inválida')
  const settings = await getSettings()
  const day = new Date(`${date}T12:00:00`)
  const names = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ]
  const hours = parseHours(settings[`hours_${names[day.getDay()]}`])
  if (!hours) return []
  const barbers = await prisma.barber.findMany({
    where: { isActive: true, ...(barberId === 'any' ? {} : { id: barberId }) },
  })
  const slots: string[] = []
  for (
    let minute = hours.open;
    minute + totalDuration <= hours.close;
    minute += 15
  ) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
    const start = new Date(`${date}T${time}:00`)
    if (start <= new Date()) continue
    for (const barber of barbers) {
      if (!serviceIds?.length)
        throw new Error('Informe os serviços para consultar disponibilidade')
      try {
        await assertAvailability(prisma, barber.id, serviceIds, start, excludeId)
        slots.push(time)
        break
      } catch (error) {
        if (
          !(error instanceof Error) ||
          ![
            'horário',
            'expediente',
            'Profissional',
            'Recurso',
            'Serviço',
            'reservado',
          ].some((word) => error.message.includes(word))
        )
          throw error
      }
    }
  }
  return slots
}

export async function createPublicAppointment(data: {
  clientName: string
  clientPhone: string
  clientEmail?: string
  barberId: string
  serviceIds: string[]
  date: string
  time: string
  notes?: string
  outreachToken?: string
}) {
  const booked = await bookPublicAppointment(data)
  const { pixChargeId, ...result } = booked
  void notifyStaff(
    {
      title: 'Novo agendamento online',
      body: `${data.clientName} · ${result.services.map((s) => s.service.name).join(' + ')} · ${new Date(result.startsAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} com ${result.barber.name}`,
      url: '/operacao',
      tag: result.id,
    },
    result.barber.id,
  )
  if (!pixChargeId) return { ...result, deposit: null }
  try {
    const pix = await issuePix(pixChargeId)
    return {
      ...result,
      deposit: {
        amount: Number(pix!.amount),
        expiresAt: pix!.expiresAt,
        payToken: pix!.token,
        qrCode: pix!.qrCode,
        qrCodeBase64: pix!.qrCodeBase64,
      },
    }
  } catch (error) {
    // Sem Pix disponível, o agendamento segue valendo sem sinal.
    console.error('Falha ao gerar Pix do sinal', error)
    await runSchedule(async (tx) => {
      const a = await tx.appointment.update({
        where: { id: result.id },
        data: { depositAmount: null, depositExpiresAt: null },
        include: { client: true, barber: true },
      })
      const settings = await getSettings(tx)
      if (settings.whatsapp_enabled === 'true')
        await tx.notificationLog.upsert({
          where: { dedupeKey: `confirmation:${a.id}` },
          create: {
            type: 'APPOINTMENT_CONFIRMATION',
            appointmentId: a.id,
            clientId: a.clientId,
            phone: a.client.phone,
            dedupeKey: `confirmation:${a.id}`,
            message: `Olá, ${a.client.name}! Agendamento registrado para ${a.startsAt.toLocaleString('pt-BR')}, com ${a.barber.name}. ${settings.shop_name}.${manageUrl(a.manageToken)}`,
          },
          update: {},
        })
    })
    return { ...result, deposit: null }
  }
}

async function bookPublicAppointment(data: {
  clientName: string
  clientPhone: string
  clientEmail?: string
  barberId: string
  serviceIds: string[]
  date: string
  time: string
  notes?: string
  outreachToken?: string
}) {
  return runSchedule(async (tx) => {
    const phone = normalizePhone(data.clientPhone)
    const matches = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM clients WHERE regexp_replace(phone, '[^0-9]', '', 'g') IN (${phone}, ${phone.slice(2)})`
    if (matches.length > 1)
      throw new Error(
        'Entre em contato com o salão para atualizar seu cadastro',
      )
    let client = matches[0]
      ? await tx.client.findUnique({ where: { id: matches[0].id } })
      : null
    // Quem digita o telefone de outra pessoa não consegue encher a agenda em
    // nome dela: pelo site, cada cliente tem no máximo 3 horários em aberto
    // (os marcados pela recepção não contam).
    if (
      client &&
      (await tx.appointment.count({
        where: {
          clientId: client.id,
          source: 'ONLINE',
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
          startsAt: { gt: new Date() },
        },
      })) >= 3
    )
      throw new Error(
        'Este telefone já tem horários marcados. Para marcar outro, fale com o salão.',
      )
    if (!client)
      client = await tx.client.create({
        data: {
          name: data.clientName,
          phone,
          email: data.clientEmail || undefined,
        },
      })
    let barberId = data.barberId
    const startsAt = new Date(`${data.date}T${data.time}:00`)
    if (barberId === 'any') {
      const barbers = await tx.barber.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' },
      })
      barberId = ''
      for (const barber of barbers) {
        try {
          await assertAvailability(tx, barber.id, data.serviceIds, startsAt)
          barberId = barber.id
          break
        } catch (error) {
          if (!(error instanceof Error) || error.message.includes('prisma'))
            throw error
        }
      }
      if (!barberId)
        throw new Error('Nenhum profissional disponível neste horário')
    }
    const outreach = data.outreachToken
      ? await tx.outreach.findFirst({
          where: {
            token: data.outreachToken,
            clientId: client.id,
            appointmentId: null,
            createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
          },
        })
      : null
    const planned = await assertAvailability(tx, barberId, data.serviceIds, startsAt)
    const depositAmount = await depositFor(
      tx,
      client.id,
      planned.services.reduce((sum, s) => sum + Number(s.price), 0),
    )
    const expiresAt = new Date(
      Date.now() + depositMinutes(await getSettings(tx)) * 60000,
    )
    const appointment = await bookInTransaction(tx, {
      clientId: client.id,
      barberId,
      serviceIds: data.serviceIds,
      startsAt: startsAt.toISOString(),
      notes: data.notes,
      source: outreach ? 'REACTIVATION' : 'ONLINE',
      ...(depositAmount ? { deposit: { amount: depositAmount, expiresAt } } : {}),
    })
    const pix = depositAmount
      ? await tx.pixCharge.create({
          data: {
            kind: 'DEPOSIT',
            token: newToken(),
            amount: depositAmount,
            expiresAt,
            appointmentId: appointment.id,
          },
        })
      : null
    if (outreach)
      await tx.outreach.update({
        where: { id: outreach.id },
        data: { appointmentId: appointment.id },
      })
    // Public responses never expose details from an existing client record.
    return {
      id: appointment.id,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      totalPrice: appointment.totalPrice,
      barber: appointment.barber,
      services: appointment.services,
      client: { name: data.clientName },
      manageToken: appointment.manageToken,
      pixChargeId: pix?.id,
    }
  })
}

// ─── AUTOATENDIMENTO DO CLIENTE (link "meu horário") ─────────────────────────

const changeable = ['SCHEDULED', 'CONFIRMED']

async function managedAppointment(token: string) {
  const a = await prisma.appointment.findUnique({
    where: { manageToken: token },
    include: {
      barber: { select: { id: true, name: true, avatarUrl: true } },
      services: { include: { service: { select: { id: true, name: true } } } },
      pixCharges: {
        where: { kind: 'DEPOSIT' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      client: { select: { name: true } },
    },
  })
  if (!a) throw new Error('Link inválido ou expirado')
  return a
}

/** Prazo mínimo (em horas) para o cliente mexer no horário pelo link. */
async function minNoticeMs() {
  const hours = Number((await getSettings()).client_change_min_hours)
  return (Number.isFinite(hours) && hours >= 0 ? hours : 2) * 3600000
}

export async function getManagedAppointment(token: string) {
  const a = await managedAppointment(token)
  const notice = await minNoticeMs()
  const canChange =
    changeable.includes(a.status) && a.startsAt.getTime() - Date.now() >= notice
  const pix = a.pixCharges[0]
  const settings = await getSettings()
  return {
    status: a.status,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    clientFirstName: a.client.name.split(' ')[0],
    barber: a.barber,
    services: a.services.map((s) => ({ id: s.service.id, name: s.service.name })),
    totalPrice: Number(a.totalPrice),
    canChange,
    canConfirm: canChange && a.status === 'SCHEDULED' && !(a.depositAmount && !a.depositPaidAt),
    minNoticeHours: notice / 3600000,
    deposit: a.depositAmount
      ? {
          amount: Number(a.depositAmount),
          paid: !!a.depositPaidAt,
          payToken: !a.depositPaidAt && pix?.status === 'PENDING' ? pix.token : null,
          expiresAt: a.depositExpiresAt,
        }
      : null,
    shop: { name: settings.shop_name, phone: settings.shop_phone, address: settings.shop_address },
  }
}

async function assertChangeable(a: { status: string; startsAt: Date }) {
  if (!changeable.includes(a.status))
    throw new Error('Este horário não pode mais ser alterado pelo link')
  if (a.startsAt.getTime() - Date.now() < (await minNoticeMs()))
    throw new Error('Prazo para alterar pelo link encerrado. Fale com o salão.')
}

export async function confirmManagedAppointment(token: string) {
  const a = await runSchedule(async (tx) => {
    const a = await tx.appointment.findUnique({ where: { manageToken: token } })
    if (!a) throw new Error('Link inválido ou expirado')
    await assertChangeable(a)
    if (a.depositAmount && !a.depositPaidAt)
      throw new Error('Pague o sinal para confirmar o horário')
    if (a.status === 'SCHEDULED')
      await tx.appointment.update({ where: { id: a.id }, data: { status: 'CONFIRMED' } })
    return a
  })
  void notifyStaff(
    { title: 'Cliente confirmou', body: await staffLine(a.id), url: '/operacao' },
    a.barberId,
  )
}

export async function cancelManagedAppointment(token: string) {
  const a = await runSchedule(async (tx) => {
    const a = await tx.appointment.findUnique({ where: { manageToken: token } })
    if (!a) throw new Error('Link inválido ou expirado')
    await assertChangeable(a)
    await tx.appointment.update({
      where: { id: a.id },
      data: {
        status: 'CANCELLED',
        depositExpiresAt: null,
        notes: [a.notes, 'Cancelado pelo cliente pelo link.'].filter(Boolean).join('\n'),
      },
    })
    await tx.pixCharge.updateMany({
      where: { appointmentId: a.id, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    })
    return a
  })
  void notifyStaff(
    { title: 'Cliente cancelou', body: await staffLine(a.id), url: '/operacao' },
    a.barberId,
  )
}

export async function getManagedSlots(token: string, date: string) {
  const a = await managedAppointment(token)
  await assertChangeable(a)
  const duration = Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60000)
  const serviceIds = a.services.map((s) => s.service.id)
  return getAvailableSlots(a.barber.id, date, duration, serviceIds, a.id)
}

export async function rescheduleManagedAppointment(token: string, date: string, time: string) {
  const startsAt = new Date(`${date}T${time}:00`)
  if (!Number.isFinite(startsAt.getTime()) || startsAt <= new Date())
    throw new Error('Escolha um horário futuro')
  const original = await runSchedule(async (tx) => {
    const a = await tx.appointment.findUnique({
      where: { manageToken: token },
      include: { services: true },
    })
    if (!a) throw new Error('Link inválido ou expirado')
    await assertChangeable(a)
    if (startsAt.getTime() - Date.now() < (await minNoticeMs()))
      throw new Error('Escolha um horário com mais antecedência')
    const planned = await assertAvailability(
      tx,
      a.barberId,
      a.services.map((s) => s.serviceId),
      startsAt,
      a.id,
      undefined,
      false,
      a.services,
    )
    await tx.appointmentSegment.deleteMany({ where: { appointmentId: a.id } })
    await tx.appointment.update({
      where: { id: a.id },
      data: {
        startsAt,
        endsAt: planned.endsAt,
        status: 'SCHEDULED',
        segments: { create: planned.segments },
      },
    })
    return a
  })
  void notifyStaff(
    {
      title: 'Cliente remarcou',
      body: `${await staffLine(original.id)} (antes: ${original.startsAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })})`,
      url: '/operacao',
    },
    original.barberId,
  )
}

async function staffLine(appointmentId: string) {
  const a = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { client: true, barber: true },
  })
  return a
    ? `${a.client.name} · ${a.startsAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} com ${a.barber.name}`
    : ''
}
