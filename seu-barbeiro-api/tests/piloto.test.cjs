// Regressões da análise de 31/10/2026: dinheiro, avisos ao cliente, comissão,
// estoque e permissões. O Mercado Pago é simulado; nada é enviado de verdade.
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const http = require('node:http')
const path = require('node:path')

const urlA = process.env.TEST_DATABASE_URL
const urlB = process.env.TEST_DATABASE_URL_B
for (const value of [urlA, urlB]) {
  if (!value) throw new Error('Configure TEST_DATABASE_URL e TEST_DATABASE_URL_B')
  const url = new URL(value)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.startsWith('/salon_test_'))
    throw new Error('Testes exigem PostgreSQL local e bancos salon_test_*')
}

const mp = { payments: new Map(), seq: Date.now() }
const mpServer = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    const send = (s, b) => {
      res.writeHead(s, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(b))
    }
    const m = req.url.match(/^\/v1\/payments(?:\/(\d+))?$/)
    if (!m) return send(404, {})
    if (req.method === 'POST') {
      const body = JSON.parse(raw)
      const p = {
        id: ++mp.seq,
        status: 'pending',
        transaction_amount: body.transaction_amount,
        point_of_interaction: {
          transaction_data: { qr_code: 'pix', qr_code_base64: 'x', ticket_url: 'https://mp.test' },
        },
      }
      mp.payments.set(String(p.id), p)
      return send(201, p)
    }
    const p = mp.payments.get(m[1])
    if (!p) return send(404, {})
    if (req.method === 'PUT') p.status = JSON.parse(raw).status
    send(200, p)
  })
})

const stamp = randomUUID().slice(0, 8)
const dayAt = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toLocaleDateString('sv-SE')
}
let seq = Math.floor(Math.random() * 8000000) + 1000000
const phone = () => `3298${++seq}`
let server, salons, db

after(async () => {
  if (db)
    for (const key of ['deposit_mode', 'mp_access_token', 'whatsapp_enabled', 'whatsapp_quiet_hours', 'whatsapp_reminder_hours', 'reception_max_discount_percent', 'professional_can_receive', 'booking_min_minutes', 'booking_max_days'])
      await db.settings.deleteMany({ where: { key } })
  if (server) await new Promise((r) => server.close(r))
  await new Promise((r) => mpServer.close(r))
  if (salons) await Promise.all([...salons.values()].map((s) => s.db.$disconnect()))
})

