import bcrypt from 'bcryptjs'

// Mesmo custo do seed. Login compara contra um hash falso deste custo para
// e-mails que não existem, então o tempo de resposta não revela quem existe.
const ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function needsRehash(hash: string) {
  return bcrypt.getRounds(hash) < ROUNDS
}
