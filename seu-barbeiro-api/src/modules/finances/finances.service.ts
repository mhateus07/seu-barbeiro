import { runSchedule } from '../appointments/scheduling'
import { ExpenseStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { dayKey, parseDay, parseMoment } from '../../utils/dates'
import {
  CreatePaymentInput,
  CreateExpenseInput,
  UpdateExpenseInput,
  PayExpenseInput,
  PayCommissionInput,
} from './finances.schema'

// ─── PAYMENTS ────────────────────────────────────────────────────────────────

export async function listPayments(filters: {
  from?: string
  to?: string
  method?: string
  page?: number
  limit?: number
}) {
  const { from, to, method, page = 1, limit = 50 } = filters

  const where: Record<string, unknown> = { refundedAt: null }

  if (from || to) {
    where.paidAt = {
      ...(from ? { gte: parseDay(from) } : {}),
      ...(to ? { lte: parseDay(to, true) } : {}),
    }
  }

  if (method) where.method = method

  const [data, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        appointment: {
          select: {
            id: true,
            startsAt: true,
            totalPrice: true,
            client: { select: { id: true, name: true } },
            barber: { select: { id: true, name: true } },
            services: {
              include: { service: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.payment.count({ where }),
  ])

  return { data, total, page, limit }
}

export async function createPayment(input: CreatePaymentInput) {
  return runSchedule(async (tx) => {
    if (input.appointmentId) {
      const appointment = await tx.appointment.findUnique({
        where: { id: input.appointmentId },
        include: { payments: true, items: true },
      })
      if (!appointment) throw new Error('Agendamento não encontrado')
      if (['CANCELLED', 'NO_SHOW'].includes(appointment.status))
        throw new Error('Atendimento cancelado ou ausente')
      const due =
        Number(appointment.totalPrice) -
        Number(appointment.discount) -
        Number(appointment.subscriptionCovered) +
        appointment.items.reduce(
          (sum, item) => sum + item.quantity * Number(item.unitPrice),
          0,
        )
      const paid = appointment.payments
        .filter((p) => !p.refundedAt)
        .reduce((sum, p) => sum + Number(p.amount), 0)
      if (Math.round((paid + input.amount) * 100) > Math.round(due * 100))
        throw new Error('Valor excede o saldo da comanda')
    }
    return tx.payment.create({
      data: {
        ...input,
        paidAt: parseMoment(input.paidAt),
      },
    })
  })
}

export async function deletePayment(id: string, reason = 'Estorno solicitado pelo operador') {
  return runSchedule(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id } })
    if (!payment) throw new Error('Pagamento não encontrado')
    if (payment.refundedAt) return payment
    const updated = await tx.payment.update({
      where: { id },
      data: {
        refundedAt: new Date(),
        refundReason: reason,
      },
    })
    // Mensalidade estornada volta a ficar em aberto e o período pago é desfeito.
    const charge = await tx.subscriptionCharge.findUnique({
      where: { paymentId: id },
      include: { subscription: true },
    })
    if (charge) {
      await tx.subscriptionCharge.update({
        where: { id: charge.id },
        data: { status: 'PENDING', paidAt: null, paymentId: null },
      })
      const sub = charge.subscription
      if (
        sub.status !== 'CANCELLED' &&
        sub.currentPeriodEnd?.getTime() === charge.periodEnd.getTime()
      ) {
        const previous = await tx.subscriptionCharge.findFirst({
          where: {
            subscriptionId: sub.id,
            status: 'PAID',
            id: { not: charge.id },
          },
          orderBy: { periodStart: 'desc' },
        })
        await tx.subscription.update({
          where: { id: sub.id },
          data: previous
            ? {
                status: 'PAST_DUE',
                currentPeriodStart: previous.periodStart,
                currentPeriodEnd: previous.periodEnd,
              }
            : { status: 'PENDING', currentPeriodStart: null, currentPeriodEnd: null },
        })
      }
    }
    // Sinal estornado deixa de valer: o horário não conta mais como garantido.
    if (payment.appointmentId && payment.notes?.startsWith('Sinal via Pix'))
      await tx.appointment.update({
        where: { id: payment.appointmentId },
        data: { depositAmount: null, depositPaidAt: null },
      })
    return updated
  })
}

// ─── EXPENSES ────────────────────────────────────────────────────────────────

