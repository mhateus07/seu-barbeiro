import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/*
  Segredos do salão (token do Mercado Pago, chave do WhatsApp) ficam cifrados
  no banco com AES-256-GCM. Quem tiver um backup não lê os tokens sem a chave,
  que fica só no .env do servidor (SETTINGS_KEY; sem ela, derivada do
  JWT_SECRET). Valores antigos, gravados em texto puro, continuam sendo lidos.
*/
const PREFIX = 'enc:v1:'

function key() {
  const source = process.env.SETTINGS_KEY || `settings:${process.env.JWT_SECRET ?? ''}`
  return createHash('sha256').update(source).digest()
}

export function isEncrypted(value: string) {
  return value.startsWith(PREFIX)
}

export function encryptSecret(value: string) {
  if (!value || isEncrypted(value)) return value
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
}

export function decryptSecret(value: string) {
  if (!value || !isEncrypted(value)) return value
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
}
