import { z } from 'zod'
import { PaymentMethod, ExpenseCategory, ExpenseStatus } from '@prisma/client'
import { isDateInput, parseDay } from '../../utils/dates'

const date = z.string().refine(isDateInput, 'Data inválida')
// Pagamento não pode ficar com data no futuro.
const paidDate = date.refine((v) => parseDay(v) <= new Date(), 'A data do pagamento não pode estar no futuro')
// Valores em reais com até 2 casas e teto, para não virar R$ 0,00 nem estourar a coluna.
const money = z.number().positive('Valor deve ser positivo').max(99999999).multipleOf(0.01, 'Use no máximo 2 casas decimais')

export const createPaymentSchema = z.object({
  amount: money,
  method: z.nativeEnum(PaymentMethod),
  paidAt: paidDate.optional(),
  notes: z.string().optional(),
  appointmentId: z.string().uuid().optional(),
})

export const createExpenseSchema = z.object({
  description: z.string().min(1, 'Descrição obrigatória'),
  amount: money,
  category: z.nativeEnum(ExpenseCategory),
  dueDate: date,
  notes: z.string().optional(),
})

export const updateExpenseSchema = z.object({
  description: z.string().min(1).optional(),
  amount: money.optional(),
  category: z.nativeEnum(ExpenseCategory).optional(),
  dueDate: date.optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(ExpenseStatus).optional(),
})

export const payExpenseSchema = z.object({
  paidAt: paidDate.optional(),
})

export const payCommissionSchema = z.object({
  barberId: z.string().uuid('ID do profissional inválido'),
  periodFrom: date,
  periodTo: date,
  // Receita, comissão e taxa são sempre calculadas no servidor.
  notes: z.string().optional(),
  paidAt: paidDate.optional(),
})

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>
export type PayExpenseInput = z.infer<typeof payExpenseSchema>
export type PayCommissionInput = z.infer<typeof payCommissionSchema>
