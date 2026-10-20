import { Response } from 'express'
import { isBusinessError } from './http-error'

export function success<T>(res: Response, data: T, statusCode = 200) {
  return res.status(statusCode).json({ data })
}

export function paginate<T>(
  res: Response,
  data: T[],
  meta: { total: number; page: number; limit: number },
) {
  return res.status(200).json({
    data,
    meta: {
      ...meta,
      totalPages: Math.ceil(meta.total / meta.limit),
    },
  })
}

export function apiError(res: Response, message: string, statusCode = 400, details?: unknown) {
  return res.status(statusCode).json({ error: { message, details } })
}

/** Página e tamanho vindos da URL: tamanho entre 1 e 100, texto inválido vira o padrão. */
export function pageParams(page: unknown, limit: unknown, fallback = 20) {
  const p = Math.floor(Number(page)),
    l = Math.floor(Number(limit))
  return {
    page: Number.isFinite(p) && p >= 1 ? p : 1,
    limit: Number.isFinite(l) && l >= 1 ? Math.min(l, 100) : fallback,
  }
}

/** Mensagem que pode ir para a tela: só a de regra de negócio, nunca a do banco. */
export function publicMessage(error: unknown) {
  if (isBusinessError(error)) return error.message
  console.error(error)
  return 'Não foi possível concluir a operação'
}
