// Funcionalidades de 10/2026: sinal Pix, link do cliente, vales, caixa,
// bloqueio pelo profissional e assinaturas. O Mercado Pago é simulado por um
// servidor HTTP local; nenhuma chamada real é feita.
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const http = require('node:http')
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

// ─── Mercado Pago falso ──────────────────────────────────────────────────────
const mp = { payments: new Map(), seq: Date.now(), created: [] }
const mpServer = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (chunk) => (raw += chunk))
  req.on('end', () => {
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.headers.authorization !== 'Bearer TEST-fake-token-for-integration-tests')
      return send(401, { message: 'unauthorized' })
    const match = req.url.match(/^\/v1\/payments(?:\/(\d+))?$/)
    if (!match) return send(404, {})
    if (req.method === 'POST') {
      const body = JSON.parse(raw)
      const payment = {
        id: ++mp.seq,
        status: 'pending',
        transaction_amount: body.transaction_amount,
        external_reference: body.external_reference,
        point_of_interaction: {
          transaction_data: {
            qr_code: `00020126pix-${mp.seq}`,
            qr_code_base64: 'iVBORw0KGgo=',
            ticket_url: `https://mp.test/${mp.seq}`,
          },
        },
      }
      mp.payments.set(String(payment.id), payment)
      mp.created.push(body)
      return send(201, payment)
    }
    const payment = mp.payments.get(match[1])
    if (!payment) return send(404, {})
    if (req.method === 'PUT') payment.status = JSON.parse(raw).status
    return send(200, payment)
  })
})
const approve = (id) => {
  const p = mp.payments.get(String(id))
  p.status = 'approved'
  p.date_approved = new Date().toISOString()
}

let root, server, db, run, salons
const stamp = randomUUID().slice(0, 8)

async function request(route, { method = 'GET', body, token, salon = 'alpha' } = {}) {
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
const waitFor = async (check, ms = 3000) => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return false
}
const day = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toLocaleDateString('sv-SE')
}

after(async () => {
  if (db) {
    // Não deixa sinal ligado para os outros testes que usam o mesmo banco.
    for (const key of ['deposit_mode', 'mp_access_token'])
      await db.settings.deleteMany({ where: { key } })
  }
  if (server) await new Promise((resolve) => server.close(resolve))
  await new Promise((resolve) => mpServer.close(resolve))
  if (salons) await Promise.all([...salons.values()].map((s) => s.db.$disconnect()))
})

