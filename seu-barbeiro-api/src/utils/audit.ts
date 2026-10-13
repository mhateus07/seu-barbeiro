import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

/**
 * Registra uma ação sensível (LGPD): quem fez, o quê e sobre qual registro.
 * Nunca guarda o conteúdo dos dados pessoais, só os identificadores.
 * Uma falha aqui não derruba a ação principal.
 */
export async function audit(entry: {
  adminId?: string | null
  action: string
  entity?: string
  entityId?: string
  details?: Prisma.InputJsonValue
}) {
  try {
    await prisma.auditLog.create({ data: { ...entry, adminId: entry.adminId ?? null } })
  } catch (error) {
    console.error('Falha ao registrar auditoria', error)
  }
}