test('piloto', async (t) => {
  mpServer.listen(0, '127.0.0.1')
  await new Promise((r) => mpServer.once('listening', r))
  Object.assign(process.env, {
    MERCADOPAGO_API_URL: `http://127.0.0.1:${mpServer.address().port}`,
    DATABASE_URL: urlA,
    SALON_DATABASES: JSON.stringify({ alpha: urlA, beta: urlB }),
    JWT_SECRET: 'integration_test_secret_not_for_production',
    DEFAULT_SALON: 'alpha',
    PUBLIC_WEB_URL: 'https://salao.test',
    TZ: 'America/Sao_Paulo',
    NODE_ENV: 'test',
    PUBLIC_BOOKING_LIMIT: '100000',
  })
  for (const value of [urlA, urlB])
    execFileSync(process.execPath, [path.join(__dirname, '../node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: value },
      stdio: 'pipe',
    })
  const { app } = require('../dist/app')
  ;({ salons } = require('../dist/lib/prisma'))
  const { salonContext } = require('../dist/lib/prisma')
  const { hashPassword } = require('../dist/utils/bcrypt')
  const { sendPendingReminders } = require('../dist/modules/notifications/notifications.service')
  const { updateAppointmentStatus, updateAppointment } = require('../dist/modules/appointments/appointments.service')
  const { expireDeposits } = require('../dist/modules/payments/pix.service')
  const fin = require('../dist/modules/finances/finances.service')
  const subs = require('../dist/modules/subscriptions/subscriptions.service')
  const { isQuietTime } = require('../dist/utils/dates')
  db = salons.get('alpha').db
  const run = (fn) => salonContext.run(salons.get('alpha'), fn)

  server = app.listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  const root = `http://127.0.0.1:${server.address().port}`
  const request = async (route, { method = 'GET', body, token } = {}) => {
    const r = await fetch(`${root}/api/v1${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Salon': 'alpha', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const text = await r.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
    return { status: r.status, data }
  }
  const set = async (values) => {
    for (const [key, value] of Object.entries(values))
      await db.settings.upsert({ where: { key }, create: { key, value }, update: { value } })
  }
  const hours = {}
  for (const d of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'])
    hours[`hours_${d}`] = '00:00-23:59'
  await set({
    ...hours,
    mp_access_token: 'TEST-fake-token-for-integration-tests',
    deposit_mode: 'off',
    deposit_type: 'percent',
    deposit_value: '50',
    deposit_expire_minutes: '30',
    whatsapp_enabled: 'true',
    whatsapp_reminder_hours: '48',
    whatsapp_quiet_hours: '',
  })

  const barber = await db.barber.create({ data: { name: `Rafael ${stamp}`, commissionRate: 40 } })
  const service = await db.service.create({ data: { name: `Corte ${stamp}`, price: 100, durationMin: 30 } })
  const passwordHash = await hashPassword('test-password-123')
  const tokens = {}
  for (const role of ['OWNER', 'RECEPTION', 'PROFESSIONAL']) {
    const email = `${role.toLowerCase()}-${stamp}@test.local`
    await db.admin.create({
      data: { name: role, email, passwordHash, role, ...(role === 'PROFESSIONAL' ? { barberId: barber.id } : {}) },
    })
    const r = await request('/auth/login', { method: 'POST', body: { email, password: 'test-password-123' } })
    tokens[role] = r.data.data?.token ?? r.data.token
  }
  let minute = 0
  const slot = (offset) => {
    minute += 30
    const h = 6 + Math.floor(minute / 60) % 17
    return { date: dayAt(offset), time: `${String(h).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}` }
  }
  let dayOffset = 5
  const book = (extra = {}, offset) =>
    request('/public/appointments', {
      method: 'POST',
      body: {
        clientName: `Cliente Teste`,
        clientPhone: phone(),
        barberId: barber.id,
        serviceIds: [service.id],
        ...slot(offset ?? dayOffset),
        ...extra,
      },
    })
  const logs = (id) => db.notificationLog.findMany({ where: { appointmentId: id } })
  const complete = (id) =>
    run(async () => {
      await updateAppointmentStatus(id, { status: 'CONFIRMED' })
      await updateAppointmentStatus(id, { status: 'IN_PROGRESS' })
      return updateAppointmentStatus(id, { status: 'COMPLETED' })
    })

  await t.test('verificação de saúde consulta o banco', async () => {
    const r = await fetch(`${root}/health`)
    assert.equal(r.status, 200)
    assert.equal((await r.json()).ok, true)
  })

  await t.test('cancelar pelo link cancela o Pix e pagamento tardio é registrado', async () => {
    await set({ deposit_mode: 'all' })
    const { data: ap } = await book()
    const charge = await db.pixCharge.findFirst({ where: { appointmentId: ap.id } })
    await request(`/public/manage/${ap.manageToken}/cancel`, { method: 'POST' })
    const remote = mp.payments.get(charge.providerId)
    assert.equal(remote.status, 'cancelled')
    // O cliente pagou antes de o cancelamento chegar ao provedor.
    remote.status = 'approved'
    remote.date_approved = new Date().toISOString()
    await fetch(`${root}/api/v1/webhooks/mercadopago/alpha`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'payment', data: { id: charge.providerId } }),
    })
    await new Promise((r) => setTimeout(r, 400))
    assert.equal(await db.payment.count({ where: { appointmentId: ap.id } }), 1)
  })

  await t.test('sinal vencido avisa o cliente', async () => {
    const { data: ap } = await book()
    await db.pixCharge.updateMany({
      where: { appointmentId: ap.id },
      data: { expiresAt: new Date(Date.now() - 60000) },
    })
    await run(expireDeposits)
    const sent = await logs(ap.id)
    assert.ok(sent.some((l) => l.dedupeKey === `deposit-expired:${ap.id}`))
    await set({ deposit_mode: 'off' })
  })

  await t.test('e-mail repetido não impede o agendamento', async () => {
    const email = `familia-${stamp}@test.local`
    assert.equal((await book({ clientEmail: email })).status, 201)
    assert.equal((await book({ clientEmail: email })).status, 201)
  })

  await t.test('quem acabou de marcar não recebe lembrete junto com a confirmação', async () => {
    const { data: ap } = await book({}, 1)
    await run(sendPendingReminders)
    assert.deepEqual((await logs(ap.id)).map((l) => l.type), ['APPOINTMENT_CONFIRMATION'])
    await db.appointment.update({
      where: { id: ap.id },
      data: { createdAt: new Date(Date.now() - 4 * 3600000) },
    })
    await run(sendPendingReminders)
    assert.equal((await logs(ap.id)).length, 2)
  })

  await t.test('pausa de mensagens atravessa a meia-noite', () => {
    const at = (h) => new Date(2026, 9, 31, h, 0)
    assert.equal(isQuietTime('21:00-08:00', at(22)), true)
    assert.equal(isQuietTime('21:00-08:00', at(3)), true)
    assert.equal(isQuietTime('21:00-08:00', at(12)), false)
    assert.equal(isQuietTime('', at(3)), false)
  })

  await t.test('cliente é avisado quando o salão remarca ou cancela', async () => {
    const { data: ap } = await book()
    const moved = new Date(new Date(ap.startsAt).getTime() + 86400000).toISOString()
    await run(() => updateAppointment(ap.id, { startsAt: moved }))
    assert.equal((await logs(ap.id)).length, 2)
    await run(() => updateAppointmentStatus(ap.id, { status: 'CANCELLED' }))
    const after = await logs(ap.id)
    assert.equal(after.length, 3)
    assert.ok(after.some((l) => l.type === 'APPOINTMENT_CANCELLATION'))
  })

  await t.test('profissional conduz o próprio atendimento, só o dele', async () => {
    const { data: mine } = await book()
    const other = await db.barber.create({ data: { name: `Outro ${stamp}`, commissionRate: 40 } })
    const { data: theirs } = await book({ barberId: other.id })
    const go = (id, status) =>
      request(`/operations/appointments/${id}/status`, { method: 'PATCH', token: tokens.PROFESSIONAL, body: { status } })
    assert.equal((await go(mine.id, 'CONFIRMED')).status, 200)
    assert.equal((await go(mine.id, 'IN_PROGRESS')).status, 200)
    assert.equal((await go(mine.id, 'COMPLETED')).status, 200)
    assert.equal((await go(theirs.id, 'CONFIRMED')).status, 403)
    const cancel = await book()
    assert.equal((await go(cancel.data.id, 'CANCELLED')).status, 400)
  })

  await t.test('recebimento pelo profissional depende da configuração do dono', async () => {
    const { data: ap } = await book()
    const pay = () =>
      request(`/operations/appointments/${ap.id}/payments`, {
        method: 'POST',
        token: tokens.PROFESSIONAL,
        body: { amount: 100, method: 'PIX' },
      })
    assert.equal((await pay()).status, 403)
    await set({ professional_can_receive: 'true' })
    assert.equal((await pay()).status, 201)
    await set({ professional_can_receive: 'false' })
  })

  await t.test('encaixe do profissional entra na agenda dele sem mensagem', async () => {
    const r = await request('/operations/walk-ins', {
      method: 'POST',
      token: tokens.PROFESSIONAL,
      body: { clientName: 'Chegou Agora', clientPhone: phone(), serviceIds: [service.id] },
    })
    assert.equal(r.status, 201)
    assert.equal(r.data.barber.id, barber.id)
    assert.equal(r.data.source, 'WALK_IN')
    assert.equal((await logs(r.data.id)).length, 0)
  })

  await t.test('comissão respeita estorno e profissional desativado', async () => {
    const worker = await db.barber.create({ data: { name: `Comissao ${stamp}`, commissionRate: 50 } })
    const { data: ap } = await book({ barberId: worker.id })
    await complete(ap.id)
    const pay = await run(() => fin.createPayment({ appointmentId: ap.id, amount: 100, method: 'PIX' }))
    const { data: kept } = await book({ barberId: worker.id })
    await complete(kept.id)
    await run(() => fin.deletePayment(pay.id, 'cliente desistiu'))
    await db.barber.update({ where: { id: worker.id }, data: { isActive: false } })
    const row = (await run(() => fin.getCommissions(dayAt(-1), dayAt(30)))).find((b) => b.barberId === worker.id)
    assert.ok(row, 'desativado segue na lista com saldo')
    assert.equal(row.commission, 50)
    assert.equal(row.pendingCommission, 50)
  })

  await t.test('atendimento concluído depois do pagamento vira complemento', async () => {
    const worker = await db.barber.create({ data: { name: `Tardio ${stamp}`, commissionRate: 50 } })
    const first = await book({ barberId: worker.id })
    const second = await book({ barberId: worker.id })
    await complete(first.data.id)
    const period = { barberId: worker.id, periodFrom: dayAt(0), periodTo: dayAt(30) }
    const a = await run(() => fin.payCommission(period))
    assert.equal(Number(a.commissionAmount), 50)
    await assert.rejects(run(() => fin.payCommission(period)), /Já existe pagamento/)
    await complete(second.data.id)
    const b = await run(() => fin.payCommission(period))
    assert.equal(Number(b.commissionAmount), 50)
    await assert.rejects(run(() => fin.payCommission(period)), /Já existe pagamento/)
  })

  await t.test('produto: edição, reposição e devolução ao cancelar', async () => {
    const product = await db.product.create({ data: { name: `Pomada ${stamp}`, price: 40, cost: 15, stock: 10 } })
    const { data: ap } = await book()
    await request(`/operations/orders/${ap.id}/items`, {
      method: 'POST',
      token: tokens.RECEPTION,
      body: { productId: product.id, quantity: 2 },
    })
    await run(() => updateAppointmentStatus(ap.id, { status: 'CANCELLED' }))
    assert.equal((await db.product.findUnique({ where: { id: product.id } })).stock, 10)
    assert.equal(await db.orderItem.count({ where: { appointmentId: ap.id } }), 0)
    const edit = await request(`/operations/products/${product.id}`, {
      method: 'PATCH',
      token: tokens.OWNER,
      body: { price: 45, minStock: 3 },
    })
    assert.equal(edit.status, 200)
    assert.equal(Number(edit.data.price), 45)
    assert.equal(
      (await request(`/operations/products/${product.id}`, { method: 'PATCH', token: tokens.RECEPTION, body: { price: 1 } })).status,
      403,
    )
    const stock = await request(`/operations/products/${product.id}/stock`, {
      method: 'POST',
      token: tokens.RECEPTION,
      body: { quantity: 5, reason: 'Compra do mês' },
    })
    assert.equal(stock.data.stock, 15)
    const negative = await request(`/operations/products/${product.id}/stock`, {
      method: 'POST',
      token: tokens.RECEPTION,
      body: { quantity: -50, reason: 'Contagem' },
    })
    assert.equal(negative.status, 400)
  })

  await t.test('desconto da recepção tem limite e fica registrado', async () => {
    const { data: ap } = await book()
    const discount = (value) =>
      request(`/operations/orders/${ap.id}/discount`, {
        method: 'PATCH',
        token: tokens.RECEPTION,
        body: { discount: value },
      })
    await set({ reception_max_discount_percent: '10' })
    assert.equal((await discount(50)).status, 400)
    const before = await db.auditLog.count({ where: { action: 'order.discount' } })
    assert.equal((await discount(10)).status, 200)
    assert.equal(await db.auditLog.count({ where: { action: 'order.discount' } }), before + 1)
    await set({ reception_max_discount_percent: '100' })
  })

  await t.test('nome com endereço não entra pelo site', async () => {
    const r = await book({ clientName: 'Promoção! Acesse http://site.exemplo' })
    assert.equal(r.status, 400)
    assert.equal((await book({ clientName: "Ana D'Ávila-Souza Jr." })).status, 201)
  })

  await t.test('agendamento online respeita a janela do salão', async () => {
    await set({ booking_min_minutes: '120', booking_max_days: '30' })
    assert.equal((await book({ date: dayAt(45), time: '10:00' })).status, 400)
    const soon = new Date(Date.now() + 30 * 60000)
    const r = await book({
      date: soon.toLocaleDateString('sv-SE'),
      time: soon.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    })
    assert.equal(r.status, 400)
    await db.settings.deleteMany({ where: { key: { in: ['booking_min_minutes', 'booking_max_days'] } } })
  })

  await t.test('estorno da mensalidade reabre a cobrança', async () => {
    const client = await db.client.create({ data: { name: 'Assinante', phone: `55${phone()}` } })
    const plan = await db.plan.create({ data: { name: `Clube ${stamp}`, price: 80 } })
    const sub = await run(() => subs.createSubscription({ clientId: client.id, planId: plan.id }))
    const charge = sub.charges[0]
    await run(() => subs.payChargeManually(charge.id, 'PIX'))
    const paid = await db.subscriptionCharge.findUnique({ where: { id: charge.id } })
    await run(() => fin.deletePayment(paid.paymentId, 'pagou errado'))
    assert.equal((await db.subscription.findUnique({ where: { id: sub.id } })).status, 'PENDING')
    assert.equal((await db.subscriptionCharge.findUnique({ where: { id: charge.id } })).status, 'PENDING')
  })

  await t.test('dinheiro com o caixa fechado volta com aviso', async () => {
    await db.cashSession.updateMany({ where: { closedAt: null }, data: { closedAt: new Date() } })
    const { data: ap } = await book()
    const r = await request('/finances/payments', {
      method: 'POST',
      token: tokens.OWNER,
      body: { appointmentId: ap.id, amount: 50, method: 'CASH' },
    })
    assert.equal(r.status, 201)
    assert.equal(r.data.data.outsideCash, true)
  })
})
