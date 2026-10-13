import { prisma, currentSalon } from '../../lib/prisma'
import { comparePassword } from '../../utils/bcrypt'
import { signToken } from '../../config/jwt'
import { audit } from '../../utils/audit'
import { LoginInput } from './auth.schema'

/*
  Bloqueio por conta: depois de 5 senhas erradas em 15 minutos para o mesmo
  e-mail no mesmo salão, novas tentativas são recusadas por 15 minutos, mesmo
  vindas de IPs diferentes. Fica em memória (um processo só por instalação).
*/
const MAX_FAILURES = 5
const WINDOW_MS = 15 * 60000
const failures = new Map<string, { count: number; first: number; lockedUntil: number }>()

export class LoginLockedError extends Error {}

// Hash de uma senha qualquer: e-mail inexistente custa o mesmo tempo que senha errada.
const DUMMY_HASH = '$2b$10$bIgvlTPEBpFdJTeVmiPwDOJUoIjI4B8Ahclnw0j4I6XwY8qMKFgQu'

function attemptKey(email: string) {
  return `${currentSalon().slug}:${email.trim().toLowerCase()}`
}

function registerFailure(key: string) {
  const now = Date.now()
  if (failures.size > 10000)
    for (const [k, v] of failures) if (v.first + WINDOW_MS < now && v.lockedUntil < now) failures.delete(k)
  const row = failures.get(key)
  if (!row || row.first + WINDOW_MS < now) {
    failures.set(key, { count: 1, first: now, lockedUntil: 0 })
    return false
  }
  row.count++
  if (row.count >= MAX_FAILURES) {
    row.lockedUntil = now + WINDOW_MS
    return true
  }
  return false
}

export async function loginService(input: LoginInput) {
  const key = attemptKey(input.email)
  const row = failures.get(key)
  if (row && row.lockedUntil > Date.now())
    throw new LoginLockedError('Muitas tentativas para este e-mail. Aguarde 15 minutos ou troque a senha com o dono do salão.')

  const admin = await prisma.admin.findUnique({ where: { email: input.email } })
  const isValid = await comparePassword(input.password, admin?.passwordHash ?? DUMMY_HASH)

  if (!admin || !admin.isActive || !isValid) {
    if (registerFailure(key))
      await audit({
        adminId: admin?.id,
        action: 'login.locked',
        entity: 'admin',
        entityId: admin?.id,
      })
    throw new Error('Credenciais inválidas')
  }
  failures.delete(key)

  const token = signToken({
    sub: admin.id,
    email: admin.email,
    salon: currentSalon().slug,
    ver: admin.tokenVersion,
  })
  await audit({ adminId: admin.id, action: 'login.success', entity: 'admin', entityId: admin.id })

  return {
    token,
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      barberId: admin.barberId,
      salon: currentSalon().slug,
    },
  }
}

export async function getMeService(adminId: string) {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      barberId: true,
      createdAt: true,
    },
  })
  if (!admin) throw new Error('Admin não encontrado')
  return admin
}

/** Encerra todas as sessões abertas do usuário (inclusive a atual). */
export async function logoutAllService(adminId: string) {
  await prisma.admin.update({
    where: { id: adminId },
    data: { tokenVersion: { increment: 1 } },
  })
  await audit({ adminId, action: 'sessions.revoke', entity: 'admin', entityId: adminId })
}
