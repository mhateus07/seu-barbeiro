import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthRequest, allowRoles } from '../../middlewares/auth.middleware'
import { businessErrors } from '../../utils/route-errors'
import { runSchedule } from '../appointments/scheduling'
import { addMovement } from '../cash/cash.service'

// Vales (adiantamentos) do profissional: saem como despesa na hora e são
// descontados automaticamente no próximo pagamento de comissão.
const router = Router()
const uuid = z.string().uuid()

router.get('/', async (req, res) => {
  const { barberId, open } = z
    .object({ barberId: uuid.optional(), open: z.enum(['true', 'false']).optional() })
    .parse(req.query)
  res.json(
    await prisma.barberAdvance.findMany({
      where: {
        ...(barberId ? { barberId } : {}),
        ...(open === 'true' ? { settledInId: null } : {}),
      },
      include: { barber: { select: { id: true, name: true } } },
      orderBy: { givenAt: 'desc' },
      take: 200,
    }),
  )
})

router.post('/', async (req: AuthRequest, res) => {
  const data = z
    .object({
      barberId: uuid,
      amount: z.number().positive().max(100000),
      notes: z.string().max(300).optional(),
      fromCash: z.boolean().default(false),
    })
    .parse(req.body)
  res.status(201).json(
    await runSchedule(async (tx) => {
      const barber = await tx.barber.findUnique({ where: { id: data.barberId } })
      if (!barber) throw new Error('Profissional não encontrado')
      const advance = await tx.barberAdvance.create({
        data: {
          barberId: barber.id,
          amount: data.amount,
          notes: data.notes,
          createdById: req.adminId,
        },
      })
      await tx.expense.create({
        data: {
          description: `Vale: ${barber.name}`,
          amount: data.amount,
          category: 'SALARY',
          dueDate: advance.givenAt,
          paidAt: advance.givenAt,
          status: 'PAID',
          notes: `Vale ${advance.id}`,
        },
      })
      if (data.fromCash)
        await addMovement(tx, {
          kind: 'WITHDRAWAL',
          amount: data.amount,
          reason: `Vale: ${barber.name} (${advance.id.slice(0, 8)})`,
          adminId: req.adminId,
        })
      return advance
    }),
  )
})

// Apagar vale muda o que a pessoa vai receber: só o dono.
router.delete('/:id', allowRoles('OWNER'), async (req, res) => {
  res.json(
    await runSchedule(async (tx) => {
      const advance = await tx.barberAdvance.findUnique({
        where: { id: uuid.parse(req.params.id) },
      })
      if (!advance) throw new Error('Vale não encontrado')
      if (advance.settledInId)
        throw new Error('Vale já descontado em pagamento de comissão')
      await tx.expense.deleteMany({ where: { notes: `Vale ${advance.id}` } })
      // Se saiu do caixa que ainda está aberto, a sangria é desfeita.
      await tx.cashMovement.deleteMany({
        where: {
          reason: { endsWith: `(${advance.id.slice(0, 8)})` },
          session: { closedAt: null },
        },
      })
      return tx.barberAdvance.delete({ where: { id: advance.id } })
    }),
  )
})

router.use(businessErrors)

export default router
