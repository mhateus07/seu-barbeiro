import { Response } from 'express'
import { audit } from '../../utils/audit'
import { prisma } from '../../lib/prisma'
import { ExpenseStatus } from '@prisma/client'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { success, paginate, apiError, publicMessage, pageParams } from '../../utils/response'
import {
  listPayments,
  createPayment,
  deletePayment,
  listExpenses,
  createExpense,
  updateExpense,
  payExpense,
  deleteExpense,
  getFinancialSummary,
  getCommissions,
  payCommission,
  listCommissionPayments,
} from './finances.service'

// ─── PAYMENTS ────────────────────────────────────────────────────────────────

export async function listPaymentsHandler(req: AuthRequest, res: Response) {
  const { from, to, method, page = '1', limit = '50' } = req.query as Record<string, string>
  const result = await listPayments({ from, to, method, ...pageParams(page, limit, 50) })
  return paginate(res, result.data, { total: result.total, page: result.page, limit: result.limit })
}

export async function createPaymentHandler(req: AuthRequest, res: Response) {
  try {
    const payment = await createPayment(req.body)
    // Dinheiro fora de um caixa aberto não entra em nenhum fechamento: o painel avisa.
    const outsideCash =
      payment.method === 'CASH' &&
      !(await prisma.cashSession.count({ where: { closedAt: null } }))
    return success(res, { ...payment, outsideCash }, 201)
  } catch (err) {
    return apiError(res, publicMessage(err), 400)
  }
}

export async function deletePaymentHandler(req: AuthRequest, res: Response) {
  const reason = String((req.body as { reason?: unknown } | undefined)?.reason ?? '').trim()
  if (reason.length < 3 || reason.length > 300)
    return apiError(res, 'Informe o motivo do estorno', 400)
  try {
    const payment = await deletePayment(String(req.params.id), reason)
    await audit({
      adminId: req.adminId,
      action: 'payment.refund',
      entity: 'payment',
      entityId: payment.id,
      details: { amount: Number(payment.amount), method: payment.method, reason },
    })
    return success(res, { message: 'Pagamento removido com sucesso' })
  } catch (err) {
    return apiError(res, publicMessage(err), 400)
  }
}

// ─── EXPENSES ────────────────────────────────────────────────────────────────

export async function listExpensesHandler(req: AuthRequest, res: Response) {
  const { status, from, to, category, page = '1', limit = '50' } = req.query as Record<string, string>
  const result = await listExpenses({
    status: status as ExpenseStatus,
    from,
    to,
    category,
    ...pageParams(page, limit, 50),
  })
  return paginate(res, result.data, { total: result.total, page: result.page, limit: result.limit })
}

export async function createExpenseHandler(req: AuthRequest, res: Response) {
  try {
    return success(res, await createExpense(req.body), 201)
  } catch (err) {
    return apiError(res, publicMessage(err), 400)
  }
}

export async function updateExpenseHandler(req: AuthRequest, res: Response) {
  try {
    return success(res, await updateExpense(req.params.id, req.body))
  } catch (err) {
    return apiError(res, publicMessage(err), 400)
  }
}

export async function payExpenseHandler(req: AuthRequest, res: Response) {
  try {
    return success(res, await payExpense(req.params.id, req.body))
  } catch (err) {
    return apiError(res, publicMessage(err), 400)
  }
}

export async function deleteExpenseHandler(req: AuthRequest, res: Response) {
  try {
    const expense = await deleteExpense(String(req.params.id))
    await audit({
      adminId: req.adminId,
      action: 'expense.delete',
      entity: 'expense',
      entityId: expense.id,
      details: { amount: Number(expense.amount), description: expense.description },
    })
    return success(res, { message: 'Despesa removida com sucesso' })
  } catch (err) {
    return apiError(res, publicMessage(err), 400)
  }
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────────

export async function summaryHandler(req: AuthRequest, res: Response) {
  const { from, to } = req.query as Record<string, string>
  return success(res, await getFinancialSummary(from, to))
}

// ─── COMMISSIONS ─────────────────────────────────────────────────────────────

export async function commissionsHandler(req: AuthRequest, res: Response) {
  const { from, to } = req.query as Record<string, string>
  return success(res, await getCommissions(from, to))
}

export async function payCommissionHandler(req: AuthRequest, res: Response) {
  try {
    const payment = await payCommission(req.body)
    await audit({ adminId: req.adminId, action: 'commission.pay', entity: 'commissionPayment', entityId: payment.id })
    return success(res, payment, 201)
  } catch (err) {
    return apiError(res, publicMessage(err), 400)
  }
}

export async function listCommissionPaymentsHandler(req: AuthRequest, res: Response) {
  const { barberId, from, to } = req.query as Record<string, string>
  return success(res, await listCommissionPayments(barberId, from, to))
}
