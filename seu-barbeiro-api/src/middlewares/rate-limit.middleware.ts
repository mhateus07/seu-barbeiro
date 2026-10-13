import { Request, Response, NextFunction } from 'express'
// `message` no topo para as páginas públicas; `error.message` para o painel.
export function rateLimit(
  limit: number,
  windowMs: number,
  message = 'Muitas tentativas. Aguarde alguns minutos.',
) {
  const counts = new Map<string, { count: number; until: number }>()
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now(),
      key = `${req.ip}:${req.header('X-Salon') || ''}`
    if (counts.size > 10000)
      for (const [k, v] of counts) if (v.until <= now) counts.delete(k)
    const row = counts.get(key)
    if (row && row.until > now) {
      row.count++
      if (row.count > limit)
        return res
          .status(429)
          .json({ message, error: { message } })
    } else counts.set(key, { count: 1, until: now + windowMs })
    next()
  }
}
