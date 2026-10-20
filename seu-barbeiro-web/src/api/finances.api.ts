import { api } from './axios'
import type { Payment, Expense, FinancialSummary, BarberCommission, CommissionPayment, PaginatedResponse, PaymentMethod, ExpenseCategory } from '../types'

// ─── SUMMARY ─────────────────────────────────────────────────────────────────

export async function getFinancialSummary(from?: string, to?: string): Promise<FinancialSummary> {
  const { data } = await api.get('/finances/summary', { params: { from, to } })
  return data.data
}

// ─── PAYMENTS ────────────────────────────────────────────────────────────────

export async function listPayments(filters: {
  from?: string
  to?: string
  method?: string
  page?: number
  limit?: number
} = {}): Promise<PaginatedResponse<Payment>> {
  const { data } = await api.get('/finances/payments', { params: filters })
  return data
}

export async function createPayment(input: {
  amount: number
  method: PaymentMethod
  paidAt?: string
  notes?: string
  appointmentId?: string
}): Promise<Payment> {
  const { data } = await api.post('/finances/payments', input)
  return data.data
}

export async function deletePayment({ id, reason }: { id: string; reason: string }): Promise<void> {
  await api.delete(`/finances/payments/${id}`, { data: { reason } })
}

// ─── EXPENSES ────────────────────────────────────────────────────────────────

export async function listExpenses(filters: {
  status?: string
  from?: string
  to?: string
  category?: string
  page?: number
  limit?: number
} = {}): Promise<PaginatedResponse<Expense>> {
  const { data } = await api.get('/finances/expenses', { params: filters })
  return data
}

export async function createExpense(input: {
  description: string
  amount: number
  category: ExpenseCategory
  dueDate: string
  notes?: string
}): Promise<Expense> {
  const { data } = await api.post('/finances/expenses', input)
  return data.data
}

export async function updateExpense(
  id: string,
  input: Partial<{
    description: string
    amount: number
    category: ExpenseCategory
    dueDate: string
    notes: string
  }>,
): Promise<Expense> {
  const { data } = await api.patch(`/finances/expenses/${id}`, input)
  return data.data
}

export async function payExpense(id: string, paidAt?: string): Promise<Expense> {
  const { data } = await api.patch(`/finances/expenses/${id}/pay`, { paidAt })
  return data.data
}

export async function deleteExpense(id: string): Promise<void> {
  await api.delete(`/finances/expenses/${id}`)
}

export async function getCommissions(from?: string, to?: string): Promise<BarberCommission[]> {
  const { data } = await api.get('/finances/commissions', { params: { from, to } })
  return data.data
}

export async function payCommission(input: {
  barberId: string
  periodFrom: string
  periodTo: string
  notes?: string
  paidAt?: string
}): Promise<CommissionPayment> {
  const { data } = await api.post('/finances/commissions/pay', input)
  return data.data
}

export async function listCommissionPayments(params: {
  barberId?: string
  from?: string
  to?: string
} = {}): Promise<CommissionPayment[]> {
  const { data } = await api.get('/finances/commissions/payments', { params })
  return data.data
}