export async function listExpenses(filters: {
  status?: ExpenseStatus
  from?: string
  to?: string
  category?: string
  page?: number
  limit?: number
}) {
  const { status, from, to, category, page = 1, limit = 50 } = filters

  const where: Record<string, unknown> = {}

  if (status) where.status = status
  if (category) where.category = category

  if (from || to) {
    where.dueDate = {
      ...(from ? { gte: parseDay(from) } : {}),
      ...(to ? { lte: parseDay(to, true) } : {}),
    }
  }

  const [data, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.expense.count({ where }),
  ])

  return { data, total, page, limit }
}

export async function createExpense(input: CreateExpenseInput) {
  return prisma.expense.create({
    data: {
      description: input.description,
      amount: input.amount,
      category: input.category,
      dueDate: parseDay(input.dueDate),
      notes: input.notes,
    },
  })
}

export async function updateExpense(id: string, input: UpdateExpenseInput) {
  const expense = await prisma.expense.findUnique({ where: { id } })
  if (!expense) throw new Error('Despesa não encontrada')

  return prisma.expense.update({
    where: { id },
    data: {
      description: input.description,
      amount: input.amount,
      category: input.category,
      dueDate: input.dueDate ? parseDay(input.dueDate) : undefined,
      notes: input.notes,
      status: input.status,
    },
  })
}

export async function payExpense(id: string, input: PayExpenseInput) {
  const expense = await prisma.expense.findUnique({ where: { id } })
  if (!expense) throw new Error('Despesa não encontrada')
  if (expense.status === ExpenseStatus.PAID)
    throw new Error('Despesa já foi paga')

  return prisma.expense.update({
    where: { id },
    data: {
      status: ExpenseStatus.PAID,
      paidAt: parseMoment(input.paidAt),
    },
  })
}

export async function deleteExpense(id: string) {
  const expense = await prisma.expense.findUnique({ where: { id } })
  if (!expense) throw new Error('Despesa não encontrada')
  return prisma.expense.delete({ where: { id } })
}

// ─── COMMISSIONS ─────────────────────────────────────────────────────────────

/**
 * Valor do atendimento que gera comissão: serviços menos desconto. Com estorno,
 * vale só o que continuou recebido (ou coberto por assinatura); atendimento
 * ainda sem pagamento segue contando pelo valor do serviço.
 */
export function commissionBase(a: {
  totalPrice: unknown
  discount: unknown
  subscriptionCovered?: unknown
  payments?: { amount: unknown; refundedAt: Date | null }[]
}) {
  const value = Number(a.totalPrice) - Number(a.discount)
  const payments = a.payments ?? []
  if (!payments.some((p) => p.refundedAt)) return value
  const kept =
    Number(a.subscriptionCovered ?? 0) +
    payments
      .filter((p) => !p.refundedAt)
      .reduce((sum, p) => sum + Number(p.amount), 0)
  return Math.max(0, Math.min(value, kept))
}

const commissionOf = (a: Parameters<typeof commissionBase>[0] & { commissionRateSnapshot: unknown }) =>
  (commissionBase(a) * Number(a.commissionRateSnapshot ?? 0)) / 100

export async function getCommissions(from?: string, to?: string) {
  const fromDate = from
    ? parseDay(from)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const toDate = to ? parseDay(to, true) : new Date()

  // Quem foi desativado continua na lista enquanto tiver atendimento no período.
  const barbers = await prisma.barber.findMany({
    where: {
      OR: [
        { isActive: true },
        { appointments: { some: { status: 'COMPLETED', startsAt: { gte: fromDate, lte: toDate } } } },
      ],
    },
  })
  const openAdvances = await prisma.barberAdvance.groupBy({
    by: ['barberId'],
    where: { settledInId: null },
    _sum: { amount: true },
  })

  const appointments = await prisma.appointment.findMany({
    where: {
      status: 'COMPLETED',
      startsAt: { gte: fromDate, lte: toDate },
    },
    select: {
      barberId: true,
      totalPrice: true,
      discount: true,
      commissionRateSnapshot: true,
      subscriptionCovered: true,
      commissionPaymentId: true,
      payments: { select: { amount: true, refundedAt: true } },
    },
  })

  return barbers.map((barber) => {
    const barberAppointments = appointments.filter(
      (a) => a.barberId === barber.id,
    )
    const totalRevenue = barberAppointments.reduce(
      (sum, a) => sum + commissionBase(a),
      0,
    )
    const rate = Number(barber.commissionRate ?? 0)
    const commission = barberAppointments.reduce(
      (sum, a) => sum + commissionOf(a),
      0,
    )
    const pendingCommission = barberAppointments
      .filter((a) => !a.commissionPaymentId)
      .reduce((sum, a) => sum + commissionOf(a), 0)
    return {
      barberId: barber.id,
      barberName: barber.name,
      commissionRate: totalRevenue
        ? Math.round((commission / totalRevenue) * 10000) / 100
        : rate,
      totalRevenue,
      commission,
      pendingCommission: Math.round(pendingCommission * 100) / 100,
      isActive: barber.isActive,
      appointmentsCount: barberAppointments.length,
      openAdvances: Number(
        openAdvances.find((a) => a.barberId === barber.id)?._sum.amount ?? 0,
      ),
    }
  })
}

