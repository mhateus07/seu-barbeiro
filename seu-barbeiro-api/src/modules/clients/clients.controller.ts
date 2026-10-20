import { Response } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { success, paginate, apiError, publicMessage, pageParams } from '../../utils/response'
import {
  listClients,
  listClientsWithLoyalty,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getClientAppointments,
  getClientLoyalty,
  redeemLoyaltyPoints,
  exportClientData,
  anonymizeClient,
} from './clients.service'
import { audit } from '../../utils/audit'

export async function list(req: AuthRequest, res: Response) {
  const { search, page = '1', limit = '20', withLoyalty } = req.query as Record<string, string>
  const { page: p, limit: l } = pageParams(page, limit, 20)
  const result = withLoyalty === 'true'
    ? await listClientsWithLoyalty(search, p, l)
    : await listClients(search, p, l)
  return paginate(res, result.data, { total: result.total, page: result.page, limit: result.limit })
}

export async function getOne(req: AuthRequest, res: Response) {
  try {
    return success(res, await getClientById(req.params.id))
  } catch (err) {
    return apiError(res, publicMessage(err), 404)
  }
}

export async function create(req: AuthRequest, res: Response) {
  try {
    return success(res, await createClient(req.body), 201)
  } catch (err) {
    return apiError(res, publicMessage(err), 400)
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    return success(res, await updateClient(req.params.id, req.body))
  } catch (err) {
    return apiError(res, publicMessage(err), 404)
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    await deleteClient(req.params.id)
    await audit({ adminId: req.adminId, action: 'client.delete', entity: 'client', entityId: req.params.id })
    return success(res, { message: 'Cliente removido com sucesso' })
  } catch (err) {
    return apiError(res, publicMessage(err), 400)
  }
}

export async function clientAppointments(req: AuthRequest, res: Response) {
  try {
    return success(res, await getClientAppointments(req.params.id))
  } catch (err) {
    return apiError(res, publicMessage(err), 404)
  }
}

export async function clientLoyalty(req: AuthRequest, res: Response) {
  try {
    return success(res, await getClientLoyalty(req.params.id))
  } catch (err) {
    return apiError(res, publicMessage(err), 404)
  }
}

export async function redeemLoyalty(req: AuthRequest, res: Response) {
  try {
    const { points } = req.body
    if (!points || points <= 0) return apiError(res, 'Informe a quantidade de pontos a resgatar', 400)
    return success(res, await redeemLoyaltyPoints(req.params.id, Number(points)))
  } catch (err) {
    return apiError(res, publicMessage(err), 400)
  }
}

// Pedidos do titular (LGPD). Só o dono do salão atende.
export async function exportData(req: AuthRequest, res: Response) {
  if (req.role !== 'OWNER') return apiError(res, 'Só o dono do salão pode exportar dados de clientes', 403)
  try {
    const data = await exportClientData(req.params.id)
    await audit({ adminId: req.adminId, action: 'client.export', entity: 'client', entityId: req.params.id })
    res.setHeader('Content-Disposition', `attachment; filename="dados-cliente-${req.params.id.slice(0, 8)}.json"`)
    return success(res, data)
  } catch (err) {
    return apiError(res, publicMessage(err), 404)
  }
}

export async function anonymize(req: AuthRequest, res: Response) {
  if (req.role !== 'OWNER') return apiError(res, 'Só o dono do salão pode remover dados de clientes', 403)
  try {
    await anonymizeClient(req.params.id)
    await audit({ adminId: req.adminId, action: 'client.anonymize', entity: 'client', entityId: req.params.id })
    return success(res, { message: 'Dados pessoais removidos' })
  } catch (err) {
    return apiError(res, publicMessage(err), 400)
  }
}
