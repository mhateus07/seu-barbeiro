import { Router } from 'express'
import { list, getOne, create, update, remove } from './services.controller'
import { validate } from '../../middlewares/validate.middleware'
import { allowRoles, ownerOnlyFields } from '../../middlewares/auth.middleware'
import { createServiceSchema, updateServiceSchema } from './services.schema'

const router = Router()

router.get('/', list)
router.post('/', ownerOnlyFields('price'), validate(createServiceSchema), create)
router.get('/:id', getOne)
router.patch('/:id', ownerOnlyFields('price'), validate(updateServiceSchema), update)
router.delete('/:id', allowRoles('OWNER'), remove)

export default router
