import { normalizePhone } from '../../utils/phone'
import { prisma } from '../../lib/prisma'
import { parseDay } from '../../utils/dates'
import { CreateClientInput, UpdateClientInput } from './clients.schema'

export async function listClients(search?: string, page = 1, limit = 20) {
  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search } },
        ],
      }
    : {}

  const [data, total] = await Promise.all([
    prisma.client.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: 'asc' },
    }),
    prisma.client.count({ where }),
  ])

  return { data, total, page, limit }
}

export async function getClientById(id: string) {
  const client = await prisma.client.findUnique({ where: { id } })
  if (!client) throw new Error('Cliente não encontrado')
  return client
}

export async function createClient(input: CreateClientInput) {
  return prisma.client.create({
    data: {
      ...input,
      ...(input.phone ? { phone: normalizePhone(input.phone) } : {}),
      birthDate: input.birthDate ? parseDay(input.birthDate) : undefined,
      email: input.email || undefined,
    },
  })
}

export async function updateClient(id: string, input: UpdateClientInput) {
  await getClientById(id)
  return prisma.client.update({
    where: { id },
    data: {
      ...input,
      ...(input.phone ? { phone: normalizePhone(input.phone) } : {}),
      birthDate: input.birthDate ? parseDay(input.birthDate) : undefined,
      email: input.email || undefined,
    },
  })
}

export async function deleteClient(id: string) {
  await getClientById(id)
  const hasAppointments = await prisma.appointment.count({
    where: { clientId: id },
  })
  if (hasAppointments > 0)
    throw new Error('Cliente possui agendamentos e não pode ser excluído')
  return prisma.client.delete({ where: { id } })
}

export async function getClientAppointments(id: string) {
  await getClientById(id)
  return prisma.appointment.findMany({
    where: { clientId: id },
    include: {
      barber: { select: { id: true, name: true } },
      services: { include: { service: { select: { id: true, name: true } } } },
    },
    orderBy: { startsAt: 'desc' },
  })
}

export async function getClientLoyalty(clientId: string) {
  await getClientById(clientId)
  const card = await prisma.loyaltyCard.findUnique({ where: { clientId } })
  if (!card) {
    return {
      clientId,
      visitCount: 0,
      pointsBalance: 0,
      pointsEarned: 0,
      pointsRedeemed: 0,
    }
  }
  return card
}

export async function redeemLoyaltyPoints(clientId: string, points: number) {
  await getClientById(clientId)

  if (!Number.isInteger(points) || points <= 0)
    throw new Error('Pontos devem ser inteiros positivos')
  const changed = await prisma.loyaltyCard.updateMany({
    where: { clientId, pointsBalance: { gte: points } },
    data: {
      pointsBalance: { decrement: points },
      pointsRedeemed: { increment: points },
    },
  })
  if (!changed.count) throw new Error('Saldo insuficiente')
  return prisma.loyaltyCard.findUnique({ where: { clientId } })
}

export async function listClientsWithLoyalty(
  search?: string,
  page = 1,
  limit = 20,
) {
  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search } },
        ],
      }
    : {}

  const [data, total] = await Promise.all([
    prisma.client.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: 'asc' },
      include: { loyaltyCard: true },
    }),
    prisma.client.count({ where }),
  ])

  return { data, total, page, limit }
}

// ─── LGPD: cópia dos dados e anonimização ────────────────────────────────────

const OPEN_APPOINTMENT = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] as const
const OPEN_SUBSCRIPTION = ['PENDING', 'ACTIVE', 'PAST_DUE']

