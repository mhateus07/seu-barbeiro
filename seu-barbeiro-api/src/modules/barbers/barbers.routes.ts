import { Router } from 'express'
import { list, getOne, create, update, remove, appointments } from './barbers.controller'
import { validate } from '../../middlewares/validate.middleware'
import { allowRoles, ownerOnlyFields } from '../../middlewares/auth.middleware'
import { createBarberSchema, updateBarberSchema } from './barbers.schema'

const router = Router()

router.get('/', list)
const money = ownerOnlyFields('commissionRate', 'serviceOverrides')

router.post('/', money, validate(createBarberSchema), create)
router.get('/:id', getOne)
router.patch('/:id', money, validate(updateBarberSchema), update)
router.delete('/:id', allowRoles('OWNER'), remove)
router.get('/:id/appointments', appointments)

export default router
