const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const path = require('node:path')

const urlA = process.env.TEST_DATABASE_URL
const urlB = process.env.TEST_DATABASE_URL_B
for (const value of [urlA, urlB]) {
  if (!value)
    throw new Error(
      'Configure TEST_DATABASE_URL e TEST_DATABASE_URL_B para bancos descartáveis',
    )
  const url = new URL(value)
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !url.pathname.startsWith('/salon_test_')
  )
    throw new Error('Testes exigem PostgreSQL local e bancos salon_test_*')
}
process.env.DATABASE_URL = urlA
process.env.SALON_DATABASES = JSON.stringify({ alpha: urlA, beta: urlB })
process.env.JWT_SECRET = 'integration_test_secret_not_for_production'
process.env.DEFAULT_SALON = 'alpha'
process.env.PUBLIC_WEB_URL = 'http://localhost:5173'
process.env.TZ = 'America/Sao_Paulo'
process.env.NODE_ENV = 'test'
process.env.PUBLIC_BOOKING_LIMIT = '100000'
for (const value of [urlA, urlB])
  execFileSync(
    process.execPath,
    [
      path.join(__dirname, '../node_modules/prisma/build/index.js'),
      'migrate',
      'deploy',
    ],
    {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: value },
      stdio: 'pipe',
    },
  )
const { app } = require('../dist/app')
const { salons, salonContext } = require('../dist/lib/prisma')
const { hashPassword } = require('../dist/utils/bcrypt')
const {
  createAppointment,
  updateAppointment,
  updateAppointmentStatus,
} = require('../dist/modules/appointments/appointments.service')
const {
  redeemLoyaltyPoints,
} = require('../dist/modules/clients/clients.service')
const {
  createPayment,
  deletePayment,
  getCommissions,
  payCommission,
  getFinancialSummary,
} = require('../dist/modules/finances/finances.service')
const {
  getAvailableSlots,
  createPublicAppointment,
} = require('../dist/modules/public/public.service')
const {
  fillCancelledSlots,
} = require('../dist/modules/operations/waitlist.service')
const {
  sendPendingReminders,
  processNotificationQueue,
} = require('../dist/modules/notifications/notifications.service')
let server
const db = salons.get('alpha').db
const run = (fn) => salonContext.run(salons.get('alpha'), fn)
const stamp = randomUUID().slice(0, 8)
const future = new Date()
future.setDate(future.getDate() + 14)
future.setHours(9, 0, 0, 0)
const at = (hour, day = 0, minute = 0) => {
  const d = new Date(future)
  d.setDate(d.getDate() + day)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}
let client,
  barber,
  secondBarber,
  service,
  ownerToken,
  receptionToken,
  proToken,
  root,
  booking
