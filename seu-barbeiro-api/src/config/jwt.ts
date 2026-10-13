import jwt from 'jsonwebtoken'
import { env } from './env'

interface TokenPayload {
  sub: string
  email: string
  salon: string
  // Versão da sessão do usuário (admins.tokenVersion); tokens antigos não têm.
  ver?: number
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload
}
