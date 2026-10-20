import { Response } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { success, apiError, publicMessage } from '../../utils/response'
import { getDashboardSummary, getDashboardStats } from './dashboard.service'

export async function summary(req: AuthRequest, res: Response) {
  try {
    const data = await getDashboardSummary(req.query.date as string)
    return success(res, data)
  } catch (err) {
    return apiError(res, publicMessage(err))
  }
}

export async function stats(req: AuthRequest, res: Response) {
  try {
    const data = await getDashboardStats(req.query.from as string, req.query.to as string)
    return success(res, data)
  } catch (err) {
    return apiError(res, publicMessage(err))
  }
}
