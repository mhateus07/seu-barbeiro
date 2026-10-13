import { Router } from 'express'
import { list, getOne, create, update, remove, clientAppointments, clientLoyalty, redeemLoyalty, exportData, anonymize } from './clients.controller'
import { validate } from '../../middlewares/validate.middleware'
import { createClientSchema, updateClientSchema } from './clients.schema'

const router = Router()

router.get('/', list)
router.post('/', validate(createClientSchema), create)
router.get('/:id', getOne)
router.patch('/:id', validate(updateClientSchema), update)
router.delete('/:id', remove)
router.get('/:id/export', exportData)
router.post('/:id/anonymize', anonymize)
router.get('/:id/appointments', clientAppointments)
router.get('/:id/loyalty', clientLoyalty)
router.post('/:id/loyalty/redeem', redeemLoyalty)

export default router
