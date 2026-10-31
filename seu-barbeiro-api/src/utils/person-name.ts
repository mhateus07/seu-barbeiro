import { z } from 'zod'

/**
 * Nome digitado em página pública. Ele entra nas mensagens do WhatsApp do
 * salão, então aceita só o que compõe um nome de pessoa.
 */
export const personName = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u)
