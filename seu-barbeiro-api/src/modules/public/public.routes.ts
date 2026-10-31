import { z } from 'zod'
import { Router, Response, NextFunction } from 'express'
import { isBusinessError } from '../../utils/http-error'
import { normalizePhone } from '../../utils/phone'
import { prisma } from '../../lib/prisma'
import { runSchedule, bookInTransaction } from '../appointments/scheduling'
import * as PublicController from './public.controller'
import * as PublicService from './public.service'
import { publicCharge } from '../payments/pix.service'
import { personName } from '../../utils/person-name'

const router = Router()

// Resposta única para erros do site público: regras de negócio e validação
// voltam com mensagem amigável; falhas internas são registradas e ocultadas.
function sendPublicError(
  error: unknown,
  res: Response,
  { status = 400, invalid = 'Revise os dados informados' } = {},
) {
  if (error instanceof z.ZodError)
    return res.status(400).json({ message: invalid })
  if (isBusinessError(error))
    return res.status(status).json({ message: error.message })
  console.error(error)
  res
    .status(500)
    .json({ message: 'Não foi possível concluir a solicitação. Tente novamente.' })
}

router.get('/info', PublicController.getInfo)
router.get('/services', PublicController.getServices)
router.get('/barbers', PublicController.getBarbers)
router.get('/barbers/:barberId/slots', PublicController.getSlots)
router.post('/appointments', PublicController.createAppointment)

// Autoatendimento: o token longo e aleatório do link é a credencial do cliente.
const token = z.string().regex(/^[a-f0-9]{48}$/, 'Link inválido')
router.get('/manage/:token', async (req, res) => {
  try {
    res.json(await PublicService.getManagedAppointment(token.parse(req.params.token)))
  } catch (error) {
    sendPublicError(error, res, { status: 404, invalid: 'Link inválido' })
  }
})
router.get('/manage/:token/slots', async (req, res) => {
  try {
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date)
    res.json({
      slots: await PublicService.getManagedSlots(token.parse(req.params.token), date),
    })
  } catch (error) {
    sendPublicError(error, res)
  }
})
router.post('/manage/:token/confirm', async (req, res) => {
  try {
    await PublicService.confirmManagedAppointment(token.parse(req.params.token))
    res.json({ confirmed: true })
  } catch (error) {
    sendPublicError(error, res, { status: 409 })
  }
})
router.post('/manage/:token/cancel', async (req, res) => {
  try {
    await PublicService.cancelManagedAppointment(token.parse(req.params.token))
    res.json({ cancelled: true })
  } catch (error) {
    sendPublicError(error, res, { status: 409 })
  }
})
router.post('/manage/:token/reschedule', async (req, res) => {
  try {
    const data = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      })
      .parse(req.body)
    await PublicService.rescheduleManagedAppointment(
      token.parse(req.params.token),
      data.date,
      data.time,
    )
    res.json({ rescheduled: true })
  } catch (error) {
    sendPublicError(error, res, { status: 409 })
  }
})

// Página de pagamento Pix (sinal ou mensalidade).
router.get('/pix/:token', async (req, res) => {
  try {
    const charge = await publicCharge(token.parse(req.params.token))
    if (!charge) return res.status(404).json({ message: 'Cobrança não encontrada' })
    res.json(charge)
  } catch (error) {
    sendPublicError(error, res, { status: 404, invalid: 'Cobrança não encontrada' })
  }
})

router.post('/waitlist', async (req, res) => {
  try {
    const data = z
      .object({
        name: personName,
        phone: z.string().max(30),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        barberId: z.union([z.string().uuid(), z.literal('any')]),
        serviceIds: z.array(z.string().uuid()).min(1).max(10),
        contactConsent: z.literal(true),
      })
      .parse(req.body)
    const from = new Date(`${data.date}T00:00:00`),
      to = new Date(`${data.date}T23:59:59`)
    if (!Number.isFinite(to.getTime()) || to <= new Date())
      throw new Error('Escolha uma data futura')
    const phone = normalizePhone(data.phone)
    await runSchedule(async (tx) => {
      if (
        new Set(data.serviceIds).size !== data.serviceIds.length ||
        (await tx.service.count({
          where: { id: { in: data.serviceIds }, isActive: true },
        })) !== data.serviceIds.length
      )
        throw new Error('Serviços inválidos')
      if (data.barberId !== 'any') {
        const barber = await tx.barber.findFirst({
          where: { id: data.barberId, isActive: true },
        })
        if (
          !barber ||
          (barber.serviceIds.length &&
            data.serviceIds.some((id) => !barber.serviceIds.includes(id)))
        )
          throw new Error('Profissional indisponível')
      }
      const matches = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM clients WHERE regexp_replace(phone, '[^0-9]', '', 'g') IN (${phone}, ${phone.slice(2)})`
      if (matches.length > 1)
        throw new Error(
          'Entre em contato com o salão para atualizar seu cadastro',
        )
      const client =
        matches[0] ||
        (await tx.client.create({ data: { name: data.name, phone } }))
      const existing = await tx.waitlistEntry.findFirst({
        where: {
          clientId: client.id,
          from,
          to,
          status: { in: ['WAITING', 'OFFERED'] },
          serviceIds: { equals: data.serviceIds },
          barberId: data.barberId === 'any' ? null : data.barberId,
        },
      })
      if (!existing)
        await tx.waitlistEntry.create({
          data: {
            clientId: client.id,
            barberId: data.barberId === 'any' ? null : data.barberId,
            serviceIds: data.serviceIds,
            from,
            to,
          },
        })
    })
    res.status(201).json({ registered: true })
  } catch (error) {
    sendPublicError(error, res, {
      invalid: 'Revise os dados e autorize o aviso da vaga',
    })
  }
})

router.get('/offers/:token', async (req, res) => {
  const entry = await prisma.waitlistEntry.findFirst({
    where: {
      token: req.params.token,
      status: 'OFFERED',
      expiresAt: { gt: new Date() },
    },
  })
  if (!entry)
    return res.status(410).json({ message: 'Oferta expirada ou indisponível' })
  res.json({ startsAt: entry.reservedStart, expiresAt: entry.expiresAt })
})
router.post('/offers/:token/accept', async (req, res) => {
  try {
    const result = await runSchedule(async (tx) => {
      const entry = await tx.waitlistEntry.findFirst({
        where: {
          token: req.params.token,
          status: 'OFFERED',
          expiresAt: { gt: new Date() },
        },
      })
      if (!entry?.reservedStart || !entry.reservedBarberId)
        throw new Error('Oferta expirada ou indisponível')
      const a = await bookInTransaction(tx, {
        clientId: entry.clientId,
        barberId: entry.reservedBarberId,
        serviceIds: entry.serviceIds,
        startsAt: entry.reservedStart.toISOString(),
        source: 'WAITLIST',
        holdToken: entry.token!,
      })
      await tx.waitlistEntry.update({
        where: { id: entry.id },
        data: { status: 'BOOKED', appointmentId: a.id },
      })
      return { id: a.id, startsAt: a.startsAt }
    })
    res.status(201).json(result)
  } catch (error) {
    sendPublicError(error, res, { status: 409 })
  }
})

router.use(
  (error: unknown, _req: unknown, res: Response, _next: NextFunction) =>
    sendPublicError(error, res),
)

export default router
