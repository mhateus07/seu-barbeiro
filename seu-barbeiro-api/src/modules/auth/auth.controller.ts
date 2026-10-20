import { Response } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { loginService, getMeService, logoutAllService, LoginLockedError } from './auth.service'
import { success, apiError, publicMessage } from '../../utils/response'
import { LoginInput } from './auth.schema'

export async function login(req: AuthRequest, res: Response) {
  try {
    const result = await loginService(req.body as LoginInput, req.ip)
    return success(res, result)
  } catch (err) {
    if (err instanceof LoginLockedError) return apiError(res, err.message, 429)
    return apiError(res, 'Credenciais inválidas', 401)
  }
}

export async function getMe(req: AuthRequest, res: Response) {
  try {
    const admin = await getMeService(req.adminId!)
    return success(res, admin)
  } catch (err) {
    return apiError(res, publicMessage(err), 404)
  }
}

export async function logoutAll(req: AuthRequest, res: Response) {
  await logoutAllService(req.adminId!)
  return success(res, { message: 'Sessões encerradas em todos os aparelhos' })
}
