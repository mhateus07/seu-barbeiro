import { Router } from 'express'
import { validate } from '../../middlewares/validate.middleware'
import { allowRoles } from '../../middlewares/auth.middleware'
import {
  createPaymentSchema,
  createExpenseSchema,
  updateExpenseSchema,
  payExpenseSchema,
  payCommissionSchema,
} from './finances.schema'
import {
  listPaymentsHandler,
  createPaymentHandler,
  deletePaymentHandler,
  listExpensesHandler,
  createExpenseHandler,
  updateExpenseHandler,
  payExpenseHandler,
  deleteExpenseHandler,
  summaryHandler,
  commissionsHandler,
  payCommissionHandler,
  listCommissionPaymentsHandler,
} from './finances.controller'

const router = Router()
// Comissão e exclusão de despesas mexem no que já foi fechado: só o dono.
const owner = allowRoles('OWNER')

// Summary & commissions
router.get('/summary', summaryHandler)
router.get('/commissions', commissionsHandler)
router.post('/commissions/pay', owner, validate(payCommissionSchema), payCommissionHandler)
router.get('/commissions/payments', listCommissionPaymentsHandler)

// Payments
router.get('/payments', listPaymentsHandler)
router.post('/payments', validate(createPaymentSchema), createPaymentHandler)
router.delete('/payments/:id', deletePaymentHandler)

// Expenses
router.get('/expenses', listExpensesHandler)
router.post('/expenses', validate(createExpenseSchema), createExpenseHandler)
router.patch('/expenses/:id', validate(updateExpenseSchema), updateExpenseHandler)
router.patch('/expenses/:id/pay', validate(payExpenseSchema), payExpenseHandler)
router.delete('/expenses/:id', owner, deleteExpenseHandler)

export default router
