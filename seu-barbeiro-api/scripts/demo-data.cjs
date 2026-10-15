// Dados de demonstração: transforma um salão vazio numa barbearia "em funcionamento"
// com 60 dias de histórico e 14 dias de agenda. Tudo é fictício.
//
//   node scripts/demo-data.cjs criar            → só roda com o salão sem clientes/atendimentos
//   node scripts/demo-data.cjs limpar --sim     → apaga clientes, agenda, financeiro, planos etc.
//                                                 (mantém acessos da equipe e configurações)
//   node scripts/demo-data.cjs acessos --sim    → apaga TODOS os acessos e cria os de demonstração
//                                                 (dono, recepção e profissional), com senhas novas
//
// Use SALAO=<slug> para escolher o salão quando houver mais de um.
// Telefones usam o prefixo 9 0000-xxxx, faixa não atribuída, e o WhatsApp não é ligado.
const { randomUUID, randomBytes } = require('node:crypto')

process.env.TZ = process.env.SALON_TIMEZONE || process.env.TZ || 'America/Sao_Paulo'
const { salons } = require('../dist/lib/prisma')

const mode = process.argv[2]
const slug = process.env.SALAO || process.env.DEFAULT_SALON || [...salons.keys()][0]
const salon = salons.get(slug)
if (!salon) throw new Error(`Salão ${slug} não encontrado`)
const db = salon.db

// ─── utilitários ─────────────────────────────────────────────────────────────
let seed = 20261004
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const pick = (list) => list[Math.floor(rand() * list.length)]
const chance = (p) => rand() < p
const weighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0)
  let r = rand() * total
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v
  return pairs[0][0]
}
const day = (offset, h = 0, m = 0) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  d.setHours(h, m, 0, 0)
  return d
}
const addMin = (d, m) => new Date(d.getTime() + m * 60000)
const money = (v) => Math.round(v * 100) / 100
const token = () => randomBytes(24).toString('hex')