// ─── COMMISSION PAYMENTS ─────────────────────────────────────────────────────

export async function payCommission(input: PayCommissionInput) {
  return runSchedule(async (tx) => {
    const periodFrom = parseDay(input.periodFrom),
      periodTo = parseDay(input.periodTo, true)
    if (
      !Number.isFinite(periodFrom.getTime()) ||
      !Number.isFinite(periodTo.getTime()) ||
      periodFrom > periodTo
    )
      throw new Error('Período inválido')
    const overlap = await tx.commissionPayment.findFirst({
      where: {
        barberId: input.barberId,
        periodFrom: { lte: periodTo },
        periodTo: { gte: periodFrom },
      },
    })
    // Só entram os atendimentos ainda não acertados: o que foi concluído depois
    // de um pagamento vira um complemento, sem repetir o que já foi pago.
    const appointments = await tx.appointment.findMany({
      where: {
        barberId: input.barberId,
        status: 'COMPLETED',
        startsAt: { gte: periodFrom, lte: periodTo },
        commissionPaymentId: null,
      },
      include: { payments: { select: { amount: true, refundedAt: true } } },
    })
    if (!appointments.length)
      throw new Error(
        overlap
          ? 'Já existe pagamento de comissão que inclui este período'
          : 'Sem atendimentos concluídos no período',
      )
    const totalRevenue = appointments.reduce((sum, a) => sum + commissionBase(a), 0)
    const commissionAmount = appointments.reduce((sum, a) => sum + commissionOf(a), 0)
    if (commissionAmount <= 0)
      throw new Error('Sem comissão a pagar no período')
    // Vales em aberto até o fim do período são descontados, do mais antigo
    // ao mais novo, enquanto couberem na comissão. O restante fica para o próximo.
    const advances = await tx.barberAdvance.findMany({
      where: {
        barberId: input.barberId,
        settledInId: null,
        givenAt: { lte: periodTo },
      },
      orderBy: { givenAt: 'asc' },
    })
    const deducted: typeof advances = []
    let advancesDeducted = 0
    for (const advance of advances) {
      const next = advancesDeducted + Number(advance.amount)
      if (Math.round(next * 100) > Math.round(commissionAmount * 100)) break
      advancesDeducted = next
      deducted.push(advance)
    }
    const payment = await tx.commissionPayment.create({
      data: {
        barberId: input.barberId,
        periodFrom,
        periodTo,
        totalRevenue,
        commissionAmount,
        commissionRate: totalRevenue
          ? (commissionAmount / totalRevenue) * 100
          : 0,
        notes: input.notes,
        advancesDeducted,
        paidAt: parseMoment(input.paidAt),
      },
      include: { barber: { select: { id: true, name: true } } },
    })
    await tx.appointment.updateMany({
      where: { id: { in: appointments.map((a) => a.id) } },
      data: { commissionPaymentId: payment.id },
    })
    if (deducted.length)
      await tx.barberAdvance.updateMany({
        where: { id: { in: deducted.map((a) => a.id) } },
        data: { settledInId: payment.id },
      })
    // Os vales já entraram como despesa quando foram dados: aqui sai só o líquido.
    const net = Math.round((commissionAmount - advancesDeducted) * 100) / 100
    if (net > 0)
      await tx.expense.create({
        data: {
          description: `Comissão: ${payment.barber.name}`,
          amount: net,
          category: 'SALARY',
          dueDate: payment.paidAt,
          paidAt: payment.paidAt,
          status: 'PAID',
          notes: `Pagamento de comissão ${payment.id}`,
        },
      })
    return payment
  })
}

