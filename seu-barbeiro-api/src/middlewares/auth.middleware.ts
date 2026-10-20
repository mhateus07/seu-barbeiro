import { Request, Response, NextFunction } from 'express'
import { prisma, currentSalon } from '../lib/prisma'
import { verifyToken } from '../config/jwt'

export interface AuthRequest extends Request<Record<string, string>> {
  adminId?: string
  adminEmail?: string
  role?: string
  barberId?: string
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: 'Token não fornecido' } })
  }

  const token = authHeader.split(' ')[1]

  try {
    const payload = verifyToken(token)
    if (payload.salon !== currentSalon().slug) throw new Error('Salão inválido')
    const user = await prisma.admin.findUnique({ where: { id: payload.sub } })
    if (!user || !user.isActive) throw new Error('Usuário inativo')
    // Senha trocada ou acesso reativado: as sessões anteriores deixam de valer.
    if ((payload.ver ?? 0) !== user.tokenVersion) throw new Error('Sessão encerrada')
    req.role = user.role
    req.barberId = user.barberId ?? undefined
    req.adminId = payload.sub
    req.adminEmail = payload.email
    return next()
  } catch {
    return res
      .status(401)
      .json({ error: { message: 'Token inválido ou expirado' } })
  }
}

export function allowRoles(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.role || !roles.includes(req.role))
      return res
        .status(403)
        .json({ error: { message: 'Acesso não permitido' } })
    next()
  }
}

/** Campos que só o dono altera (comissão, preços): a recepção recebe 403 se enviar. */
export function ownerOnlyFields(...fields: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    if (req.role !== 'OWNER' && fields.some((field) => body[field] !== undefined))
      return res
        .status(403)
        .json({ error: { message: 'Só o dono do salão altera comissão e preços' } })
    next()
  }
}
