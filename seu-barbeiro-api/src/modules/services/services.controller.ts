import { Response } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { success, apiError, publicMessage } from '../../utils/response'
import {
  listServices,
  getServiceById,
  createService,
  updateService,
  deactivateService,
} from './services.service'

export async function list(req: AuthRequest, res: Response) {
  const isActive = req.query.isActive !== undefined
    ? req.query.isActive === 'true'
    : undefined
  const services = await listServices(isActive)
  return success(res, services)
}

export async function getOne(req: AuthRequest, res: Response) {
  try {
    return success(res, await getServiceById(req.params.id))
  } catch (err) {
    return apiError(res, publicMessage(err), 404)
  }
}

export async function create(req: AuthRequest, res: Response) {
  return success(res, await createService(req.body), 201)
}

export async function update(req: AuthRequest, res: Response) {
  try {
    return success(res, await updateService(req.params.id, req.body))
  } catch (err) {
    return apiError(res, publicMessage(err), 404)
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    await deactivateService(req.params.id)
    return success(res, { message: 'Serviço desativado com sucesso' })
  } catch (err) {
    return apiError(res, publicMessage(err), 404)
  }
}
