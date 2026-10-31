// Preview uses only the disposable local test database. It never reads .env.
process.env.DATABASE_URL =
  process.env.PREVIEW_DATABASE_URL ||
  'postgresql://postgres:salon_test_only@127.0.0.1:55439/salon_test_b'
if (!/@(127\.0\.0\.1|localhost):\d+\/salon_test_/.test(process.env.DATABASE_URL))
  throw new Error('A prévia usa somente banco local salon_test_*')
process.env.SALON_DATABASES = JSON.stringify({ demo: process.env.DATABASE_URL })
process.env.DEFAULT_SALON = 'demo'
process.env.JWT_SECRET = 'local_preview_only_not_a_production_secret'
process.env.FRONTEND_URL =
  process.env.FRONTEND_URL || 'http://localhost:5173,http://127.0.0.1:5173'
process.env.PUBLIC_WEB_URL = 'http://localhost:5173'
process.env.TZ = 'America/Sao_Paulo'
process.env.NOTIFICATION_WORKER = 'false'
const { app } = require('../dist/app')
const { salons } = require('../dist/lib/prisma')
const { hashPassword } = require('../dist/utils/bcrypt')
const db = salons.get('demo').db
async function main() {
  await db.admin.upsert({
    where: { email: 'demo@salon.local' },
    create: {
      name: 'Demonstração',
      email: 'demo@salon.local',
      passwordHash: await hashPassword('Demo-salon-2026'),
      role: 'OWNER',
    },
    update: {},
  })
  for (const [key, value] of Object.entries({
    shop_name: 'Salão Aurora',
    shop_phone: '(32) 99999-0000',
    shop_address: 'Ambiente de demonstração',
    whatsapp_enabled: 'false',
  }))
    await db.settings.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    })
  if (!(await db.barber.count())) {
    const barber = await db.barber.create({
      data: { name: 'Camila', commissionRate: 40 },
    })
    await db.barber.create({ data: { name: 'Rafael', commissionRate: 35 } })
    const service = await db.service.create({
      data: {
        name: 'Corte e finalização',
        price: 90,
        durationMin: 45,
        returnDays: 30,
      },
    })
    await db.service.create({
      data: {
        name: 'Coloração',
        price: 180,
        durationMin: 30,
        processingMin: 40,
        finishingMin: 30,
        returnDays: 25,
      },
    })
    const client = await db.client.create({
      data: {
        name: 'Mariana Costa',
        phone: '5532999990001',
        marketingConsent: true,
      },
    })
    const start = new Date()
    start.setHours(10, 0, 0, 0)
    await db.appointment.create({
      data: {
        clientId: client.id,
        barberId: barber.id,
        startsAt: start,
        endsAt: new Date(start.getTime() + 2700000),
        totalPrice: 90,
        commissionRateSnapshot: 40,
        services: {
          create: {
            serviceId: service.id,
            priceSnapshot: 90,
            durationSnapshot: 45,
          },
        },
      },
    })
  }
  app.listen(Number(process.env.PREVIEW_PORT || 3333), '127.0.0.1', () =>
    console.log(
      'Demo: http://localhost:5173/login?salon=demo · demo@salon.local / Demo-salon-2026',
    ),
  )
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