test('novas funcionalidades', async (t) => {
  mpServer.listen(0, '127.0.0.1')
  await new Promise((resolve) => mpServer.once('listening', resolve))
  process.env.MERCADOPAGO_API_URL = `http://127.0.0.1:${mpServer.address().port}`
  process.env.DATABASE_URL = urlA
  process.env.SALON_DATABASES = JSON.stringify({ alpha: urlA, beta: urlB })
  process.env.JWT_SECRET = 'integration_test_secret_not_for_production'
  process.env.DEFAULT_SALON = 'alpha'
  process.env.PUBLIC_WEB_URL = 'https://salao.test'
  process.env.TZ = 'America/Sao_Paulo'
  process.env.NODE_ENV = 'test'
  process.env.PUBLIC_BOOKING_LIMIT = '100000'
  for (const value of [urlA, urlB])
    execFileSync(
      process.execPath,
      [path.join(__dirname, '../node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
      {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: value },
        stdio: 'pipe',
      },
    )
  const { app } = require('../dist/app')
  ;({ salons } = require('../dist/lib/prisma'))
  const { salonContext } = require('../dist/lib/prisma')
  const { hashPassword } = require('../dist/utils/bcrypt')
  const { expireDeposits } = require('../dist/modules/payments/pix.service')
  const {
    runSubscriptionCycle,
    addMonths,
  } = require('../dist/modules/subscriptions/subscriptions.service')
  const { payCommission } = require('../dist/modules/finances/finances.service')
  const { updateAppointmentStatus } = require('../dist/modules/appointments/appointments.service')
  db = salons.get('alpha').db
  run = (fn) => salonContext.run(salons.get('alpha'), fn)

  const passwordHash = await hashPassword('test-password-123')
  const barber = await db.barber.create({
    data: { name: `Barbeiro ${stamp}`, commissionRate: 40 },
  })
  const other = await db.barber.create({ data: { name: `Outro ${stamp}`, commissionRate: 40 } })
  const service = await db.service.create({
    data: { name: `Corte ${stamp}`, price: 100, durationMin: 30 },
  })
  const settings = {
    mp_access_token: 'TEST-fake-token-for-integration-tests',
    deposit_mode: 'all',
    deposit_type: 'percent',
    deposit_value: '50',
    deposit_expire_minutes: '30',
    whatsapp_enabled: 'false',
  }
  for (const d of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'])
    settings[`hours_${d}`] = '00:00-23:59'
  for (const [key, value] of Object.entries(settings))
    await db.settings.upsert({ where: { key }, create: { key, value }, update: { value } })
  for (const role of ['OWNER', 'PROFESSIONAL'])
    await db.admin.create({
      data: {
        name: role,
        email: `${role}-feat-${stamp}@test.local`,
        passwordHash,
        role,
        ...(role === 'PROFESSIONAL' ? { barberId: barber.id } : {}),
      },
    })
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  root = `http://127.0.0.1:${server.address().port}`
  const login = async (role) =>
    (
      await request('/auth/login', {
        method: 'POST',
        body: { email: `${role}-feat-${stamp}@test.local`, password: 'test-password-123' },
      })
    ).data.data.token
  const owner = await login('OWNER')
  const pro = await login('PROFESSIONAL')
  let phoneSeq = Number(String(Date.now()).slice(-7))
  const phone = () => `5532 9${String(++phoneSeq).padStart(8, '0')}`
  const book = (date, time, extra = {}) =>
    request('/public/appointments', {
      method: 'POST',
      body: {
        clientName: `Cliente ${stamp}`,
        clientPhone: phone(),
        barberId: barber.id,
        serviceIds: [service.id],
        date,
        time,
        ...extra,
      },
    })

  await t.test('segredo do Mercado Pago não volta para o painel', async () => {
    const r = await request('/settings', { token: owner })
    assert.equal(r.status, 200)
    assert.equal(r.data.data.mp_access_token, undefined)
    assert.equal(r.data.data.mp_access_token_set, 'true')
  })

  await t.test('profissional bloqueia só a própria agenda', async () => {
    const block = (barberId, h) =>
      request('/operations/blocks', {
        method: 'POST',
        token: pro,
        body: {
          barberId,
          startsAt: new Date(`${day(20)}T${h}:00:00`).toISOString(),
          endsAt: new Date(`${day(20)}T${h}:30:00`).toISOString(),
          reason: 'Consulta médica',
        },
      })
    const mine = await block(barber.id, 10)
    assert.equal(mine.status, 201)
    assert.equal((await block(other.id, 11)).status, 403)
    const othersBlock = await db.scheduleBlock.create({
      data: {
        barberId: other.id,
        startsAt: new Date(`${day(20)}T12:00:00`),
        endsAt: new Date(`${day(20)}T13:00:00`),
        reason: 'Almoço',
      },
    })
    assert.equal(
      (await request(`/operations/blocks/${othersBlock.id}`, { method: 'DELETE', token: pro })).status,
      400,
    )
    assert.equal(
      (await request(`/operations/blocks/${mine.data.id}`, { method: 'DELETE', token: pro })).status,
      200,
    )
  })

  await t.test('sinal Pix: pagamento pelo webhook é registrado uma única vez', async () => {
    const r = await book(day(21), '09:00')
    assert.equal(r.status, 201)
    assert.equal(r.data.deposit.amount, 50)
    assert.ok(r.data.deposit.qrCode.startsWith('00020126'))
    assert.ok(/^[a-f0-9]{48}$/.test(r.data.manageToken))
    const charge = await db.pixCharge.findUnique({ where: { token: r.data.deposit.payToken } })
    assert.match(mp.created.at(-1).notification_url, /^https:\/\/salao\.test\/api\/v1\/webhooks\/mercadopago\/alpha$/)
    // Aviso antes de pagar não muda nada.
    await request(`/webhooks/mercadopago/alpha`, {
      method: 'POST',
      body: { type: 'payment', data: { id: charge.providerId } },
    })
    approve(charge.providerId)
    for (let i = 0; i < 3; i++)
      await request(`/webhooks/mercadopago/alpha`, {
        method: 'POST',
        body: { type: 'payment', data: { id: charge.providerId } },
      })
    assert.ok(
      await waitFor(async () =>
        (await db.appointment.findUnique({ where: { id: r.data.id } })).depositPaidAt,
      ),
    )
    await new Promise((r) => setTimeout(r, 300))
    const payments = await db.payment.findMany({ where: { appointmentId: r.data.id } })
    assert.equal(payments.length, 1)
    assert.equal(Number(payments[0].amount), 50)
    assert.equal(payments[0].method, 'PIX')
    const page = await request(`/public/pix/${r.data.deposit.payToken}`)
    assert.equal(page.data.status, 'PAID')
    assert.equal(page.data.qrCode, null)
  })

  await t.test('sinal não pago libera o horário e cancela o Pix', async () => {
    const r = await book(day(21), '11:00')
    const charge = await db.pixCharge.findUnique({ where: { token: r.data.deposit.payToken } })
    await db.pixCharge.update({
      where: { id: charge.id },
      data: { expiresAt: new Date(Date.now() - 60000) },
    })
    await run(() => expireDeposits())
    const a = await db.appointment.findUnique({ where: { id: r.data.id } })
    assert.equal(a.status, 'CANCELLED')
    assert.equal(mp.payments.get(charge.providerId).status, 'cancelled')
    // O mesmo horário volta a ficar disponível.
    assert.equal((await book(day(21), '11:00')).status, 201)
  })

  await t.test('link do cliente: remarcar, confirmar e cancelar', async () => {
    await db.settings.update({ where: { key: 'deposit_mode' }, data: { value: 'off' } })
    const r = await book(day(22), '09:00')
    assert.equal(r.data.deposit, null)
    const token = r.data.manageToken
    const view = await request(`/public/manage/${token}`)
    assert.equal(view.status, 200)
    assert.equal(view.data.canChange, true)
    assert.equal(view.data.clientFirstName, 'Cliente')
    assert.equal(view.data.phone, undefined)
    assert.equal((await request(`/public/manage/${'0'.repeat(48)}`)).status, 404)
    assert.equal((await request(`/public/manage/curto`)).status, 400)
    const slots = await request(`/public/manage/${token}/slots?date=${day(22)}`)
    assert.ok(slots.data.slots.includes('09:00'), 'o próprio horário continua livre')
    const moved = await request(`/public/manage/${token}/reschedule`, {
      method: 'POST',
      body: { date: day(22), time: '14:00' },
    })
    assert.equal(moved.status, 200)
    const a = await db.appointment.findUnique({ where: { id: r.data.id }, include: { segments: true } })
    assert.equal(a.startsAt.getHours(), 14)
    assert.equal(a.segments[0].startsAt.getTime(), a.startsAt.getTime())
    assert.equal((await request(`/public/manage/${token}/confirm`, { method: 'POST' })).status, 200)
    assert.equal((await db.appointment.findUnique({ where: { id: r.data.id } })).status, 'CONFIRMED')
    // Conflito: não pode remarcar para cima de outro cliente.
    await book(day(22), '16:00')
    const clash = await request(`/public/manage/${token}/reschedule`, {
      method: 'POST',
      body: { date: day(22), time: '16:00' },
    })
    assert.equal(clash.status, 409)
    assert.equal((await request(`/public/manage/${token}/cancel`, { method: 'POST' })).status, 200)
    assert.equal((await db.appointment.findUnique({ where: { id: r.data.id } })).status, 'CANCELLED')
    assert.equal((await request(`/public/manage/${token}/cancel`, { method: 'POST' })).status, 409)
    // Fora do prazo mínimo o link não altera mais.
    const soon = new Date(Date.now() + 3600000)
    const near = await book(soon.toLocaleDateString('sv-SE'), `${String(soon.getHours()).padStart(2, '0')}:${soon.getMinutes() < 30 ? '30' : '45'}`)
    if (near.status === 201) {
      const late = await request(`/public/manage/${near.data.manageToken}/cancel`, { method: 'POST' })
      assert.equal(late.status, 409)
      // Não deixa atendimento nas próximas 24 h para não interferir nos lembretes.
      await db.appointment.update({ where: { id: near.data.id }, data: { status: 'CANCELLED' } })
    }
  })

  await t.test('vales são descontados no pagamento da comissão', async () => {
    const client = await db.client.create({ data: { name: 'Vale', phone: phone().replace(/\D/g, '') } })
    const a = await db.appointment.create({
      data: {
        clientId: client.id,
        barberId: barber.id,
        startsAt: new Date(`${day(-40)}T10:00:00`),
        endsAt: new Date(`${day(-40)}T10:30:00`),
        status: 'COMPLETED',
        totalPrice: 100,
        commissionRateSnapshot: 40,
      },
    })
    assert.ok(a)
    const give = (amount) =>
      request('/advances', { method: 'POST', token: owner, body: { barberId: barber.id, amount } })
    const first = await give(30)
    assert.equal(first.status, 201)
    const second = await give(20)
    await db.barberAdvance.updateMany({
      where: { id: { in: [first.data.id, second.data.id] } },
      data: { givenAt: new Date(`${day(-41)}T09:00:00`) },
    })
    const big = await give(500)
    await db.barberAdvance.update({ where: { id: big.data.id }, data: { givenAt: new Date(`${day(-41)}T10:00:00`) } })
    const payment = await run(() =>
      payCommission({
        barberId: barber.id,
        periodFrom: day(-45),
        periodTo: day(-35),
        totalRevenue: 0,
        commissionAmount: 0,
        commissionRate: 0,
      }),
    )
    assert.equal(Number(payment.commissionAmount), 40)
    // 30 cabe na comissão de 40; somar o vale de 20 passaria do valor.
    assert.equal(Number(payment.advancesDeducted), 30)
    const settled = await db.barberAdvance.findMany({ where: { settledInId: payment.id } })
    assert.deepEqual(settled.map((a) => a.id), [first.data.id])
    assert.equal((await db.barberAdvance.findUnique({ where: { id: second.data.id } })).settledInId, null)
    const net = await db.expense.findFirst({ where: { notes: `Pagamento de comissão ${payment.id}` } })
    assert.equal(Number(net.amount), 40 - Number(payment.advancesDeducted))
    // O vale de 500 não cabe e fica em aberto.
    assert.equal((await db.barberAdvance.findUnique({ where: { id: big.data.id } })).settledInId, null)
    assert.equal(
      (await request(`/advances/${settled[0].id}`, { method: 'DELETE', token: owner })).status,
      400,
    )
    assert.equal(
      (await request(`/advances/${big.data.id}`, { method: 'DELETE', token: owner })).status,
      200,
    )
    assert.equal(await db.expense.count({ where: { notes: `Vale ${big.data.id}` } }), 0)
    const mine = await request('/operations/my-commission', { token: pro })
    assert.equal(typeof mine.data.openAdvances, 'number')
  })

  await t.test('caixa: esperado, sangria, vale do caixa e diferença', async () => {
    await db.cashSession.updateMany({
      where: { closedAt: null },
      data: { closedAt: new Date(), expectedAmount: 0, countedAmount: 0 },
    })
    assert.equal(
      (await request('/cash/movements', {
        method: 'POST',
        token: owner,
        body: { kind: 'WITHDRAWAL', amount: 5, reason: 'Troco' },
      })).status,
      400,
    )
    assert.equal((await request('/cash/open', { method: 'POST', token: owner, body: { openingAmount: 100 } })).status, 201)
    assert.equal((await request('/cash/open', { method: 'POST', token: owner, body: { openingAmount: 10 } })).status, 400)
    await request('/finances/payments', { method: 'POST', token: owner, body: { amount: 50, method: 'CASH' } })
    await request('/finances/payments', { method: 'POST', token: owner, body: { amount: 70, method: 'PIX' } })
    const refunded = await request('/finances/payments', { method: 'POST', token: owner, body: { amount: 15, method: 'CASH' } })
    await request(`/finances/payments/${refunded.data.data.id}`, { method: 'DELETE', token: owner })
    await request('/cash/movements', {
      method: 'POST',
      token: owner,
      body: { kind: 'WITHDRAWAL', amount: 20, reason: 'Depósito no banco' },
    })
    await request('/cash/movements', {
      method: 'POST',
      token: owner,
      body: { kind: 'SUPPLY', amount: 5, reason: 'Troco' },
    })
    await request('/advances', {
      method: 'POST',
      token: owner,
      body: { barberId: barber.id, amount: 10, fromCash: true },
    })
    const tooMuch = await request('/cash/movements', {
      method: 'POST',
      token: owner,
      body: { kind: 'WITHDRAWAL', amount: 10000, reason: 'Erro' },
    })
    assert.equal(tooMuch.status, 400)
    const current = await request('/cash/current', { token: owner })
    // 100 + 50 + 15 − 15 (estorno) − 20 + 5 − 10 (vale) = 125
    assert.equal(current.data.expected, 125)
    assert.equal(current.data.byMethod.PIX, 70)
    const closed = await request('/cash/close', {
      method: 'POST',
      token: owner,
      body: { countedAmount: 123, notes: 'Faltou troco' },
    })
    assert.equal(closed.status, 200)
    assert.equal(closed.data.difference, -2)
    assert.equal((await request('/cash/current', { token: owner })).data, null)
    assert.equal((await request('/cash/current', { token: pro })).status, 403)
  })

  await t.test('assinatura: Pix mensal, uso na comanda e limite', async () => {
    const plan = await request('/subscriptions/plans', {
      method: 'POST',
      token: owner,
      body: { name: `Clube ${stamp}`, price: 80, serviceIds: [service.id], usesPerCycle: 2 },
    })
    assert.equal(plan.status, 201)
    const client = await db.client.create({ data: { name: 'Assinante Teste', phone: phone().replace(/\D/g, '') } })
    const created = await request('/subscriptions', {
      method: 'POST',
      token: owner,
      body: { clientId: client.id, planId: plan.data.id },
    })
    assert.equal(created.status, 201)
    assert.equal(created.data.status, 'PENDING')
    assert.equal(
      (await request('/subscriptions', {
        method: 'POST',
        token: owner,
        body: { clientId: client.id, planId: plan.data.id },
      })).status,
      400,
    )
    const charge = await db.subscriptionCharge.findFirst({
      where: { subscriptionId: created.data.id },
      include: { pixCharges: true },
    })
    const pix = charge.pixCharges[0]
    assert.ok(pix.providerId)
    approve(pix.providerId)
    await request('/webhooks/mercadopago/alpha', {
      method: 'POST',
      body: { type: 'payment', data: { id: pix.providerId } },
    })
    assert.ok(
      await waitFor(async () =>
        (await db.subscription.findUnique({ where: { id: created.data.id } })).status === 'ACTIVE',
      ),
    )
    const sub = await db.subscription.findUnique({ where: { id: created.data.id } })
    assert.equal(sub.currentPeriodEnd.getTime(), addMonths(charge.periodStart, 1).getTime())
    const income = await db.payment.findFirst({ where: { notes: { contains: 'Assinante Teste' } } })
    assert.equal(Number(income.amount), 80)

    const visit = async (offsetDays) =>
      db.appointment.create({
        data: {
          clientId: client.id,
          barberId: barber.id,
          startsAt: new Date(Date.now() + offsetDays * 86400000),
          endsAt: new Date(Date.now() + offsetDays * 86400000 + 1800000),
          totalPrice: 100,
          commissionRateSnapshot: 40,
          services: {
            create: { serviceId: service.id, priceSnapshot: 100, durationSnapshot: 30 },
          },
        },
      })
    const first = await visit(2)
    const info = await request(`/subscriptions/appointments/${first.id}`, { token: owner })
    assert.equal(info.data.uses, 0)
    assert.equal((await request(`/subscriptions/appointments/${first.id}`, { method: 'POST', token: owner })).status, 200)
    const covered = await db.appointment.findUnique({ where: { id: first.id } })
    assert.equal(Number(covered.subscriptionCovered), 100)
    // Saldo zerado: não aceita recebimento.
    const pay = await request('/finances/payments', {
      method: 'POST',
      token: owner,
      body: { amount: 10, method: 'CASH', appointmentId: first.id },
    })
    assert.equal(pay.status, 400)
    // Comissão continua sobre o valor do serviço.
    await run(() => updateAppointmentStatus(first.id, { status: 'CONFIRMED' }))
    const second = await visit(3)
    await request(`/subscriptions/appointments/${second.id}`, { method: 'POST', token: owner })
    const third = await visit(4)
    const limit = await request(`/subscriptions/appointments/${third.id}`, { method: 'POST', token: owner })
    assert.equal(limit.status, 400)
    assert.match(limit.data.error.message, /Limite de 2/)
    assert.equal((await request(`/subscriptions/appointments/${second.id}`, { method: 'DELETE', token: owner })).status, 200)
    assert.equal((await request(`/subscriptions/appointments/${third.id}`, { method: 'POST', token: owner })).status, 200)

    // Renovação: perto do vencimento gera a próxima mensalidade com Pix.
    await db.subscription.update({
      where: { id: sub.id },
      data: { currentPeriodEnd: new Date(Date.now() + 86400000) },
    })
    await run(() => runSubscriptionCycle())
    const next = await db.subscriptionCharge.findMany({
      where: { subscriptionId: sub.id, status: 'PENDING' },
      include: { pixCharges: true },
    })
    assert.equal(next.length, 1)
    assert.equal(next[0].pixCharges.length, 1)
    await run(() => runSubscriptionCycle())
    assert.equal(await db.subscriptionCharge.count({ where: { subscriptionId: sub.id } }), 2)
    // Baixa manual cancela o Pix aberto.
    assert.equal(
      (await request(`/subscriptions/charges/${next[0].id}/manual`, {
        method: 'POST',
        token: owner,
        body: { method: 'CASH' },
      })).status,
      200,
    )
    assert.equal(mp.payments.get(next[0].pixCharges[0].providerId).status, 'cancelled')
    const renewed = await db.subscription.findUnique({ where: { id: sub.id } })
    assert.equal(renewed.currentPeriodEnd.getTime(), next[0].periodEnd.getTime())
    // Vencida sem pagar vira inadimplente.
    await db.subscription.update({
      where: { id: sub.id },
      data: { currentPeriodEnd: new Date(Date.now() - 1000) },
    })
    await run(() => runSubscriptionCycle())
    assert.equal((await db.subscription.findUnique({ where: { id: sub.id } })).status, 'PAST_DUE')
    assert.equal((await request(`/subscriptions/${sub.id}/cancel`, { method: 'POST', token: owner })).status, 200)
    assert.equal((await request('/subscriptions', { token: pro })).status, 403)
  })

  await t.test('receita do painel = financeiro, agrupada no dia de Brasília', async () => {
    // 22h30 em Brasília já é o dia seguinte em UTC.
    const from = new Date('2020-03-10T00:00:00-03:00')
    const to = new Date('2020-03-12T00:00:00-03:00')
    await db.payment.deleteMany({ where: { paidAt: { gte: from, lt: to } } })
    await db.payment.create({
      data: { amount: 80, method: 'PIX', paidAt: new Date('2020-03-10T22:30:00-03:00') },
    })
    await db.payment.create({
      data: {
        amount: 30,
        method: 'CASH',
        paidAt: new Date('2020-03-10T09:00:00-03:00'),
        refundedAt: new Date('2020-03-11T10:00:00-03:00'),
      },
    })
    const summary = await request('/dashboard/summary?date=2020-03-10', { token: owner })
    assert.equal(summary.data.data.revenueToday, 110)
    const finances = await request('/finances/summary?from=2020-03-10&to=2020-03-10', {
      token: owner,
    })
    assert.equal(finances.data.data.totalIncome, 110)
    const stats = await request('/dashboard/stats?from=2020-03-10&to=2020-03-11', { token: owner })
    assert.deepEqual(stats.data.data.revenueByDay, [
      { date: '2020-03-10', total: 110 },
      { date: '2020-03-11', total: -30 },
    ])
    const flow = await request('/finances/summary?from=2020-03-10&to=2020-03-11', { token: owner })
    assert.deepEqual(
      flow.data.data.cashFlowByDay.map((d) => [d.date, d.income]),
      [['2020-03-10', 110], ['2020-03-11', -30]],
    )
  })

  await t.test('excluir agendamento cancela e mantém o registro', async () => {
    await db.settings.update({ where: { key: 'deposit_mode' }, data: { value: 'off' } })
    const r = await book(day(23), '09:00')
    assert.equal(r.status, 201)
    const removed = await request(`/appointments/${r.data.id}`, { method: 'DELETE', token: owner })
    assert.equal(removed.status, 200)
    assert.equal((await db.appointment.findUnique({ where: { id: r.data.id } })).status, 'CANCELLED')
    // O horário volta a ficar livre.
    assert.equal((await book(day(23), '09:00')).status, 201)
    const again = await request(`/appointments/${r.data.id}`, { method: 'DELETE', token: owner })
    assert.equal(again.status, 400)
  })

  await t.test('login bloqueia o e-mail depois de 5 senhas erradas', async () => {
    const email = `OWNER-feat-${stamp}@test.local`
    const wrong = () =>
      request('/auth/login', { method: 'POST', body: { email, password: 'senha-errada-123' } })
    for (let i = 0; i < 4; i++) assert.equal((await wrong()).status, 401)
    assert.equal((await wrong()).status, 401)
    // Bloqueado: nem a senha certa entra até passar o prazo.
    const locked = await request('/auth/login', {
      method: 'POST',
      body: { email, password: 'test-password-123' },
    })
    assert.equal(locked.status, 429)
    assert.ok(await db.auditLog.findFirst({ where: { action: 'login.locked' } }))
    // Outro e-mail do mesmo salão segue entrando.
    assert.equal(
      (
        await request('/auth/login', {
          method: 'POST',
          body: { email: `PROFESSIONAL-feat-${stamp}@test.local`, password: 'test-password-123' },
        })
      ).status,
      200,
    )
  })

  await t.test('trocar a senha e sair de todos derrubam as sessões abertas', async () => {
    const user = await request('/operations/users', {
      method: 'POST',
      token: owner,
      body: { name: 'Recepção', email: `rec-${stamp}@test.local`, password: 'recepcao-123456', role: 'RECEPTION' },
    })
    assert.equal(user.status, 201)
    const enter = async (password) =>
      (await request('/auth/login', { method: 'POST', body: { email: `rec-${stamp}@test.local`, password } })).data
        .data.token
    const first = await enter('recepcao-123456')
    assert.equal((await request('/clients', { token: first })).status, 200)
    await request(`/operations/users/${user.data.id}`, {
      method: 'PATCH',
      token: owner,
      body: { password: 'recepcao-nova-123' },
    })
    assert.equal((await request('/clients', { token: first })).status, 401)
    const second = await enter('recepcao-nova-123')
    assert.equal((await request('/clients', { token: second })).status, 200)
    assert.equal((await request('/auth/logout-all', { method: 'POST', token: second })).status, 200)
    assert.equal((await request('/clients', { token: second })).status, 401)
  })

  await t.test('tokens do salão ficam cifrados no banco', async () => {
    const saved = await request('/settings', {
      method: 'PATCH',
      token: owner,
      body: { settings: { whatsapp_api_key: 'chave-secreta-whatsapp' } },
    })
    assert.equal(saved.status, 200)
    assert.equal(saved.data.data.whatsapp_api_key, undefined)
    assert.equal(saved.data.data.whatsapp_api_key_set, 'true')
    const row = await db.settings.findUnique({ where: { key: 'whatsapp_api_key' } })
    assert.match(row.value, /^enc:v1:/)
    assert.ok(!row.value.includes('chave-secreta'))
    const { getSettings, encryptStoredSecrets } = require('../dist/modules/settings/settings.service')
    assert.equal((await run(() => getSettings())).whatsapp_api_key, 'chave-secreta-whatsapp')
    // Token antigo em texto puro continua funcionando e é cifrado na inicialização.
    assert.equal((await run(() => getSettings())).mp_access_token, 'TEST-fake-token-for-integration-tests')
    await run(() => encryptStoredSecrets())
    assert.match((await db.settings.findUnique({ where: { key: 'mp_access_token' } })).value, /^enc:v1:/)
    assert.equal((await run(() => getSettings())).mp_access_token, 'TEST-fake-token-for-integration-tests')
    await db.settings.deleteMany({ where: { key: 'whatsapp_api_key' } })
  })

  await t.test('pelo site, um telefone tem no máximo 3 horários em aberto', async () => {
    await db.settings.update({ where: { key: 'deposit_mode' }, data: { value: 'off' } })
    const same = phone()
    for (const h of ['08:00', '08:30', '09:30'])
      assert.equal((await book(day(30), h, { clientPhone: same })).status, 201)
    const fourth = await book(day(30), '10:00', { clientPhone: same })
    assert.equal(fourth.status, 400)
    assert.match(fourth.data.message, /já tem horários marcados/)
  })

  await t.test('dono exporta e anonimiza os dados de um cliente', async () => {
    const client = await db.client.create({
      data: { name: `Titular ${stamp}`, phone: phone().replace(/\D/g, ''), email: `t-${stamp}@x.test`, notes: 'alergia' },
    })
    await db.technicalRecord.create({ data: { clientId: client.id, notes: 'ficha', authorId: 'x' } })
    await db.notificationLog.create({
      data: { type: 'CUSTOM', phone: client.phone, message: 'oi', clientId: client.id, status: 'SENT' },
    })
    assert.equal((await request(`/clients/${client.id}/export`, { token: pro })).status, 403)
    const exported = await request(`/clients/${client.id}/export`, { token: owner })
    assert.equal(exported.status, 200)
    assert.equal(exported.data.data.cadastro.nome, `Titular ${stamp}`)
    assert.equal(exported.data.data.fichasTecnicas.length, 1)
    assert.equal(exported.data.data.mensagens.length, 1)
    const removed = await request(`/clients/${client.id}/anonymize`, { method: 'POST', token: owner })
    assert.equal(removed.status, 200)
    const after = await db.client.findUnique({ where: { id: client.id } })
    assert.equal(after.name, 'Cliente removido')
    assert.equal(after.email, null)
    assert.equal(after.notes, null)
    assert.ok(!after.phone.match(/^\d+$/))
    assert.equal(await db.technicalRecord.count({ where: { clientId: client.id } }), 0)
    assert.equal(await db.notificationLog.count({ where: { clientId: client.id } }), 0)
    assert.ok(await db.auditLog.findFirst({ where: { action: 'client.anonymize', entityId: client.id } }))
    const log = await request('/operations/audit', { token: owner })
    assert.equal(log.status, 200)
    assert.ok(log.data.some((r) => r.action === 'client.export'))
  })

  await t.test('mensagens com mais de 12 meses são apagadas', async () => {
    const { purgeOldRecords } = require('../dist/modules/notifications/notifications.service')
    const old = await db.notificationLog.create({
      data: { type: 'CUSTOM', phone: '5532900000000', message: 'antiga', status: 'SENT', createdAt: new Date(Date.now() - 400 * 86400000) },
    })
    const recent = await db.notificationLog.create({
      data: { type: 'CUSTOM', phone: '5532900000000', message: 'recente', status: 'SENT' },
    })
    await run(() => purgeOldRecords())
    assert.equal(await db.notificationLog.findUnique({ where: { id: old.id } }), null)
    assert.ok(await db.notificationLog.findUnique({ where: { id: recent.id } }))
    await db.notificationLog.delete({ where: { id: recent.id } })
  })
})
