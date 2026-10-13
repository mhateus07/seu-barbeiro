import { Response } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { success, apiError } from '../../utils/response'
import { getSettings, updateSettings } from './settings.service'
import { SECRET_SETTINGS } from './settings.schema'
import { audit } from '../../utils/audit'

// Segredos nunca voltam ao navegador: só indica se estão configurados.
function visible(settings: Record<string, string>, role?: string) {
  const out = Object.fromEntries(
    Object.entries(settings).filter(
      ([key]) =>
        !SECRET_SETTINGS.includes(key) &&
        (role === 'OWNER' || !key.startsWith('whatsapp_')),
    ),
  )
  if (role === 'OWNER')
    for (const key of SECRET_SETTINGS) out[`${key}_set`] = settings[key] ? 'true' : 'false'
  return out
}

export async function getSettingsHandler(req: AuthRequest, res: Response) {
  const settings = await getSettings()
  return success(res, visible(settings, req.role))
}

export async function updateSettingsHandler(req: AuthRequest, res: Response) {
  try {
    const updated = await updateSettings(req.body)
    // Só os nomes das configurações; valores (inclusive tokens) não entram no registro.
    await audit({
      adminId: req.adminId,
      action: 'settings.update',
      details: { keys: Object.keys(req.body.settings ?? {}) },
    })
    return success(res, visible(updated, req.role))
  } catch (err) {
    return apiError(res, (err as Error).message, 400)
  }
}