async function limpar() {
  if (!process.argv.includes('--sim'))
    throw new Error('Confirme com: node scripts/demo-data.cjs limpar --sim')
  const tables = [
    'pix_charges', 'subscription_charges', 'appointment_services', 'appointment_segments',
    'order_items', 'payments', 'notification_logs', 'outreach', 'waitlist_entries',
    'technical_records', 'loyalty_cards', 'barber_advances', 'commission_payments',
    'cash_movements', 'cash_sessions', 'appointments', 'subscriptions', 'plans',
    'expenses', 'schedule_blocks', 'work_schedules', 'products', 'resources',
    'clients', 'services',
  ]
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} CASCADE`)
  // Profissionais vinculados a acessos da equipe são mantidos.
  const linked = (await db.admin.findMany({ where: { barberId: { not: null } } })).map((a) => a.barberId)
  await db.barber.deleteMany({ where: { id: { notIn: linked } } })
  console.log(`Salão ${slug}: dados apagados (acessos e configurações mantidos).`)
}

async function acessos() {
  if (!process.argv.includes('--sim'))
    throw new Error('Confirme com: node scripts/demo-data.cjs acessos --sim')
  const { hashPassword } = require('../dist/utils/bcrypt')
  const professional = await db.barber.findFirst({ where: { name: 'Diego Martins' } })
  if (!professional) throw new Error('Rode "criar" antes: o acesso de profissional usa o Diego Martins.')
  // Senha legível para ditar numa demonstração, mas sorteada a cada execução.
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const password = () =>
    `Demo-${Array.from(randomBytes(10), (b) => letters[b % letters.length]).join('').replace(/(.{5})/, '$1-')}`
  const accounts = [
    { name: 'Dono (demonstração)', email: 'dono@seubarbeiro.demo', role: 'OWNER' },
    { name: 'Recepção (demonstração)', email: 'recepcao@seubarbeiro.demo', role: 'RECEPTION' },
    { name: 'Diego Martins', email: 'diego@seubarbeiro.demo', role: 'PROFESSIONAL', barberId: professional.id },
  ]
  const created = []
  await db.$transaction(async (tx) => {
    await tx.pushSubscription.deleteMany({})
    await tx.admin.deleteMany({})
    for (const a of accounts) {
      const pass = password()
      await tx.admin.create({ data: { ...a, passwordHash: await hashPassword(pass) } })
      created.push({ perfil: a.role, email: a.email, senha: pass })
    }
  })
  console.log(`Salão ${slug}: acessos anteriores apagados. Novos acessos de demonstração:`)
  console.table(created)
}

async function criar() {
  if ((await db.client.count()) || (await db.appointment.count()))
    throw new Error('O salão já tem clientes ou atendimentos. Use "limpar --sim" antes, se for o caso.')
  const now = new Date()
  const base = (process.env.PUBLIC_WEB_URL || 'https://seubarbeiro.impulsiodigital.com').replace(/\/$/, '')

  // ─── configurações ─────────────────────────────────────────────────────────
  const settings = {
    shop_description:
      'Barbearia clássica com atendimento moderno: cortes, barba na toalha quente, platinado e o clube de assinatura para você estar sempre na régua.',
    shop_phone: '(32) 3000-0000',
    shop_address: 'Rua das Tesouras, 123 · Centro · Juiz de Fora/MG',
    shop_instagram: '@seubarbeiro.demo',
    shop_logo: `${base}/icons/icon-512.png`,
    hours_monday: '09:00-20:00',
    hours_tuesday: '09:00-20:00',
    hours_wednesday: '09:00-20:00',
    hours_thursday: '09:00-20:00',
    hours_friday: '09:00-20:00',
    hours_saturday: '08:00-18:00',
    hours_sunday: '09:00-13:00',
    loyalty_enabled: 'true',
    loyalty_points_per_visit: '10',
    loyalty_redemption_points: '100',
    loyalty_redemption_value: '15',
    client_change_min_hours: '2',
  }
  for (const [key, value] of Object.entries(settings))
    await db.settings.upsert({ where: { key }, create: { key, value }, update: { value } })
  const hours = {
    0: [9 * 60, 13 * 60],
    1: [9 * 60, 20 * 60], 2: [9 * 60, 20 * 60], 3: [9 * 60, 20 * 60],
    4: [9 * 60, 20 * 60], 5: [9 * 60, 20 * 60], 6: [8 * 60, 18 * 60],
  }

  // ─── serviços, recursos e produtos ─────────────────────────────────────────
  const resource = await db.resource.create({ data: { name: 'Lavatório' } })
  void resource
  const svc = {}
  for (const s of [
    ['corte', 'Corte masculino', 45, 30, 0, 0, 25, 'Tesoura e máquina, lavagem e finalização.'],
    ['barba', 'Barba na toalha quente', 35, 30, 0, 0, 20, 'Navalha, toalha quente e hidratação.'],
    ['combo', 'Corte + barba', 70, 60, 0, 0, 25, 'O combo mais pedido da casa.'],
    ['pezinho', 'Pezinho e acabamento', 15, 15, 0, 0, 10, null],
    ['sobrancelha', 'Sobrancelha na navalha', 15, 15, 0, 0, null, null],
    ['infantil', 'Corte infantil', 35, 30, 0, 0, 30, 'Até 12 anos.'],
    ['platinado', 'Platinado', 180, 30, 40, 30, 40, 'Descoloração completa com matização.'],
    ['luzes', 'Luzes', 150, 30, 30, 20, 45, null],
    ['hidratacao', 'Hidratação capilar', 40, 20, 0, 0, null, null],
  ]) {
    const [key, name, price, durationMin, processingMin, finishingMin, returnDays, description] = s
    svc[key] = await db.service.create({
      data: { name, price, durationMin, processingMin, finishingMin, returnDays, description },
    })
  }
  const products = []
  for (const [name, price, cost, stock] of [
    ['Pomada modeladora efeito seco', 45, 19, 14],
    ['Óleo para barba 30 ml', 39, 15, 9],
    ['Shampoo antiqueda', 52, 24, 7],
    ['Balm hidratante para barba', 42, 17, 11],
    ['Cera capilar brilho', 38, 14, 3],
  ])
    products.push(await db.product.create({ data: { name, price, cost, stock } }))

  // ─── equipe e escalas ──────────────────────────────────────────────────────
  const team = [
    { name: 'Diego Martins', rate: 45, days: [1, 2, 3, 4, 5, 6], from: 9, to: 19, phone: '32900001001', all: true },
    { name: 'Rafael Souza', rate: 40, days: [1, 2, 3, 4, 5, 6, 0], from: 10, to: 20, phone: '32900001002', all: true },
    { name: 'Thiago Lima', rate: 40, days: [2, 3, 4, 5, 6, 0], from: 9, to: 18, phone: '32900001003', all: true },
    { name: 'Lucas Andrade', rate: 35, days: [2, 3, 4, 5, 6], from: 11, to: 20, phone: '32900001004', all: false },
  ]
  const barbers = []
  for (const t of team) {
    const b = await db.barber.create({
      data: {
        name: t.name,
        phone: t.phone,
        commissionRate: t.rate,
        serviceIds: t.all ? [] : [svc.corte.id, svc.pezinho.id, svc.sobrancelha.id, svc.infantil.id, svc.hidratacao.id],
      },
    })
    for (const weekday of t.days) {
      const [open, close] = hours[weekday]
      await db.workSchedule.create({
        data: {
          barberId: b.id,
          weekday,
          openMinute: Math.max(open, t.from * 60),
          closeMinute: Math.min(close, t.to * 60),
        },
      })
    }
    barbers.push({ ...b, ...t })
  }

  // ─── clientes ──────────────────────────────────────────────────────────────
  const first = ['João', 'Pedro', 'Lucas', 'Gabriel', 'Matheus', 'Rafael', 'Gustavo', 'Felipe', 'Bruno', 'Thiago',
    'André', 'Vinícius', 'Leonardo', 'Rodrigo', 'Carlos', 'Eduardo', 'Marcelo', 'Diego', 'Henrique', 'Caio',
    'Samuel', 'Daniel', 'Igor', 'Otávio', 'Renan', 'Murilo', 'Arthur', 'Davi', 'Enzo', 'Heitor']
  const last = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento',
    'Lima', 'Araújo', 'Fernandes', 'Carvalho', 'Gomes', 'Martins', 'Rocha', 'Ribeiro', 'Alves', 'Monteiro', 'Mendes']
  const clients = []
  const used = new Set()
  for (let i = 0; i < 72; i++) {
    let name
    do name = `${pick(first)} ${pick(last)}`
    while (used.has(name))
    used.add(name)
    clients.push(
      await db.client.create({
        data: {
          name,
          phone: `553290000${String(2000 + i).padStart(4, '0')}`,
          email: chance(0.35) ? `${name.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(' ', '.')}@exemplo.com` : undefined,
          birthDate: chance(0.5) ? new Date(1975 + Math.floor(rand() * 30), Math.floor(rand() * 12), 1 + Math.floor(rand() * 27)) : undefined,
          marketingConsent: chance(0.7),
          notes: chance(0.12) ? pick(['Prefere máquina 2 nas laterais.', 'Alergia a produto com álcool.', 'Gosta de café sem açúcar.', 'Vem sempre com o filho.']) : undefined,
          createdAt: day(-90 + Math.floor(rand() * 60)),
        },
      }),
    )
  }
  // Clientes "da casa" aparecem mais.
  const regulars = clients.slice(0, 30)
  // Os últimos clientes "sumiram" há mais de um mês: aparecem em Retorno e oportunidades.
  const lapsed = new Set(clients.slice(58).map((c) => c.id))
  const pickClient = (offset) => {
    for (;;) {
      const c = chance(0.65) ? pick(regulars) : pick(clients)
      if (offset < -35 || !lapsed.has(c.id)) return c
    }
  }
  // Os dados não mudam ao longo do dia: a manhã de hoje já aparece atendida.
  const statusNow = new Date(Math.max(now.getTime(), day(0, 11, 30).getTime()))

  // ─── planos e assinaturas ──────────────────────────────────────────────────
  const plans = {
    corte: await db.plan.create({ data: { name: 'Clube Corte', description: 'Até 4 cortes por mês.', price: 99.9, serviceIds: [svc.corte.id, svc.pezinho.id], usesPerCycle: 4 } }),
    combo: await db.plan.create({ data: { name: 'Clube Corte + Barba', description: 'Corte e barba até 4 vezes no mês.', price: 159.9, serviceIds: [svc.corte.id, svc.barba.id, svc.combo.id, svc.pezinho.id], usesPerCycle: 4 } }),
    vip: await db.plan.create({ data: { name: 'VIP Ilimitado', description: 'Corte, barba e sobrancelha sem limite.', price: 229.9, serviceIds: [svc.corte.id, svc.barba.id, svc.combo.id, svc.pezinho.id, svc.sobrancelha.id], usesPerCycle: null } }),
  }
  const payments = []
  const subs = []
  const subscribers = regulars.slice(0, 16)
  for (const [i, client] of subscribers.entries()) {
    const plan = i < 8 ? plans.corte : i < 13 ? plans.combo : plans.vip
    const status = i === 13 ? 'PAST_DUE' : i === 14 ? 'PENDING' : i === 15 ? 'CANCELLED' : 'ACTIVE'
    const months = 1 + (i % 3)
    const start = day(-30 * months - (i % 20))
    const sub = await db.subscription.create({
      data: { clientId: client.id, planId: plan.id, status, priceSnapshot: plan.price, createdAt: start },
    })
    let periodStart = start
    let periodEnd
    const periods = status === 'PENDING' ? 0 : status === 'PAST_DUE' ? months : months + 1
    for (let m = 0; m < periods; m++) {
      periodEnd = new Date(periodStart)
      periodEnd.setMonth(periodEnd.getMonth() + 1)
      const paymentId = randomUUID()
      const paidAt = addMin(periodStart, 60 * (10 + (m % 6)))
      if (paidAt < now) {
        payments.push({ id: paymentId, amount: plan.price, method: pick(['PIX', 'PIX', 'PIX', 'CASH', 'CREDIT_CARD']), paidAt, notes: `Assinatura ${plan.name} · ${client.name}` })
        await db.subscriptionCharge.create({ data: { subscriptionId: sub.id, periodStart, periodEnd, amount: plan.price, status: 'PAID', paidAt, paymentId } })
      }
      if (periodEnd > now) break
      periodStart = periodEnd
    }
    if (status === 'PENDING' || status === 'PAST_DUE') {
      const pStart = status === 'PENDING' ? day(-1) : periodStart
      const pEnd = new Date(pStart)
      pEnd.setMonth(pEnd.getMonth() + 1)
      await db.subscriptionCharge.create({ data: { subscriptionId: sub.id, periodStart: pStart, periodEnd: pEnd, amount: plan.price, status: 'PENDING' } })
    }
    const lastPaid = await db.subscriptionCharge.findFirst({ where: { subscriptionId: sub.id, status: 'PAID' }, orderBy: { periodStart: 'desc' } })
    await db.subscription.update({
      where: { id: sub.id },
      data: {
        currentPeriodStart: lastPaid?.periodStart ?? null,
        currentPeriodEnd: lastPaid?.periodEnd ?? null,
        ...(status === 'CANCELLED' ? { cancelledAt: day(-6) } : {}),
      },
    })
    subs.push({ ...sub, plan, clientId: client.id, currentPeriodStart: lastPaid?.periodStart, currentPeriodEnd: lastPaid?.periodEnd })
  }
  const subUses = new Map()

  // ─── agenda: 60 dias para trás, 14 para frente ─────────────────────────────
  const serviceMix = [
    [['corte'], 34], [['combo'], 22], [['barba'], 10], [['corte', 'sobrancelha'], 6], [['infantil'], 6],
    [['pezinho'], 4], [['platinado'], 3], [['luzes'], 2], [['corte', 'hidratacao'], 4], [['sobrancelha'], 3],
  ]
  const appointments = []
  const apptServices = []
  const segments = []
  const items = []
  const blocks = []
  const busyClients = new Map()
  for (let offset = -60; offset <= 14; offset++) {
    const date = day(offset)
    const weekday = date.getDay()
    for (const b of barbers) {
      if (!b.days.includes(weekday)) continue
      const [shopOpen, shopClose] = hours[weekday]
      const open = Math.max(shopOpen, b.from * 60)
      const close = Math.min(shopClose, b.to * 60)
      const lunch = weekday === 0 ? null : 12 * 60 + (barbers.indexOf(b) % 2) * 60
      if (lunch !== null && offset >= 0 && offset <= 3)
        blocks.push({ id: randomUUID(), barberId: b.id, startsAt: day(offset, 0, lunch), endsAt: day(offset, 0, lunch + 60), reason: 'Almoço' })
      const fill = offset < 0 ? 0.74 : offset === 0 ? 0.85 : Math.max(0.12, 0.7 - offset * 0.045)
      let cursor = open
      while (cursor < close) {
        if (lunch !== null && cursor >= lunch && cursor < lunch + 60) {
          cursor = lunch + 60
          continue
        }
        let keys = weighted(serviceMix)
        if (!b.all && keys.some((k) => ['barba', 'combo', 'platinado', 'luzes'].includes(k))) keys = ['corte']
        const list = keys.map((k) => svc[k])
        const total = list.reduce((s, x) => s + x.durationMin + x.processingMin + x.finishingMin, 0)
        if (cursor + total > close || (lunch !== null && cursor < lunch && cursor + total > lunch)) {
          cursor += 15
          continue
        }
        if (!chance(fill)) {
          cursor += pick([15, 30, 30, 45])
          continue
        }
        const startsAt = day(offset, 0, cursor)
        const endsAt = addMin(startsAt, total)
        let client = pickClient(offset)
        const key = `${offset}`
        const seen = busyClients.get(key) ?? new Set()
        for (let tries = 0; seen.has(client.id) && tries < 10; tries++) client = pickClient(offset)
        seen.add(client.id)
        busyClients.set(key, seen)
        let status
        const ref = offset === 0 ? statusNow : now
        if (endsAt < ref) status = offset === 0 ? 'COMPLETED' : weighted([['COMPLETED', 88], ['NO_SHOW', 5], ['CANCELLED', 7]])
        else if (startsAt <= ref) status = 'IN_PROGRESS'
        else status = offset <= 1 ? weighted([['CONFIRMED', 60], ['SCHEDULED', 35], ['CANCELLED', 5]]) : weighted([['SCHEDULED', 72], ['CONFIRMED', 24], ['CANCELLED', 4]])
        const totalPrice = list.reduce((s, x) => s + Number(x.price), 0)
        const discount = status === 'COMPLETED' && chance(0.06) ? money(totalPrice * 0.1) : 0
        const id = randomUUID()
        const a = {
          id, clientId: client.id, barberId: b.id, startsAt, endsAt, status, totalPrice, discount,
          commissionRateSnapshot: b.rate,
          source: weighted([['ONLINE', 42], ['DIRECT', 55], ['REACTIVATION', 3]]),
          loyaltyCredited: status === 'COMPLETED',
          manageToken: ['SCHEDULED', 'CONFIRMED'].includes(status) ? token() : null,
          subscriptionId: null, subscriptionCovered: 0,
          createdAt: addMin(startsAt, -60 * 24 * (1 + Math.floor(rand() * 6))),
          notes: status === 'CANCELLED' ? pick(['Cliente pediu para remarcar.', 'Imprevisto no trabalho.', null]) : null,
        }
        // Assinante usa o plano nos serviços cobertos.
        const sub = subs.find((s) => s.clientId === client.id && s.currentPeriodStart && s.currentPeriodStart <= startsAt && s.currentPeriodEnd > startsAt)
        if (sub && status !== 'CANCELLED' && status !== 'NO_SHOW') {
          const covered = list.filter((x) => sub.plan.serviceIds.includes(x.id)).reduce((s, x) => s + Number(x.price), 0)
          const uses = subUses.get(sub.id + sub.currentPeriodStart) ?? 0
          if (covered && (sub.plan.usesPerCycle === null || uses < sub.plan.usesPerCycle)) {
            a.subscriptionId = sub.id
            a.subscriptionCovered = Math.min(covered, totalPrice - discount)
            subUses.set(sub.id + sub.currentPeriodStart, uses + 1)
          }
        }
        appointments.push(a)
        let segCursor = startsAt
        for (const x of list) {
          apptServices.push({ id: randomUUID(), appointmentId: id, serviceId: x.id, priceSnapshot: x.price, durationSnapshot: x.durationMin + x.processingMin + x.finishingMin, processingSnapshot: x.processingMin, finishingSnapshot: x.finishingMin })
          for (const [kind, minutes] of [['ACTIVE', x.durationMin], ['PROCESSING', x.processingMin], ['FINISHING', x.finishingMin]]) {
            if (!minutes) continue
            segments.push({ id: randomUUID(), appointmentId: id, barberId: b.id, startsAt: segCursor, endsAt: addMin(segCursor, minutes), kind })
            segCursor = addMin(segCursor, minutes)
          }
        }
        // Venda de produto em parte das comandas.
        let itemsTotal = 0
        if (['COMPLETED', 'IN_PROGRESS'].includes(status) && chance(0.13)) {
          const p = pick(products)
          items.push({ id: randomUUID(), appointmentId: id, productId: p.id, description: p.name, quantity: 1, unitPrice: p.price, unitCost: p.cost })
          itemsTotal = Number(p.price)
        }
        if (status === 'COMPLETED') {
          const due = money(totalPrice - discount - a.subscriptionCovered + itemsTotal)
          // Uma pequena parte fica com saldo em aberto para aparecer nas pendências.
          if (due > 0 && !(offset > -10 && chance(0.04))) {
            const method = weighted([['PIX', 45], ['CASH', 20], ['DEBIT_CARD', 20], ['CREDIT_CARD', 15]])
            payments.push({ id: randomUUID(), amount: due, method, paidAt: addMin(endsAt, 2), appointmentId: id })
          }
        }
        cursor += total + pick([0, 0, 0, 15])
      }
    }
  }
  // Retornos: parte dos atendimentos futuros vira retorno de um concluído do mesmo cliente.
  const completedBy = new Map()
  for (const a of appointments) if (a.status === 'COMPLETED') completedBy.set(a.clientId, a.id)
  for (const a of appointments)
    if (a.startsAt > now && ['SCHEDULED', 'CONFIRMED'].includes(a.status) && completedBy.has(a.clientId) && chance(0.25))
      a.returnOfId = completedBy.get(a.clientId)

  await db.appointment.createMany({ data: appointments })
  await db.appointmentService.createMany({ data: apptServices })
  await db.appointmentSegment.createMany({ data: segments })
  await db.orderItem.createMany({ data: items })
  await db.scheduleBlock.createMany({ data: blocks })
  await db.scheduleBlock.create({
    data: { barberId: barbers[2].id, startsAt: day(5, 14), endsAt: day(5, 16), reason: 'Consulta médica' },
  })
  // Estoque inicial já considera as reposições do período (a cera fica baixa de propósito).

  // ─── fidelidade ────────────────────────────────────────────────────────────
  const visits = new Map()
  for (const a of appointments) if (a.status === 'COMPLETED') visits.set(a.clientId, (visits.get(a.clientId) ?? 0) + 1)
  for (const [clientId, count] of visits) {
    const redeemed = count >= 12 ? 100 : 0
    await db.loyaltyCard.create({
      data: { clientId, visitCount: count, pointsEarned: count * 10, pointsRedeemed: redeemed, pointsBalance: count * 10 - redeemed },
    })
  }

  // ─── despesas ──────────────────────────────────────────────────────────────
  const expenses = []
  for (let m = -2; m <= 1; m++) {
    const month = new Date(now.getFullYear(), now.getMonth() + m, 1)
    const at = (d) => new Date(month.getFullYear(), month.getMonth(), d, 10)
    for (const [description, amount, category, dueDay] of [
      ['Aluguel do salão', 2800, 'RENT', 5],
      ['Energia elétrica', 340 + Math.round(rand() * 80), 'UTILITIES', 12],
      ['Água', 110 + Math.round(rand() * 30), 'UTILITIES', 15],
      ['Internet e telefone', 149.9, 'UTILITIES', 10],
      ['Lâminas, toalhas e descartáveis', 420 + Math.round(rand() * 200), 'SUPPLIES', 8],
      ['Reposição de produtos para revenda', 600 + Math.round(rand() * 250), 'SUPPLIES', 18],
      ['Anúncios no Instagram', 300, 'MARKETING', 20],
      ['Sistema e maquininha', 129.9, 'OTHER', 22],
    ]) {
      const dueDate = at(dueDay)
      const paid = dueDate < now && !(m === 0 && description === 'Água')
      expenses.push({ description, amount, category, dueDate, status: paid ? 'PAID' : 'PENDING', paidAt: paid ? dueDate : null })
    }
  }
  expenses.push({ description: 'Manutenção da cadeira 2', amount: 280, category: 'EQUIPMENT', dueDate: day(-12, 10), status: 'PAID', paidAt: day(-12, 10) })
  await db.expense.createMany({ data: expenses })

  // ─── comissões do mês anterior, com vale descontado ───────────────────────
  const prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevTo = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
  for (const b of barbers) {
    const done = appointments.filter((a) => a.barberId === b.id && a.status === 'COMPLETED' && a.startsAt >= prevFrom && a.startsAt <= prevTo)
    if (!done.length) continue
    const revenue = done.reduce((s, a) => s + a.totalPrice - a.discount, 0)
    const commission = money((revenue * b.rate) / 100)
    const paidAt = new Date(now.getFullYear(), now.getMonth(), 0, 19)
    const advance = b === barbers[1] ? 200 : 0
    const cp = await db.commissionPayment.create({
      data: { barberId: b.id, periodFrom: prevFrom, periodTo: prevTo, totalRevenue: revenue, commissionAmount: commission, commissionRate: b.rate, advancesDeducted: advance, paidAt, notes: 'Pago por Pix' },
    })
    if (advance) {
      const given = new Date(now.getFullYear(), now.getMonth() - 1, 15, 19)
      const adv = await db.barberAdvance.create({ data: { barberId: b.id, amount: advance, notes: 'Adiantamento da quinzena', givenAt: given, settledInId: cp.id } })
      await db.expense.create({ data: { description: `Vale: ${b.name}`, amount: advance, category: 'SALARY', dueDate: given, paidAt: given, status: 'PAID', notes: `Vale ${adv.id}` } })
    }
    await db.expense.create({
      data: { description: `Comissão: ${b.name}`, amount: money(commission - advance), category: 'SALARY', dueDate: paidAt, paidAt, status: 'PAID', notes: `Pagamento de comissão ${cp.id}` },
    })
  }
  for (const [b, amount, offset, note] of [[barbers[3], 100, -8, 'Adiantamento'], [barbers[2], 80, -3, 'Vale para combustível']]) {
    const given = day(offset, 19)
    const adv = await db.barberAdvance.create({ data: { barberId: b.id, amount, notes: note, givenAt: given } })
    await db.expense.create({ data: { description: `Vale: ${b.name}`, amount, category: 'SALARY', dueDate: given, paidAt: given, status: 'PAID', notes: `Vale ${adv.id}` } })
  }

  await db.payment.createMany({ data: payments })

  // ─── caixa: fechamentos dos últimos dias de funcionamento ─────────────────
  const cashPayments = payments.filter((p) => p.method === 'CASH')
  let closed = 0
  for (let offset = -1; offset >= -14 && closed < 8; offset--) {
    const openedAt = day(offset, 8, 40)
    const closedAt = day(offset, 20, 15)
    const cashIn = cashPayments.filter((p) => p.paidAt >= openedAt && p.paidAt <= closedAt).reduce((s, p) => s + Number(p.amount), 0)
    if (!cashIn) continue
    const session = await db.cashSession.create({ data: { openedAt, openedById: 'demo', openingAmount: 150, closedAt } })
    let withdrawals = 0
    if (chance(0.6)) {
      const amount = pick([40, 60, 85, 120])
      withdrawals += amount
      await db.cashMovement.create({ data: { sessionId: session.id, kind: 'WITHDRAWAL', amount, reason: pick(['Compra de lâminas', 'Café e água', 'Depósito no banco', 'Motoboy']), createdAt: day(offset, 15, 20) } })
    }
    const expected = money(150 + cashIn - withdrawals)
    const diff = weighted([[0, 70], [-5, 10], [2, 10], [-10, 5], [-0.5, 5]])
    await db.cashSession.update({
      where: { id: session.id },
      data: { closedById: 'demo', expectedAmount: expected, countedAmount: money(expected + diff), notes: diff < 0 ? 'Conferido no fechamento' : null },
    })
    closed++
  }

  // ─── relacionamento: lista de espera, convites e fichas técnicas ───────────
  for (const [offset, client] of [[1, clients[40]], [2, clients[41]], [3, clients[42]]])
    await db.waitlistEntry.create({
      data: { clientId: client.id, barberId: offset === 2 ? barbers[0].id : null, serviceIds: [svc.corte.id], from: day(offset, 0, 0), to: day(offset, 23, 59) },
    })
  const late = clients.slice(50, 56)
  for (const [i, client] of late.entries())
    await db.outreach.create({ data: { clientId: client.id, serviceId: svc.corte.id, token: token(), createdAt: day(-(i + 1), 10) } })
  for (const client of clients.slice(0, 4))
    await db.technicalRecord.create({
      data: {
        clientId: client.id,
        authorId: 'demo',
        formula: 'Pó descolorante + OX 30 vol (1:2), pausa de 40 min. Matizador pérola 10 min.',
        products: 'Pó descolorante azul, matizador pérola, máscara reconstrutora',
        preferences: 'Prefere tom mais frio; laterais na máquina 1.',
        notes: 'Couro cabeludo sensível: aplicar protetor antes.',
        createdAt: day(-20 + clients.indexOf(client), 15),
      },
    })

  const counts = {
    profissionais: barbers.length,
    servicos: Object.keys(svc).length,
    clientes: clients.length,
    atendimentos: appointments.length,
    recebimentos: payments.length,
    despesas: await db.expense.count(),
    assinaturas: subs.length,
    caixasFechados: closed,
  }
  console.log(`Salão ${slug}: demonstração criada`, counts)
}

;(mode === 'criar' ? criar() : mode === 'limpar' ? limpar() : mode === 'acessos' ? acessos() : Promise.reject(new Error('Use: criar | limpar --sim | acessos --sim')))
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(() => Promise.all([...salons.values()].map((s) => s.db.$disconnect())))
