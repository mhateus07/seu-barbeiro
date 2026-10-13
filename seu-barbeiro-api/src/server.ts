import 'dotenv/config' // carrega .env antes de qualquer coisa
import './config/env' // valida as variáveis
import { startNotificationWorker } from './modules/notifications/notifications.service'
import { app } from './app'
import { salons, salonContext } from './lib/prisma'
import { encryptStoredSecrets } from './modules/settings/settings.service'

process.env.TZ = process.env.SALON_TIMEZONE || 'America/Sao_Paulo'
if (process.env.NOTIFICATION_WORKER !== 'false') startNotificationWorker()

// Tokens gravados antes da cifragem passam a ficar cifrados no banco.
for (const salon of salons.values())
  void salonContext
    .run(salon, encryptStoredSecrets)
    .catch(() => console.error(`Falha ao cifrar segredos do salão ${salon.slug}`))

const PORT = process.env.PORT || 3333

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`)
})
