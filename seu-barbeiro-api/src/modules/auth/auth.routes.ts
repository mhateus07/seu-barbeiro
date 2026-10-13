import { Router } from 'express'
import { login, getMe, logoutAll } from './auth.controller'
import { validate } from '../../middlewares/validate.middleware'
import { authMiddleware } from '../../middlewares/auth.middleware'
import { loginSchema } from './auth.schema'

const router = Router()

router.post('/login', validate(loginSchema), login)
router.get('/me', authMiddleware, getMe)
router.post('/logout-all', authMiddleware, logoutAll)

export default router
