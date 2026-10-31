import { rateLimit } from './middlewares/rate-limit.middleware'
import operationsRoutes from './modules/operations/operations.routes'
import path from 'node:path'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { salonMiddleware } from './middlewares/salon.middleware'
import { authMiddleware, allowRoles } from './middlewares/auth.middleware'
import { errorMiddleware } from './middlewares/error.middleware'

import authRoutes from './modules/auth/auth.routes'
import barberRoutes from './modules/barbers/barbers.routes'
import serviceRoutes from './modules/services/services.routes'
import clientRoutes from './modules/clients/clients.routes'
import appointmentRoutes from './modules/appointments/appointments.routes'
import dashboardRoutes from './modules/dashboard/dashboard.routes'
import financesRoutes from './modules/finances/finances.routes'
import settingsRoutes from './modules/settings/settings.routes'
import notificationsRoutes from './modules/notifications/notifications.routes'
import publicRoutes from './modules/public/public.routes'
import subscriptionRoutes from './modules/subscriptions/subscriptions.routes'
import cashRoutes from './modules/cash/cash.routes'
import advancesRoutes from './modules/finances/advances.routes'
import { salons, salonContext } from './lib/prisma'
import { handleMercadoPagoNotification } from './modules/payments/pix.service'
import { workerLastRun } from './lib/worker-status'

const app = express()

// Atrás do proxy (Traefik): usa o IP real do cliente (X-Forwarded-For) no rate limit.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1))
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // Logos, fotos de profissionais e fichas técnicas são links HTTPS externos.
        'img-src': ["'self'", 'data:', 'https:'],
      },
    },
  }),
)
app.use(
  cors({
    origin: process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',')
      : ['http://localhost:5173', 'http://localhost:4173'],
    credentials: true,
  }),
)
app.use(express.json())

// Aviso de pagamento do Mercado Pago. O salão vem na URL (o provedor não envia
// cabeçalhos próprios) e o pagamento é sempre reconsultado na API do Mercado
// Pago, então um aviso falso não confirma nada. Responde 200 rápido.
app.post(
  '/api/v1/webhooks/mercadopago/:salon',
  rateLimit(300, 60000),
  (req, res) => {
    const salon = salons.get(String(req.params.salon))
    const body = req.body as { type?: string; topic?: string; data?: { id?: unknown } }
    const id = String(body?.data?.id ?? req.query['data.id'] ?? req.query.id ?? '')
    const topic = body?.type ?? body?.topic ?? req.query.type ?? req.query.topic
    res.sendStatus(200)
    if (!salon || !/^\d{1,30}$/.test(id) || (topic && topic !== 'payment')) return
    void salonContext.run(salon, () =>
      handleMercadoPagoNotification(id).catch((error) =>
        console.error('Falha ao processar aviso do Mercado Pago', error),
      ),
    )
  },
)

app.use('/api/v1', salonMiddleware)

// Rotas públicas
// Saudável só se todos os bancos responderem. As rotinas automáticas aparecem
// à parte: atraso nelas deve avisar o monitor, não reiniciar o container.
app.get('/health', async (_req, res) => {
  const time = new Date().toISOString()
  try {
    await Promise.all(
      [...salons.values()].map((salon) =>
        Promise.race([
          salon.db.$queryRaw`SELECT 1`,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 3000).unref(),
          ),
        ]),
      ),
    )
  } catch {
    return res.status(503).json({ ok: false, time })
  }
  const last = workerLastRun()
  res.json({
    ok: true,
    time,
    workerLastRun: last ? new Date(last).toISOString() : null,
  })
})
app.use('/api/v1/auth', rateLimit(30, 60000), authRoutes)
// Agendamentos e lista de espera pelo site: no máximo 10 por hora por aparelho,
// para ninguém lotar a agenda do salão com horários falsos.
const publicBookingLimit = rateLimit(
  Number(process.env.PUBLIC_BOOKING_LIMIT ?? 10),
  3600000,
  'Muitos agendamentos seguidos deste aparelho. Fale com o salão pelo WhatsApp.',
)
app.post('/api/v1/public/appointments', publicBookingLimit)
app.post('/api/v1/public/waitlist', publicBookingLimit)
app.use('/api/v1/public', rateLimit(120, 60000), publicRoutes)

// Rotas protegidas
app.use(
  '/api/v1/barbers',
  authMiddleware,
  allowRoles('OWNER', 'RECEPTION'),
  barberRoutes,
)
app.use(
  '/api/v1/services',
  authMiddleware,
  allowRoles('OWNER', 'RECEPTION'),
  serviceRoutes,
)
app.use(
  '/api/v1/clients',
  authMiddleware,
  allowRoles('OWNER', 'RECEPTION'),
  clientRoutes,
)
app.use(
  '/api/v1/appointments',
  authMiddleware,
  allowRoles('OWNER', 'RECEPTION'),
  appointmentRoutes,
)
app.use(
  '/api/v1/dashboard',
  authMiddleware,
  allowRoles('OWNER', 'RECEPTION'),
  dashboardRoutes,
)
app.use(
  '/api/v1/finances',
  authMiddleware,
  allowRoles('OWNER', 'RECEPTION'),
  financesRoutes,
)
app.use(
  '/api/v1/settings',
  authMiddleware,
  allowRoles('OWNER', 'RECEPTION'),
  settingsRoutes,
)
app.use(
  '/api/v1/notifications',
  authMiddleware,
  allowRoles('OWNER', 'RECEPTION'),
  notificationsRoutes,
)

app.use(
  '/api/v1/subscriptions',
  authMiddleware,
  allowRoles('OWNER', 'RECEPTION'),
  subscriptionRoutes,
)
app.use(
  '/api/v1/cash',
  authMiddleware,
  allowRoles('OWNER', 'RECEPTION'),
  cashRoutes,
)
app.use(
  '/api/v1/advances',
  authMiddleware,
  allowRoles('OWNER', 'RECEPTION'),
  advancesRoutes,
)

app.use('/api/v1/operations', authMiddleware, operationsRoutes)

// Em produção o mesmo container serve o painel (build do Vite em WEB_DIST).
const webDist = process.env.WEB_DIST
if (webDist) {
  app.use(
    '/assets',
    express.static(path.join(webDist, 'assets'), {
      immutable: true,
      maxAge: '1y',
    }),
  )
  app.use(express.static(webDist, { index: false }))
  app.get(/^\/(?!api\/).*/, (_req, res) =>
    res.sendFile(path.join(webDist, 'index.html')),
  )
}

app.use(errorMiddleware)

export { app }