async function request(
  route,
  { method = 'GET', body, token = ownerToken, salon = 'alpha' } = {},
) {
  const response = await fetch(`${root}/api/v1${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Salon': salon,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { status: response.status, data }
}
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  await Promise.all([...salons.values()].map((s) => s.db.$disconnect()))
})

test('salon operations integration', async (t) => {
  const passwordHash = await hashPassword('test-password-123')
  client = await db.client.create({
    data: {
      name: 'Cliente teste',
      phone: `5532${String(Date.now()).slice(-9)}`,
      marketingConsent: true,
    },
  })
  barber = await db.barber.create({
    data: { name: `Profissional ${stamp}`, commissionRate: 40 },
  })
  secondBarber = await db.barber.create({
    data: { name: `Outro ${stamp}`, commissionRate: 30 },
  })
  service = await db.service.create({
    data: {
      name: `Corte ${stamp}`,
      price: 100,
      durationMin: 30,
      returnDays: 25,
    },
  })
  for (const key of [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ])
    await db.settings.upsert({
      where: { key: `hours_${key}` },
      create: { key: `hours_${key}`, value: '00:00-23:59' },
      update: { value: '00:00-23:59' },
    })
  for (const role of ['OWNER', 'RECEPTION', 'PROFESSIONAL'])
    await db.admin.create({
      data: {
        name: role,
        email: `${role}-${stamp}@test.local`,
        passwordHash,
        role,
        ...(role === 'PROFESSIONAL' ? { barberId: barber.id } : {}),
      },
    })
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  root = `http://127.0.0.1:${server.address().port}`
  async function login(role) {
    const r = await request('/auth/login', {
      method: 'POST',
      token: '',
      body: {
        email: `${role}-${stamp}@test.local`,
        password: 'test-password-123',
      },
    })
    assert.equal(r.status, 200)
    return r.data.data.token
  }
  ownerToken = await login('OWNER')
  receptionToken = await login('RECEPTION')
  proToken = await login('PROFESSIONAL')
  const input = (hour, day = 0, extra = {}) => ({
    clientId: client.id,
    barberId: barber.id,
    serviceIds: [service.id],
    startsAt: at(hour, day),
    ...extra,
  })

  await t.test('8 simultaneous reservations accept exactly one', async () => {
    const attempts = await run(() =>
      Promise.allSettled(
        Array.from({ length: 8 }, () => createAppointment(input(9))),
      ),
    )
    assert.equal(attempts.filter((a) => a.status === 'fulfilled').length, 1)
    booking = attempts.find((a) => a.status === 'fulfilled').value
  })
  await t.test(
    'rescheduling rejects overlap and leaves original intact',
    async () => {
      const other = await run(() => createAppointment(input(10)))
      await assert.rejects(
        run(() => updateAppointment(other.id, { startsAt: at(9) })),
        /reservado|agendamento/,
      )
      assert.equal(
        (
          await db.appointment.findUnique({ where: { id: other.id } })
        ).startsAt.toISOString(),
        at(10),
      )
    },
  )
  await t.test(
    'status transitions and loyalty are idempotent under concurrency',
    async () => {
      await assert.rejects(
        run(() => updateAppointmentStatus(booking.id, { status: 'COMPLETED' })),
        /Transição/,
      )
      await run(() =>
        updateAppointmentStatus(booking.id, { status: 'CONFIRMED' }),
      )
      await run(() =>
        updateAppointmentStatus(booking.id, { status: 'IN_PROGRESS' }),
      )
      await run(() =>
        Promise.all(
          Array.from({ length: 5 }, () =>
            updateAppointmentStatus(booking.id, { status: 'COMPLETED' }),
          ),
        ),
      )
      const card = await db.loyaltyCard.findUnique({
        where: { clientId: client.id },
      })
      assert.equal(card.visitCount, 1)
      assert.equal(card.pointsBalance, 10)
      const redemptions = await run(() =>
        Promise.allSettled([
          redeemLoyaltyPoints(client.id, 10),
          redeemLoyaltyPoints(client.id, 10),
        ]),
      )
      assert.equal(
        redemptions.filter((a) => a.status === 'fulfilled').length,
        1,
      )
      assert.equal(
        (await db.loyaltyCard.findUnique({ where: { clientId: client.id } }))
          .pointsBalance,
        0,
      )
    },
  )
  await t.test(
    'split receipts prevent overpayment and refunds preserve records',
    async () => {
      const first = await run(() =>
        createPayment({ appointmentId: booking.id, amount: 40, method: 'PIX' }),
      )
      const outcomes = await run(() =>
        Promise.allSettled([
          createPayment({
            appointmentId: booking.id,
            amount: 60,
            method: 'CASH',
          }),
          createPayment({
            appointmentId: booking.id,
            amount: 60,
            method: 'CASH',
          }),
        ]),
      )
      assert.equal(outcomes.filter((a) => a.status === 'fulfilled').length, 1)
      await run(() => deletePayment(first.id))
      assert.ok(
        (await db.payment.findUnique({ where: { id: first.id } })).refundedAt,
      )
      await run(() =>
        createPayment({
          appointmentId: booking.id,
          amount: 40,
          method: 'DEBIT_CARD',
        }),
      )
    },
  )
  await t.test(
    'commission uses historical percentage and prevents duplicate periods',
    async () => {
      await db.barber.update({
        where: { id: barber.id },
        data: { commissionRate: 80 },
      })
      const date = future.toLocaleDateString('sv-SE')
      const commissions = await run(() => getCommissions(date, date))
      assert.equal(
        commissions.find((c) => c.barberId === barber.id).commission,
        40,
      )
      const data = {
        barberId: barber.id,
        periodFrom: date,
        periodTo: date,
        totalRevenue: 999999,
        commissionAmount: 999999,
        commissionRate: 99,
      }
      const paid = await run(() => payCommission(data))
      assert.equal(Number(paid.commissionAmount), 40)
      await assert.rejects(
        run(() => payCommission(data)),
        /Já existe/,
      )
    },
  )
  await t.test(
    'processing time releases professional but keeps resource busy',
    async () => {
      const resource = await db.resource.create({
        data: { name: `Cadeira ${stamp}` },
      })
      const color = await db.service.create({
        data: {
          name: `Coloração ${stamp}`,
          price: 200,
          durationMin: 30,
          processingMin: 60,
          finishingMin: 30,
          resourceId: resource.id,
        },
      })
      await run(() =>
        createAppointment(input(9, 1, { serviceIds: [color.id] })),
      )
      await run(() => createAppointment(input(10, 1)))
      await assert.rejects(
        run(() =>
          createAppointment(
            input(10, 1, { barberId: secondBarber.id, serviceIds: [color.id] }),
          ),
        ),
        /recurso|reservado/,
      )
      await assert.rejects(
        run(() => createAppointment(input(10, 1, { startsAt: at(10, 1, 30) }))),
        /reservado/,
      )
    },
  )
  await t.test(
    'schedule blocks, professional service eligibility and outside hours',
    async () => {
      const block = await request('/operations/blocks', {
        method: 'POST',
        body: {
          barberId: barber.id,
          startsAt: at(12, 2),
          endsAt: at(13, 2),
          reason: 'Almoço',
        },
      })
      assert.equal(block.status, 201)
      await assert.rejects(
        run(() => createAppointment(input(12, 2))),
        /bloqueio/,
      )
      await db.barber.update({
        where: { id: barber.id },
        data: { serviceIds: [randomUUID()] },
      })
      await assert.rejects(
        run(() => createAppointment(input(14, 2))),
        /não realiza/,
      )
      await db.barber.update({
        where: { id: barber.id },
        data: { serviceIds: [] },
      })
      await assert.rejects(
        run(() => createAppointment(input(23, 2, { startsAt: at(23, 2, 45) }))),
        /expediente/,
      )
    },
  )
  await t.test('tenant-bound tokens and professional permissions', async () => {
    assert.equal((await request('/clients', { salon: 'beta' })).status, 401)
    assert.equal((await request('/clients', { salon: 'missing' })).status, 404)
    assert.equal(
      (await request('/finances/summary', { token: proToken })).status,
      403,
    )
    assert.equal(
      (await request('/operations/users', { token: receptionToken })).status,
      403,
    )
    assert.equal(
      (
        await request('/settings', {
          token: receptionToken,
          method: 'PATCH',
          body: { settings: { shop_name: 'Blocked' } },
        })
      ).status,
      403,
    )
    const date = new Date(at(9)).toLocaleDateString('sv-SE')
    const agenda = await request(`/operations/agenda?date=${date}`, {
      token: proToken,
    })
    assert.equal(agenda.status, 200)
    assert.ok(agenda.data.appointments.every((a) => a.barberId === barber.id))
    const week = await request(`/operations/agenda?date=${date}&days=7`, {
      token: proToken,
    })
    assert.equal(week.status, 200)
    assert.ok(week.data.appointments.length >= agenda.data.appointments.length)
    assert.ok(week.data.appointments.every((a) => a.barberId === barber.id))
    assert.notEqual(
      (await request(`/operations/agenda?date=${date}&days=8`, { token: proToken }))
        .status,
      200,
    )
    assert.equal(
      await salons.get('beta').db.client.count({ where: { id: client.id } }),
      0,
    )
  })
  await t.test('waitlist offers hold slot and accept once', async () => {
    const entry = await request('/operations/waitlist', {
      method: 'POST',
      body: {
        clientId: client.id,
        serviceIds: [service.id],
        from: at(9, 3),
        to: at(13, 3),
      },
    })
    assert.equal(entry.status, 201)
    const offer = await request(`/operations/waitlist/${entry.data.id}/offer`, {
      method: 'POST',
      body: { startsAt: at(10, 3), barberId: barber.id },
    })
    assert.equal(offer.status, 200, JSON.stringify(offer.data))
    await assert.rejects(
      run(() => createAppointment(input(10, 3))),
      /temporariamente/,
    )
    const token = new URL(offer.data.link).searchParams.get('token')
    const results = await Promise.all([
      request(`/public/offers/${token}/accept`, { method: 'POST', token: '' }),
      request(`/public/offers/${token}/accept`, { method: 'POST', token: '' }),
    ])
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409])
    const booked = await db.waitlistEntry.findUnique({
      where: { id: entry.data.id },
    })
    assert.equal(booked.status, 'BOOKED')
    assert.equal(
      (await db.appointment.findUnique({ where: { id: booked.appointmentId } }))
        .source,
      'WAITLIST',
    )
  })
  await t.test(
    'technical records require photo consent and unrelated professionals cannot read',
    async () => {
      const bad = await request(`/operations/clients/${client.id}/records`, {
        method: 'POST',
        body: {
          formula: 'Teste',
          photoUrls: ['https://example.com/photo.jpg'],
          photoConsent: false,
        },
      })
      assert.equal(bad.status, 400)
      const good = await request(`/operations/clients/${client.id}/records`, {
        method: 'POST',
        token: proToken,
        body: { formula: '6.0 + oxidante', products: 'Produto A' },
      })
      assert.equal(good.status, 201)
      const other = await db.client.create({
        data: { name: 'Outro', phone: `5511${String(Date.now()).slice(-9)}` },
      })
      assert.equal(
        (
          await request(`/operations/clients/${other.id}/records`, {
            token: proToken,
          })
        ).status,
        403,
      )
      // Um horário cancelado com o profissional não abre a ficha.
      await db.appointment.create({
        data: {
          clientId: other.id,
          barberId: barber.id,
          startsAt: at(15, 5),
          endsAt: at(16, 5),
          totalPrice: 0,
          status: 'CANCELLED',
        },
      })
      assert.equal(
        (
          await request(`/operations/clients/${other.id}/records`, {
            token: proToken,
          })
        ).status,
        403,
      )
    },
  )
  await t.test(
    'inventory sales are atomic and restore stock on removal',
    async () => {
      const product = await request('/operations/products', {
        method: 'POST',
        body: { name: 'Pomada teste', price: 35, cost: 15, stock: 1 },
      })
      assert.equal(product.status, 201)
      const appointment = await run(() => createAppointment(input(15, 4)))
      const results = await Promise.all(
        Array.from({ length: 2 }, () =>
          request(`/operations/orders/${appointment.id}/items`, {
            method: 'POST',
            body: { productId: product.data.id, quantity: 1 },
          }),
        ),
      )
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 400])
      const item = results.find((r) => r.status === 201).data
      assert.equal(
        (
          await request(
            `/operations/orders/${appointment.id}/items/${item.id}`,
            { method: 'DELETE' },
          )
        ).status,
        200,
      )
      assert.equal(
        (await db.product.findUnique({ where: { id: product.data.id } })).stock,
        1,
      )
    },
  )
  await t.test(
    'reactivation requires consent and respects repeat-contact limit',
    async () => {
      const c = await db.client.create({
        data: {
          name: 'Retorno',
          phone: `5521${String(Date.now()).slice(-9)}`,
          marketingConsent: false,
        },
      })
      assert.equal(
        (
          await request('/operations/reactivation', {
            method: 'POST',
            body: { clientId: c.id, serviceId: service.id },
          })
        ).status,
        400,
      )
      await db.client.update({
        where: { id: c.id },
        data: { marketingConsent: true },
      })
      assert.equal(
        (
          await request('/operations/reactivation', {
            method: 'POST',
            body: { clientId: c.id, serviceId: service.id },
          })
        ).status,
        201,
      )
      assert.equal(
        (
          await request('/operations/reactivation', {
            method: 'POST',
            body: { clientId: c.id, serviceId: service.id },
          })
        ).status,
        400,
      )
    },
  )
  await t.test(
    'professional prices are snapshotted and preserved after catalog changes',
    async () => {
      await db.barber.update({
        where: { id: barber.id },
        data: {
          serviceOverrides: { [service.id]: { price: 130, durationMin: 45 } },
        },
      })
      const a = await run(() => createAppointment(input(9, 6)))
      assert.equal(Number(a.totalPrice), 130)
      assert.equal((a.endsAt - a.startsAt) / 60000, 45)
      await db.barber.update({
        where: { id: barber.id },
        data: {
          serviceOverrides: { [service.id]: { price: 150, durationMin: 60 } },
        },
      })
      const edited = await run(() =>
        updateAppointment(a.id, { startsAt: at(11, 6) }),
      )
      assert.equal(Number(edited.totalPrice), 130)
      assert.equal((edited.endsAt - edited.startsAt) / 60000, 45)
      await db.barber.update({
        where: { id: barber.id },
        data: { serviceOverrides: {} },
      })
    },
  )
  await t.test('multi-professional visit is all-or-nothing', async () => {
    const body = {
      clientId: client.id,
      appointments: [
        { barberId: barber.id, serviceIds: [service.id], startsAt: at(9, 7) },
        {
          barberId: secondBarber.id,
          serviceIds: [service.id],
          startsAt: at(9, 7),
        },
      ],
    }
    const r = await request('/operations/visits', { method: 'POST', body })
    assert.equal(r.status, 201, JSON.stringify(r.data))
    assert.equal(r.data.appointments.length, 2)
    assert.ok(r.data.appointments.every((a) => a.visitId === r.data.visitId))
    const before = await db.appointment.count({
      where: { barberId: barber.id },
    })
    const bad = await request('/operations/visits', {
      method: 'POST',
      body: {
        ...body,
        appointments: [
          { ...body.appointments[0], startsAt: at(11, 7) },
          body.appointments[1],
        ],
      },
    })
    assert.equal(bad.status, 400)
    assert.equal(
      await db.appointment.count({ where: { barberId: barber.id } }),
      before,
    )
  })
  await t.test(
    'cancelled vacancy automatically offers one matching client',
    async () => {
      const a = await run(() => createAppointment(input(9, 8)))
      await run(() => updateAppointmentStatus(a.id, { status: 'CANCELLED' }))
      const entry = await db.waitlistEntry.create({
        data: {
          clientId: client.id,
          barberId: barber.id,
          serviceIds: [service.id],
          from: new Date(at(8, 8)),
          to: new Date(at(12, 8)),
        },
      })
      for (const key of ['waitlist_auto_offer', 'whatsapp_enabled'])
        await db.settings.upsert({
          where: { key },
          create: { key, value: 'true' },
          update: { value: 'true' },
        })
      // The vacancy must lie in the worker's 14-day horizon.
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(9, 0, 0, 0)
      await db.appointment.update({
        where: { id: a.id },
        data: {
          startsAt: tomorrow,
          endsAt: new Date(tomorrow.getTime() + 1800000),
        },
      })
      const vacancy = await db.appointment.findUnique({ where: { id: a.id } })
      await db.waitlistEntry.update({
        where: { id: entry.id },
        data: {
          from: new Date(vacancy.startsAt.getTime() - 3600000),
          to: new Date(vacancy.endsAt.getTime() + 3600000),
        },
      })
      await run(() => fillCancelledSlots())
      await run(() => fillCancelledSlots())
      const offered = await db.waitlistEntry.findUnique({
        where: { id: entry.id },
      })
      assert.equal(offered.status, 'OFFERED')
      assert.equal(
        await db.notificationLog.count({
          where: { dedupeKey: `waitlist:${offered.token}` },
        }),
        1,
      )
      await db.settings.update({
        where: { key: 'whatsapp_enabled' },
        data: { value: 'false' },
      })
      await db.settings.update({
        where: { key: 'waitlist_auto_offer' },
        data: { value: 'false' },
      })
    },
  )
  await t.test(
    'refund affects refund date without erasing original receipt',
    async () => {
      const p = await run(() =>
        createPayment({
          amount: 77,
          method: 'PIX',
          paidAt: '2001-01-15T12:00:00-03:00',
        }),
      )
      await db.payment.update({
        where: { id: p.id },
        data: { refundedAt: new Date('2001-02-15T12:00:00-03:00') },
      })
      const january = await run(() =>
        getFinancialSummary('2001-01-15', '2001-01-15'),
      )
      const february = await run(() =>
        getFinancialSummary('2001-02-15', '2001-02-15'),
      )
      assert.ok(january.totalIncome >= 77)
      assert.ok(february.totalIncome <= -77)
    },
  )
  await t.test(
    'a completed appointment can have only one active return',
    async () => {
      await run(() =>
        createAppointment(input(15, 9, { returnOfId: booking.id })),
      )
      await assert.rejects(
        run(() => createAppointment(input(16, 9, { returnOfId: booking.id }))),
        /Já existe retorno/,
      )
    },
  )
  await t.test(
    'reminders retry failures with a deduplicated queue and no real provider calls',
    async () => {
      for (const [key, value] of Object.entries({
        whatsapp_enabled: 'true',
        whatsapp_api_url: 'https://provider.invalid',
        whatsapp_api_key: 'test',
        whatsapp_instance: 'test',
        whatsapp_reminder_hours: '24',
      }))
        await db.settings.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        })
      // Other queued campaigns are suppressed in this isolated provider test.
      await db.notificationLog.updateMany({
        where: { status: { not: 'SENT' } },
        data: { attempts: 5 },
      })
      const appointment = await db.appointment.create({
        data: {
          clientId: client.id,
          barberId: barber.id,
          startsAt: new Date(Date.now() + 5 * 3600000),
          endsAt: new Date(Date.now() + 6 * 3600000),
          totalPrice: 100,
        },
      })
      await run(() => sendPendingReminders())
      await run(() => sendPendingReminders())
      assert.equal(
        await db.notificationLog.count({
          where: { appointmentId: appointment.id },
        }),
        1,
      )
      const realFetch = global.fetch
      let calls = 0
      try {
        global.fetch = async () => {
          calls++
          return { ok: false, status: 503 }
        }
        await run(() => processNotificationQueue())
        let log = await db.notificationLog.findFirst({
          where: { appointmentId: appointment.id },
        })
        assert.equal(log.status, 'FAILED')
        assert.equal(log.attempts, 1)
        await db.notificationLog.update({
          where: { id: log.id },
          data: { nextAttemptAt: new Date(0) },
        })
        global.fetch = async () => {
          calls++
          return { ok: true, status: 200 }
        }
        await run(() => processNotificationQueue())
        await run(() => processNotificationQueue())
        log = await db.notificationLog.findUnique({ where: { id: log.id } })
        assert.equal(log.status, 'SENT')
        assert.equal(calls, 2)
      } finally {
        global.fetch = realFetch
        await db.settings.update({
          where: { key: 'whatsapp_enabled' },
          data: { value: 'false' },
        })
      }
    },
  )
  await t.test('public waitlist requires permission and deduplicates requests without exposing client data', async () => {
    const date = new Date(at(9, 10)).toLocaleDateString('sv-SE')
    const body = { name: 'Nome público', phone: client.phone, date, barberId: barber.id, serviceIds: [service.id], contactConsent: true }
    const rejected = await request('/public/waitlist', { method: 'POST', token: '', body: { ...body, contactConsent: false } })
    assert.equal(rejected.status, 400)
    const results = await Promise.all([request('/public/waitlist', { method: 'POST', token: '', body }), request('/public/waitlist', { method: 'POST', token: '', body })])
    for (const result of results) { assert.equal(result.status, 201); assert.deepEqual(result.data, { registered: true }) }
    assert.equal(await db.waitlistEntry.count({ where: { clientId: client.id, barberId: barber.id, from: new Date(`${date}T00:00:00`) } }), 1)
  })
  await t.test(
    'public booking validates time and omits existing client private identity',
    async () => {
      const d = new Date(at(16, 5)).toLocaleDateString('sv-SE')
      const result = await run(() =>
        createPublicAppointment({
          clientName: 'Nome informado',
          clientPhone: client.phone,
          barberId: barber.id,
          serviceIds: [service.id],
          date: d,
          time: '16:00',
        }),
      )
      assert.deepEqual(result.client, { name: 'Nome informado' })
      await assert.rejects(
        run(() => getAvailableSlots(barber.id, d, -1, [service.id])),
        /inválida/,
      )
    },
  )
})
