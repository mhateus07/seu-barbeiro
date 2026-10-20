import { prisma, currentSalon } from '../../lib/prisma'
import { comparePassword, hashPassword, needsRehash } from '../../utils/bcrypt'
import { signToken } from '../../config/jwt'
import { audit } from '../../utils/audit'
import { LoginInput } from './auth.schema'

/*
  Bloqueio por e-mail e origem: depois de 5 senhas erradas em 15 minutos para o
  mesmo e-mail vindas do mesmo IP, novas tentativas desse IP são recusadas por
  15 minutos. Outro aparelho continua entrando com a senha certa, então ninguém
  consegue deixar a equipe sem acesso só errando a senha de propósito. Contra
  tentativas espalhadas por muitos IPs valem o limite geral da rota, o custo do
  bcrypt e a senha mínima de 10 caracteres. Fica em memória (um processo só).
*/
const MAX_FAILURES = 5
const WINDOW_MS = 15 * 60000
const failures = new Map<string, { count: number; first: number; lockedUntil: number }>()

export class LoginLockedError extends Error {}

// Hash de uma senha qualquer, no mesmo custo das senhas reais: e-mail
// inexistente custa o mesmo tempo que senha errada.
const DUMMY_HASH = hashPassword('senha-que-nao-existe')

function attemptKey(email: string, ip: string) {
  return `${currentSalon().slug}:${email.trim().toLowerCase()}:${ip}`
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

export async function loginService(input: LoginInput, ip = '') {
  const key = attemptKey(input.email, ip)
  const row = failures.get(key)
  if (row && row.lockedUntil > Date.now())
    throw new LoginLockedError('Muitas tentativas para este e-mail. Aguarde 15 minutos ou troque a senha com o dono do salão.')

  const admin = await prisma.admin.findUnique({ where: { email: input.email } })
  const isValid = await comparePassword(input.password, admin?.passwordHash ?? (await DUMMY_HASH))

  if (!admin || !admin.isActive || !isValid) {
    if (registerFailure(key))
      await audit({
        adminId: admin?.id,
        action: 'login.locked',
        entity: 'admin',
        entityId: admin?.id,
        details: { ip },
      })
    throw new Error('Credenciais inválidas')
  }
  failures.delete(key)
  // Senhas antigas com custo menor passam ao custo atual no primeiro login.
  if (needsRehash(admin.passwordHash))
    await prisma.admin.update({
      where: { id: admin.id },
      data: { passwordHash: await hashPassword(input.password) },
    })

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