export async function listCommissionPayments(
  barberId?: string,
  from?: string,
  to?: string,
) {
  const where: Record<string, unknown> = {}
  if (barberId) where.barberId = barberId
  if (from || to) {
    where.paidAt = {
      ...(from ? { gte: parseDay(from) } : {}),
      ...(to ? { lte: parseDay(to, true) } : {}),
    }
  }

  return prisma.commissionPayment.findMany({
    where,
    include: { barber: { select: { id: true, name: true } } },
    orderBy: { paidAt: 'desc' },
  })
}

// ─── FINANCIAL SUMMARY ───────────────────────────────────────────────────────

/**
 * Entradas de caixa do período: cada pagamento conta no dia em que foi pago e,
 * se estornado, sai (valor negativo) no dia do estorno. É a mesma conta da
 * receita do painel e do financeiro.
 */
export async function listCashEntries(fromDate: Date, toDate: Date) {
  const rows = await prisma.payment.findMany({
    where: {
      OR: [
        { paidAt: { gte: fromDate, lte: toDate } },
        { refundedAt: { gte: fromDate, lte: toDate } },
      ],
    },
    select: { amount: true, method: true, paidAt: true, refundedAt: true },
  })
  return rows.flatMap((p) => [
    ...(p.paidAt >= fromDate && p.paidAt <= toDate
      ? [{ amount: Number(p.amount), method: p.method, paidAt: p.paidAt }]
      : []),
    ...(p.refundedAt && p.refundedAt >= fromDate && p.refundedAt <= toDate
      ? [{ amount: -Number(p.amount), method: p.method, paidAt: p.refundedAt }]
      : []),
  ])
}

export async function getFinancialSummary(from?: string, to?: string) {
  const fromDate = from
    ? parseDay(from)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const toDate = to ? parseDay(to, true) : new Date()

  const [payments, expenses, pendingExpenses] = await Promise.all([
    listCashEntries(fromDate, toDate),
    prisma.expense.findMany({
      where: {
        status: ExpenseStatus.PAID,
        paidAt: { gte: fromDate, lte: toDate },
      },
      select: { amount: true, category: true, paidAt: true },
    }),
    prisma.expense.findMany({
      where: { status: { not: ExpenseStatus.PAID } },
      select: { amount: true, dueDate: true, status: true, description: true },
    }),
  ])

  const totalIncome = payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const balance = totalIncome - totalExpenses

  const totalPending = pendingExpenses
    .filter((e) => e.status === ExpenseStatus.PENDING)
    .reduce((sum, e) => sum + Number(e.amount), 0)

  const totalOverdue = pendingExpenses
    .filter(
      (e) =>
        e.status === ExpenseStatus.OVERDUE ||
        (e.status === ExpenseStatus.PENDING &&
          new Date(e.dueDate) < new Date()),
    )
    .reduce((sum, e) => sum + Number(e.amount), 0)

  // Income by payment method
  const incomeByMethod: Record<string, number> = {}
  for (const p of payments) {
    incomeByMethod[p.method] =
      (incomeByMethod[p.method] ?? 0) + Number(p.amount)
  }

  // Expenses by category
  const expensesByCategory: Record<string, number> = {}
  for (const e of expenses) {
    expensesByCategory[e.category] =
      (expensesByCategory[e.category] ?? 0) + Number(e.amount)
  }

  // Cash flow by day (last 30 days or the period)
  const dayMap: Record<string, { income: number; expenses: number }> = {}

  for (const p of payments) {
    const day = dayKey(p.paidAt)
    if (!dayMap[day]) dayMap[day] = { income: 0, expenses: 0 }
    dayMap[day].income += Number(p.amount)
  }

  for (const e of expenses) {
    const day = dayKey(e.paidAt!)
    if (!dayMap[day]) dayMap[day] = { income: 0, expenses: 0 }
    dayMap[day].expenses += Number(e.amount)
  }

  const cashFlowByDay = Object.entries(dayMap)
    .map(([date, values]) => ({
      date,
      ...values,
      balance: values.income - values.expenses,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    totalIncome,
    totalExpenses,
    balance,
    totalPending,
    totalOverdue,
    incomeByMethod,
    expensesByCategory,
    cashFlowByDay,
    period: { from: fromDate.toISOString(), to: toDate.toISOString() },
  }
}
