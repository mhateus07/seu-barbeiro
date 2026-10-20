import { Response } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { success, apiError, publicMessage } from '../../utils/response'
import {
  listBarbers,
  getBarberById,
  createBarber,
  updateBarber,
  deactivateBarber,
  getBarberAppointments,
} from './barbers.service'

export async function list(req: AuthRequest, res: Response) {
  const isActive = req.query.isActive !== undefined
    ? req.query.isActive === 'true'
    : undefined
  const barbers = await listBarbers(isActive)
  return success(res, barbers)
}

export async function getOne(req: AuthRequest, res: Response) {
  try {
    const barber = await getBarberById(req.params.id)
    return success(res, barber)
  } catch (err) {
    return apiError(res, publicMessage(err), 404)
  }
}

export async function create(req: AuthRequest, res: Response) {
  const barber = await createBarber(req.body)
  return success(res, barber, 201)
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const barber = await updateBarber(req.params.id, req.body)
    return success(res, barber)
  } catch (err) {
    return apiError(res, publicMessage(err), 404)
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    await deactivateBarber(req.params.id)
    return success(res, { message: 'Profissional desativado com sucesso' })
  } catch (err) {
    return apiError(res, publicMessage(err), 404)
  }
}

export async function appointments(req: AuthRequest, res: Response) {
  try {
    const data = await getBarberAppointments(
      req.params.id,
      req.query.from as string,
      req.query.to as string,
    )
    return success(res, data)
  } catch (err) {
    return apiError(res, publicMessage(err), 404)
  }
}