/** Tudo o que o salão guarda sobre a pessoa, para entregar a ela quando pedir. */
export async function exportClientData(id: string) {
  const client = await getClientById(id)
  const [appointments, records, subscriptions, loyalty, waitlist, messages] = await Promise.all([
    prisma.appointment.findMany({
      where: { clientId: id },
      orderBy: { startsAt: 'desc' },
      include: {
        barber: { select: { name: true } },
        services: { include: { service: { select: { name: true } } } },
        payments: { select: { method: true, amount: true, createdAt: true } },
      },
    }),
    prisma.technicalRecord.findMany({ where: { clientId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.subscription.findMany({
      where: { clientId: id },
      include: { plan: { select: { name: true } } },
    }),
    prisma.loyaltyCard.findUnique({ where: { clientId: id } }),
    prisma.waitlistEntry.findMany({ where: { clientId: id } }),
    prisma.notificationLog.findMany({
      where: { clientId: id },
      orderBy: { createdAt: 'desc' },
      select: { type: true, phone: true, message: true, status: true, sentAt: true, createdAt: true },
    }),
  ])
  return {
    geradoEm: new Date().toISOString(),
    cadastro: {
      nome: client.name,
      telefone: client.phone,
      email: client.email,
      nascimento: client.birthDate,
      observacoes: client.notes,
      autorizaContato: client.marketingConsent,
      criadoEm: client.createdAt,
      atualizadoEm: client.updatedAt,
    },
    atendimentos: appointments.map((a) => ({
      inicio: a.startsAt,
      fim: a.endsAt,
      situacao: a.status,
      profissional: a.barber.name,
      servicos: a.services.map((s) => s.service.name),
      valor: Number(a.totalPrice),
      observacoes: a.notes,
      pagamentos: a.payments.map((p) => ({ forma: p.method, valor: Number(p.amount), em: p.createdAt })),
    })),
    fichasTecnicas: records.map((r) => ({
      formula: r.formula,
      produtos: r.products,
      preferencias: r.preferences,
      observacoes: r.notes,
      fotos: r.photoUrls,
      autorizaFotos: r.photoConsent,
      criadaEm: r.createdAt,
    })),
    assinaturas: subscriptions.map((s) => ({
      plano: s.plan.name,
      situacao: s.status,
      valor: Number(s.priceSnapshot),
      inicio: s.currentPeriodStart,
      fim: s.currentPeriodEnd,
      canceladaEm: s.cancelledAt,
    })),
    fidelidade: loyalty ? { visitas: loyalty.visitCount, pontos: loyalty.pointsBalance } : null,
    listaDeEspera: waitlist.map((w) => ({ de: w.from, ate: w.to, situacao: w.status })),
    mensagens: messages,
  }
}

/**
 * Atende ao pedido de exclusão sem apagar o financeiro: o cadastro perde nome,
 * telefone, e-mail, nascimento e observações; fichas, mensagens, lista de
 * espera e campanhas da pessoa são apagadas. Atendimentos e pagamentos ficam,
 * ligados a "Cliente removido", porque o caixa e as comissões dependem deles.
 */
export async function anonymizeClient(id: string) {
  await getClientById(id)
  const [open, subscriptions] = await Promise.all([
    prisma.appointment.count({
      where: { clientId: id, status: { in: [...OPEN_APPOINTMENT] }, startsAt: { gt: new Date() } },
    }),
    prisma.subscription.count({ where: { clientId: id, status: { in: OPEN_SUBSCRIPTION } } }),
  ])
  if (open) throw new Error('Cancele os horários marcados deste cliente antes de remover os dados')
  if (subscriptions) throw new Error('Cancele a assinatura deste cliente antes de remover os dados')
  await prisma.$transaction([
    prisma.technicalRecord.deleteMany({ where: { clientId: id } }),
    prisma.waitlistEntry.deleteMany({ where: { clientId: id } }),
    prisma.outreach.deleteMany({ where: { clientId: id } }),
    prisma.notificationLog.deleteMany({ where: { clientId: id } }),
    prisma.appointment.updateMany({
      where: { clientId: id },
      data: { notes: null, manageToken: null },
    }),
    prisma.client.update({
      where: { id },
      data: {
        name: 'Cliente removido',
        phone: `removido-${id}`,
        email: null,
        birthDate: null,
        notes: null,
        marketingConsent: false,
      },
    }),
  ])
}
