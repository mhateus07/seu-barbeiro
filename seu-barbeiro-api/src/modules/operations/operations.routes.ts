import { offerWaitlist } from './waitlist.service'
import { Router } from 'express'
import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { prisma, currentSalon } from '../../lib/prisma'
import { AuthRequest, allowRoles } from '../../middlewares/auth.middleware'
import { hashPassword } from '../../utils/bcrypt'
import { audit } from '../../utils/audit'
import {
  runSchedule,
  assertAvailability,
  bookInTransaction,
} from '../appointments/scheduling'
import { getSettings } from '../settings/settings.service'
import { pushPublicKey } from '../push/push.service'
import { updateAppointmentStatus } from '../appointments/appointments.service'
import { commissionBase, createPayment } from '../finances/finances.service'
import { messagingAlert } from '../notifications/notifications.service'
import { normalizePhone } from '../../utils/phone'
import { personName } from '../../utils/person-name'

const router = Router()
const uuid = z.string().uuid()
const dateTime = z.string().datetime({ offset: true })
const staff = allowRoles('OWNER', 'RECEPTION')
const owner = allowRoles('OWNER')

router.get('/identity', async (_req, res) => {
  const s = await getSettings()
  res.json({
    slug: currentSalon().slug,
    name: s.shop_name,
    logo: s.shop_logo || '',
    phone: s.shop_phone,
    address: s.shop_address,
    professionalCanReceive: s.professional_can_receive === 'true',
  })
})
// Aviso no painel quando o WhatsApp para de entregar.
router.get('/alerts', staff, async (_req, res) => {
  res.json({ messaging: await messagingAlert() })
})
/** Profissional só mexe no que é dele; dono e recepção, em todos. */
async function ownAppointment(req: AuthRequest, id: string) {
  const a = await prisma.appointment.findUnique({ where: { id } })
  if (!a) throw new Error('Atendimento não encontrado')
  if (req.role === 'PROFESSIONAL' && a.barberId !== req.barberId) return null
  return a
}
// Barbearia sem recepção: o barbeiro conduz o próprio atendimento.
router.patch('/appointments/:id/status', async (req: AuthRequest, res) => {
  const { status } = z
    .object({
      status: z.enum(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED']),
    })
    .parse(req.body)
  const a = await ownAppointment(req, String(req.params.id))
  if (!a) return res.sendStatus(403)
  if (req.role === 'PROFESSIONAL' && status === 'CANCELLED')
    throw new Error('Cancelamento é feito pelo dono ou pela recepção')
  res.json(await updateAppointmentStatus(a.id, { status }))
})
router.post('/appointments/:id/payments', async (req: AuthRequest, res) => {
  const data = z
    .object({
      amount: z.number().positive().multipleOf(0.01),
      method: z.enum(['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD']),
    })
    .parse(req.body)
  const a = await ownAppointment(req, String(req.params.id))
  if (!a) return res.sendStatus(403)
  if (
    req.role === 'PROFESSIONAL' &&
    (await getSettings()).professional_can_receive !== 'true'
  )
    return res.sendStatus(403)
  const payment = await createPayment({ ...data, appointmentId: a.id })
  await audit({
    adminId: req.adminId,
    action: 'payment.create',
    entity: 'payment',
    entityId: payment.id,
    details: { amount: data.amount, method: data.method },
  })
  res.status(201).json(payment)
})
// Encaixe: cliente que chegou sem hora marcada.
router.post('/walk-ins', async (req: AuthRequest, res) => {
  const data = z
    .object({
      clientName: personName,
      clientPhone: z.string().min(10).max(25),
      serviceIds: z.array(uuid).min(1).max(10),
      barberId: uuid.optional(),
    })
    .parse(req.body)
  const barberId = req.role === 'PROFESSIONAL' ? req.barberId : data.barberId
  if (!barberId) throw new Error('Escolha o profissional')
  const phone = normalizePhone(data.clientPhone)
  const appointment = await runSchedule(async (tx) => {
    const matches = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM clients WHERE regexp_replace(phone, '[^0-9]', '', 'g') IN (${phone}, ${phone.slice(2)})`
    if (matches.length > 1)
      throw new Error('Há mais de um cadastro com este telefone. Peça ajuda ao salão.')
    const clientId =
      matches[0]?.id ??
      (await tx.client.create({ data: { name: data.clientName, phone } })).id
    return bookInTransaction(tx, {
      clientId,
      barberId,
      serviceIds: data.serviceIds,
      startsAt: new Date(Date.now() + 60000).toISOString(),
      source: 'WALK_IN',
      silent: true,
    })
  })
  res.status(201).json(appointment)
})
// Registro de ações sensíveis, para o dono conferir quem fez o quê.
router.get('/audit', owner, async (req, res) => {
  const page = z.coerce.number().int().min(1).default(1).parse(req.query.page)
  const [rows, admins] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * 50,
      take: 50,
    }),
    prisma.admin.findMany({ select: { id: true, name: true } }),
  ])
  const names = new Map(admins.map((a) => [a.id, a.name]))
  res.json(rows.map((r) => ({ ...r, adminName: r.adminId ? names.get(r.adminId) ?? null : null })))
})
router.get('/users', owner, async (_req, res) => {
  res.json(
    await prisma.admin.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        barberId: true,
        isActive: true,
      },
    }),
  )
})
router.post('/users', owner, async (req: AuthRequest, res) => {
  const data = z
    .object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(10),
      role: z.enum(['OWNER', 'RECEPTION', 'PROFESSIONAL']),
      barberId: uuid.optional(),
    })
    .parse(req.body)
  if (
    data.role === 'PROFESSIONAL' &&
    (!data.barberId ||
      !(await prisma.barber.findUnique({ where: { id: data.barberId } })))
  )
    throw new Error('Vincule um profissional válido')
  const { password, ...fields } = data
  const user = await prisma.admin.create({
    data: { ...fields, passwordHash: await hashPassword(password) },
    select: { id: true, name: true, email: true, role: true },
  })
  await audit({
    adminId: req.adminId,
    action: 'user.create',
    entity: 'admin',
    entityId: user.id,
    details: { role: user.role },
  })
  res.status(201).json(user)
})
router.patch('/users/:id', owner, async (req: AuthRequest, res) => {
  const data = z
    .object({
      isActive: z.boolean().optional(),
      password: z.string().min(10).optional(),
    })
    .parse(req.body)
  if (req.params.id === req.adminId && data.isActive === false)
    throw new Error('Não é possível desativar seu próprio acesso')
  const user = await prisma.admin.update({
    where: { id: req.params.id },
    data: {
      isActive: data.isActive,
      ...(data.password
        ? { passwordHash: await hashPassword(data.password) }
        : {}),
      // Senha nova ou acesso desativado derrubam as sessões abertas.
      ...(data.password || data.isActive === false
        ? { tokenVersion: { increment: 1 } }
        : {}),
    },
    select: { id: true, isActive: true },
  })
  await audit({
    adminId: req.adminId,
    action: 'user.update',
    entity: 'admin',
    entityId: req.params.id,
    details: { isActive: data.isActive, passwordChanged: !!data.password },
  })
  res.json(user)
})

router.post('/visits', staff, async (req, res) => {
  const data = z
    .object({
      clientId: uuid,
      appointments: z
        .array(
          z.object({
            barberId: uuid,
            serviceIds: z.array(uuid).min(1).max(10),
            startsAt: dateTime,
          }),
        )
        .min(1)
        .max(6),
    })
    .parse(req.body)
  const result = await runSchedule(async (tx) => {
    const visitId = randomUUID()
    const appointments = []
    for (const item of data.appointments)
      appointments.push(
        await bookInTransaction(tx, {
          ...item,
          clientId: data.clientId,
          visitId,
        }),
      )
    return { visitId, appointments }
  })
  res.status(201).json(result)
})

router.get('/agenda', async (req: AuthRequest, res) => {
  const day = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .parse(req.query.date)
  // `days` permite a visão semanal: o período começa em `date` e cobre até 7 dias.
  const days = z.coerce.number().int().min(1).max(7).default(1).parse(req.query.days)
  const from = new Date(`${day}T00:00:00`),
    to = new Date(`${day}T23:59:59.999`)
  to.setDate(to.getDate() + days - 1)
  const scope =
    req.role === 'PROFESSIONAL' ? { barberId: req.barberId || 'none' } : {}
  const [appointments, blocks, barbers, services, resources, schedules] =
    await Promise.all([
      prisma.appointment.findMany({
        where: { ...scope, startsAt: { lte: to }, endsAt: { gte: from } },
        include: {
          client: { select: { id: true, name: true, phone: true } },
          barber: true,
          services: { include: { service: true } },
          segments: true,
          payments: true,
          items: true,
        },
        orderBy: { startsAt: 'asc' },
      }),
      prisma.scheduleBlock.findMany({
        where: { ...scope, startsAt: { lte: to }, endsAt: { gte: from } },
      }),
      prisma.barber.findMany({
        where: {
          isActive: true,
          ...(req.role === 'PROFESSIONAL'
            ? { id: req.barberId || 'none' }
            : {}),
        },
      }),
      prisma.service.findMany({ where: { isActive: true } }),
      prisma.resource.findMany(),
      prisma.workSchedule.findMany({ where: scope }),
    ])
  res.json({ appointments, blocks, barbers, services, resources, schedules })
})
router.put('/schedules/:barberId', staff, async (req, res) => {
  const schedules = z
    .array(
      z
        .object({
          weekday: z.number().int().min(0).max(6),
          openMinute: z.number().int().min(0).max(1440),
          closeMinute: z.number().int().min(0).max(1440),
        })
        .refine((s) => s.openMinute <= s.closeMinute, 'Expediente inválido'),
    )
    .max(7)
    .parse(req.body)
  if (new Set(schedules.map((s) => s.weekday)).size !== schedules.length)
    throw new Error('Dia duplicado')
  res.json(
    await runSchedule(async (tx) => {
      await tx.workSchedule.deleteMany({
        where: { barberId: req.params.barberId },
      })
      return tx.workSchedule.createMany({
        data: schedules.map((s) => ({ ...s, barberId: req.params.barberId })),
      })
    }),
  )
})
// O profissional pode bloquear e liberar somente a própria agenda.
router.post('/blocks', async (req: AuthRequest, res) => {
  const data = z
    .object({
      barberId: uuid,
      startsAt: dateTime,
      endsAt: dateTime,
      reason: z.string().min(1).max(200),
    })
    .refine(
      (v) => new Date(v.startsAt) < new Date(v.endsAt),
      'Intervalo inválido',
    )
    .parse(req.body)
  if (req.role === 'PROFESSIONAL' && data.barberId !== req.barberId)
    return res
      .status(403)
      .json({ error: { message: 'Você só pode bloquear a sua agenda' } })
  res.status(201).json(
    await runSchedule(async (tx) => {
      const startsAt = new Date(data.startsAt),
        endsAt = new Date(data.endsAt)
      const conflicts = await tx.appointment.count({
        where: {
          barberId: data.barberId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      })
      if (conflicts)
        throw new Error(
          'Reagende os atendimentos deste período antes de bloquear',
        )
      return tx.scheduleBlock.create({ data: { ...data, startsAt, endsAt } })
    }),
  )
})
router.delete('/blocks/:id', async (req: AuthRequest, res) => {
  res.json(
    await runSchedule(async (tx) => {
      const block = await tx.scheduleBlock.findUnique({
        where: { id: req.params.id },
      })
      if (!block) throw new Error('Bloqueio não encontrado')
      if (req.role === 'PROFESSIONAL' && block.barberId !== req.barberId)
        throw new Error('Você só pode liberar a sua agenda')
      return tx.scheduleBlock.delete({ where: { id: block.id } })
    }),
  )
})

// Notificações push no celular de quem está logado.
router.get('/push/key', (_req, res) => {
  res.json({ publicKey: pushPublicKey() })
})
// Só os serviços de push dos navegadores (Chrome, Firefox, Safari, Edge).
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/
router.post('/push/subscribe', async (req: AuthRequest, res) => {
  const data = z
    .object({
      endpoint: z
        .string()
        .url()
        .startsWith('https://')
        .max(1000)
        .refine((v) => PUSH_HOSTS.test(new URL(v).hostname), 'Serviço de push não reconhecido'),
      keys: z.object({
        p256dh: z.string().min(10).max(200),
        auth: z.string().min(8).max(100),
      }),
    })
    .parse(req.body)
  await prisma.pushSubscription.upsert({
    where: { endpoint: data.endpoint },
    create: {
      adminId: req.adminId!,
      endpoint: data.endpoint,
      p256dh: data.keys.p256dh,
      auth: data.keys.auth,
    },
    update: { adminId: req.adminId!, p256dh: data.keys.p256dh, auth: data.keys.auth },
  })
  res.status(201).json({ subscribed: true })
})
router.post('/push/unsubscribe', async (req: AuthRequest, res) => {
  const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(req.body)
  await prisma.pushSubscription.deleteMany({
    where: { endpoint, adminId: req.adminId },
  })
  res.json({ unsubscribed: true })
})
router.post('/resources', owner, async (req, res) => {
  res
    .status(201)
    .json(
      await prisma.resource.create({
        data: z.object({ name: z.string().min(2).max(100) }).parse(req.body),
      }),
    )
})

/**
 * O profissional só vê e escreve a ficha de quem ele atende de fato: horário
 * dele que não foi cancelado nem terminou em falta. Um horário marcado e
 * cancelado não abre a ficha.
 */
async function attendsClient(barberId: string | undefined, clientId: string) {
  return Boolean(
    barberId &&
      (await prisma.appointment.findFirst({
        where: { clientId, barberId, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
        select: { id: true },
      })),
  )
}

router.get('/clients/:id/records', async (req: AuthRequest, res) => {
  if (
    req.role === 'PROFESSIONAL' &&
    !(await attendsClient(req.barberId, String(req.params.id)))
  )
    return res.sendStatus(403)
  await audit({
    adminId: req.adminId,
    action: 'client.records.view',
    entity: 'client',
    entityId: req.params.id,
  })
  res.json(
    await prisma.technicalRecord.findMany({
      where: { clientId: req.params.id },
      orderBy: { createdAt: 'desc' },
    }),
  )
})
router.post('/clients/:id/records', async (req: AuthRequest, res) => {
  if (
    req.role === 'PROFESSIONAL' &&
    !(await attendsClient(req.barberId, String(req.params.id)))
  )
    return res.sendStatus(403)
  const data = z
    .object({
      formula: z.string().max(4000).optional(),
      products: z.string().max(4000).optional(),
      preferences: z.string().max(4000).optional(),
      notes: z.string().max(8000).optional(),
      photoUrls: z
        .array(z.string().url().startsWith('https://'))
        .max(10)
        .default([]),
      photoConsent: z.boolean().default(false),
    })
    .refine(
      (v) => !v.photoUrls.length || v.photoConsent,
      'Registre a autorização para fotos',
    )
    .parse(req.body)
  res
    .status(201)
    .json(
      await prisma.technicalRecord.create({
        data: { ...data, clientId: req.params.id, authorId: req.adminId! },
      }),
    )
})
router.patch('/clients/:id/consent', staff, async (req, res) => {
  const data = z.object({ marketingConsent: z.boolean() }).parse(req.body)
  res.json(await prisma.client.update({ where: { id: req.params.id }, data }))
})

router.get('/products', staff, async (_req, res) => {
  res.json(await prisma.product.findMany({ orderBy: { name: 'asc' } }))
})
router.post('/products', owner, async (req, res) => {
  const data = z
    .object({
      name: z.string().min(2),
      price: z.number().nonnegative(),
      cost: z.number().nonnegative(),
      stock: z.number().int().nonnegative(),
      minStock: z.number().int().nonnegative().default(0),
    })
    .parse(req.body)
  res.status(201).json(await prisma.product.create({ data }))
})
router.patch('/products/:id', owner, async (req, res) => {
  const data = z
    .object({
      name: z.string().min(2).optional(),
      price: z.number().nonnegative().optional(),
      cost: z.number().nonnegative().optional(),
      minStock: z.number().int().nonnegative().optional(),
      isActive: z.boolean().optional(),
    })
    .parse(req.body)
  res.json(await prisma.product.update({ where: { id: req.params.id }, data }))
})
// Reposição ou acerto de contagem: valor positivo entra, negativo sai.
router.post('/products/:id/stock', staff, async (req: AuthRequest, res) => {
  const data = z
    .object({
      quantity: z.number().int().min(-100000).max(100000).refine((v) => v !== 0, 'Informe a quantidade'),
      reason: z.string().trim().min(3).max(200),
    })
    .parse(req.body)
  const product = await runSchedule(async (tx) => {
    const current = await tx.product.findUnique({ where: { id: req.params.id } })
    if (!current) throw new Error('Produto não encontrado')
    if (current.stock + data.quantity < 0)
      throw new Error('O estoque não pode ficar negativo')
    return tx.product.update({
      where: { id: current.id },
      data: { stock: { increment: data.quantity } },
    })
  })
  await audit({
    adminId: req.adminId,
    action: 'product.stock',
    entity: 'product',
    entityId: product.id,
    details: { quantity: data.quantity, reason: data.reason, stock: product.stock },
  })
  res.json(product)
})
router.post('/orders/:id/items', staff, async (req, res) => {
  const data = z
    .object({
      productId: uuid,
      quantity: z.number().int().positive().max(1000),
    })
    .parse(req.body)
  res.status(201).json(
    await runSchedule(async (tx) => {
      const appointment = await tx.appointment.findUnique({
        where: { id: req.params.id },
      })
      if (!appointment || ['CANCELLED', 'NO_SHOW'].includes(appointment.status))
        throw new Error('Comanda indisponível')
      const product = await tx.product.findFirst({
        where: { id: data.productId, isActive: true },
      })
      if (!product || product.stock < data.quantity)
        throw new Error('Estoque insuficiente')
      await tx.product.update({
        where: { id: product.id },
        data: { stock: { decrement: data.quantity } },
      })
      return tx.orderItem.create({
        data: {
          appointmentId: req.params.id,
          productId: product.id,
          description: product.name,
          quantity: data.quantity,
          unitPrice: product.price,
          unitCost: product.cost,
        },
      })
    }),
  )
})
router.delete('/orders/:id/items/:itemId', staff, async (req, res) => {
  res.json(
    await runSchedule(async (tx) => {
      const item = await tx.orderItem.findFirst({
        where: { id: req.params.itemId, appointmentId: req.params.id },
      })
      if (!item) throw new Error('Item não encontrado')
      const paid = await tx.payment.count({
        where: { appointmentId: req.params.id, refundedAt: null },
      })
      if (paid)
        throw new Error('Estorne os recebimentos antes de remover itens')
      if (item.productId)
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        })
      return tx.orderItem.delete({ where: { id: item.id } })
    }),
  )
})
router.patch('/orders/:id/discount', staff, async (req: AuthRequest, res) => {
  const { discount } = z
    .object({ discount: z.number().nonnegative() })
    .parse(req.body)
  const updated = await runSchedule(async (tx) => {
      const a = await tx.appointment.findUnique({
        where: { id: req.params.id },
        include: { payments: true },
      })
      if (!a || a.status === 'COMPLETED')
        throw new Error('Comanda encerrada ou não encontrada')
      if (
        discount > Number(a.totalPrice) - Number(a.subscriptionCovered) ||
        a.payments.some((p) => !p.refundedAt)
      )
        throw new Error('Desconto inválido ou comanda com recebimentos')
      if (req.role === 'RECEPTION') {
        const limit = Number((await getSettings(tx)).reception_max_discount_percent)
        if (discount > (Number(a.totalPrice) * limit) / 100)
          throw new Error(`Desconto acima do limite de ${limit}% da recepção`)
      }
      return tx.appointment.update({ where: { id: a.id }, data: { discount } })
  })
  await audit({
    adminId: req.adminId,
    action: 'order.discount',
    entity: 'appointment',
    entityId: updated.id,
    details: { discount },
  })
  res.json(updated)
})

router.get(
  '/my-commission',
  allowRoles('PROFESSIONAL'),
  async (req: AuthRequest, res) => {
    const appointments = await prisma.appointment.findMany({
      where: {
        barberId: req.barberId || 'none',
        status: 'COMPLETED',
        startsAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
      include: { payments: { select: { amount: true, refundedAt: true } } },
    })
    res.json({
      commission: appointments.reduce(
        (sum, a) =>
          sum +
          (commissionBase(a) * Number(a.commissionRateSnapshot ?? 0)) / 100,
        0,
      ),
      appointments: appointments.length,
      openAdvances: Number(
        (
          await prisma.barberAdvance.aggregate({
            where: { barberId: req.barberId || 'none', settledInId: null },
            _sum: { amount: true },
          })
        )._sum.amount ?? 0,
      ),
    })
  },
)

router.get('/growth', staff, async (_req, res) => {
  const now = new Date(),
    month = new Date(now.getFullYear(), now.getMonth(), 1)
  const [clients, completed, sources, waitlist, outreach] = await Promise.all([
    prisma.client.findMany({
      where: {
        appointments: {
          some: { status: 'COMPLETED' },
          none: {
            startsAt: { gt: now },
            status: { in: ['SCHEDULED', 'CONFIRMED'] },
          },
        },
      },
      include: {
        appointments: {
          where: { status: 'COMPLETED' },
          orderBy: { startsAt: 'desc' },
          take: 1,
          include: { services: { include: { service: true } } },
        },
      },
    }),
    prisma.appointment.findMany({
      where: { status: 'COMPLETED', startsAt: { gte: month } },
      include: { payments: true, items: true },
    }),
    prisma.appointment.findMany({
      where: {
        source: { in: ['REACTIVATION', 'WAITLIST'] },
        startsAt: { gte: month },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      include: { payments: true },
    }),
    prisma.waitlistEntry.findMany({
      where: { status: { in: ['WAITING', 'OFFERED'] }, to: { gt: now } },
      include: { client: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.outreach.count({ where: { createdAt: { gte: month } } }),
  ])
  const reactivation = clients
    .flatMap((client) => {
      const last = client.appointments[0]
      const service = last?.services.find((s) => s.service.returnDays)?.service
      if (!last || !service?.returnDays) return []
      const dueAt = new Date(
        last.startsAt.getTime() + service.returnDays * 86400000,
      )
      return dueAt < now
        ? [
            {
              clientId: client.id,
              name: client.name,
              phone: client.phone,
              consent: client.marketingConsent,
              serviceId: service.id,
              service: service.name,
              dueAt,
              daysLate: Math.floor(
                (now.getTime() - dueAt.getTime()) / 86400000,
              ),
            },
          ]
        : []
    })
    .sort((a, b) => b.daysLate - a.daysLate)
  const returnCount = await prisma.appointment.count({
    where: {
      returnOfId: { in: completed.map((a) => a.id) },
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
    },
  })
  const unpaid = completed
    .map((a) => {
      const total =
        Number(a.totalPrice) -
        Number(a.discount) -
        Number(a.subscriptionCovered) +
        a.items.reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0)
      const paid = a.payments
        .filter((p) => !p.refundedAt)
        .reduce((sum, p) => sum + Number(p.amount), 0)
      return { id: a.id, balance: Math.max(0, total - paid) }
    })
    .filter((a) => a.balance > 0.005)
  res.json({
    reactivation,
    waitlist,
    unpaid,
    metrics: {
      outreach,
      attributedBookings: sources.length,
      attributedReceived: sources.reduce(
        (sum, a) =>
          sum +
          a.payments
            .filter((p) => !p.refundedAt)
            .reduce((v, p) => v + Number(p.amount), 0),
        0,
      ),
      waitlistCompleted: sources.filter(
        (a) => a.source === 'WAITLIST' && a.status === 'COMPLETED',
      ).length,
      completed: completed.length,
      returnCount,
    },
  })
})
router.post('/reactivation', staff, async (req, res) => {
  const data = z.object({ clientId: uuid, serviceId: uuid }).parse(req.body)
  const result = await runSchedule(async (tx) => {
    const client = await tx.client.findUnique({ where: { id: data.clientId } })
    const service = await tx.service.findFirst({
      where: { id: data.serviceId, isActive: true },
    })
    if (!client?.marketingConsent || !service)
      throw new Error('Cliente sem autorização ou serviço indisponível')
    const recent = await tx.outreach.findFirst({
      where: {
        clientId: client.id,
        createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
      },
    })
    if (recent) throw new Error('Já existe um convite nos últimos sete dias')
    const future = await tx.appointment.count({
      where: {
        clientId: client.id,
        startsAt: { gt: new Date() },
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
      },
    })
    if (future) throw new Error('Cliente já possui retorno agendado')
    const settings = await getSettings(tx)
    const base = process.env.PUBLIC_WEB_URL
    if (!base) throw new Error('Configure PUBLIC_WEB_URL para gerar convites')
    const outreach = await tx.outreach.create({
      data: { ...data, token: randomBytes(24).toString('hex') },
    })
    const link = `${base.replace(/\/$/, '')}/agendar?salon=${currentSalon().slug}&outreach=${outreach.token}`
    const log = await tx.notificationLog.create({
      data: {
        type: 'CUSTOM',
        clientId: client.id,
        phone: client.phone,
        dedupeKey: `outreach:${outreach.id}`,
        message: `Olá, ${client.name}! Que tal agendar seu próximo ${service.name} com ${settings.shop_name}? ${link}. Se não quiser receber convites, avise nossa equipe.`,
      },
    })
    await tx.outreach.update({
      where: { id: outreach.id },
      data: { notificationId: log.id },
    })
    return { id: outreach.id, queued: true }
  })
  res.status(201).json(result)
})
router.get('/returns/:id', staff, async (req, res) => {
  const a = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: { services: { include: { service: true } } },
  })
  if (!a || a.status !== 'COMPLETED')
    throw new Error('Conclua o atendimento antes de agendar o retorno')
  const days = a.services
    .map((s) => s.service.returnDays)
    .filter((n): n is number => !!n)
  res.json({
    clientId: a.clientId,
    barberId: a.barberId,
    serviceIds: a.services.map((s) => s.serviceId),
    returnOfId: a.id,
    suggestedAt: new Date(
      a.startsAt.getTime() +
        Math.min(...(days.length ? days : [30])) * 86400000,
    ),
  })
})
router.post('/waitlist', staff, async (req, res) => {
  const data = z
    .object({
      clientId: uuid,
      barberId: uuid.optional(),
      serviceIds: z.array(uuid).min(1).max(10),
      from: dateTime,
      to: dateTime,
    })
    .refine(
      (v) => new Date(v.from) < new Date(v.to) && new Date(v.to) > new Date(),
      'Intervalo inválido',
    )
    .parse(req.body)
  if (new Set(data.serviceIds).size !== data.serviceIds.length)
    throw new Error('Serviços duplicados')
  if (
    (await prisma.service.count({
      where: { id: { in: data.serviceIds }, isActive: true },
    })) !== data.serviceIds.length
  )
    throw new Error('Serviços inválidos')
  if (
    data.barberId &&
    !(await prisma.barber.findFirst({
      where: { id: data.barberId, isActive: true },
    }))
  )
    throw new Error('Profissional inválido')
  res
    .status(201)
    .json(
      await prisma.waitlistEntry.create({
        data: { ...data, from: new Date(data.from), to: new Date(data.to) },
      }),
    )
})
router.post('/waitlist/:id/offer', staff, async (req, res) => {
  const data = z.object({ startsAt: dateTime, barberId: uuid }).parse(req.body)
  const result = await runSchedule((tx) =>
    offerWaitlist(tx, req.params.id, new Date(data.startsAt), data.barberId),
  )
  res.json(result)
})
router.delete('/waitlist/:id', staff, async (req, res) => {
  res.json(
    await runSchedule((tx) =>
      tx.waitlistEntry.update({
        where: { id: req.params.id },
        data: { status: 'CANCELLED', expiresAt: new Date() },
      }),
    ),
  )
})

router.use(
  (
    error: unknown,
    _req: unknown,
    res: import('express').Response,
    _next: unknown,
  ) => {
    if (error instanceof z.ZodError)
      return res
        .status(400)
        .json({
          error: { message: error.issues.map((i) => i.message).join('; ') },
        })
    const message =
      error instanceof Error && !('code' in error)
        ? error.message
        : 'Não foi possível concluir a operação'
    res.status(400).json({ error: { message } })
  },
)
export default router
