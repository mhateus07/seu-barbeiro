import { Response } from 'express'
import { NotificationStatus, NotificationType } from '@prisma/client'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { success, paginate, apiError, publicMessage, pageParams } from '../../utils/response'
import { listNotificationLogs, sendAndLog, sendPendingReminders } from './notifications.service'

export async function listLogsHandler(req: AuthRequest, res: Response) {
  const { status, type, page = '1', limit = '50' } = req.query as Record<string, string>
  const result = await listNotificationLogs({
    status: status as NotificationStatus,
    type: type as NotificationType,
    ...pageParams(page, limit, 50),
  })
  return paginate(res, result.data, { total: result.total, page: result.page, limit: result.limit })
}

export async function sendCustomHandler(req: AuthRequest, res: Response) {
  try {
    const { phone, message, clientId, appointmentId } = req.body
    if (!phone || !message) return apiError(res, 'phone e message são obrigatórios', 400)
    const result = await sendAndLog({ type: 'CUSTOM', phone, message, clientId, appointmentId })
    return success(res, result)
  } catch (err) {
    return apiError(res, publicMessage(err), 400)
  }
}

export async function sendRemindersHandler(req: AuthRequest, res: Response) {
  try {
    const result = await sendPendingReminders()
    return success(res, result)
  } catch (err) {
    return apiError(res, publicMessage(err), 500)
  }
}
