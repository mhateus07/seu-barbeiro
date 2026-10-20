import { AppointmentStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { dayKey, parseDay } from '../../utils/dates'
import { listCashEntries } from '../finances/finances.service'

export async function getDashboardSummary(date?: string) {
  const targetDate = date ? parseDay(date) : new Date()
  const start = new Date(targetDate)
  start.setHours(0, 0, 0, 0)
  const end = new Date(targetDate)
  end.setHours(23, 59, 59, 999)

  const [appointments, upcoming, cashEntries] = await Promise.all([
    prisma.appointment.findMany({
      where: { startsAt: { gte: start, lte: end } },
      include: {
        client: { select: { id: true, name: true } },
        barber: { select: { id: true, name: true } },
        services: { include: { service: { select: { name: true } } } },
      },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.appointment.findMany({
      where: {
        startsAt: { gte: new Date() },
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
      },
      include: {
        client: { select: { id: true, name: true } },
        barber: { select: { id: true, name: true } },
        services: { include: { service: { select: { name: true } } } },
      },
      orderBy: { startsAt: 'asc' },
      take: 5,
    }),
    listCashEntries(start, end),
  ])

  const completed = appointments.filter((a) => a.status === AppointmentStatus.COMPLETED)
  const cancelled = appointments.filter((a) => a.status === AppointmentStatus.CANCELLED)
  const noShow = appointments.filter((a) => a.status === AppointmentStatus.NO_SHOW)
  // Receita = dinheiro que entrou no dia, igual ao financeiro (já com
  // desconto, assinatura, produtos e estornos), não o preço de tabela.
  const revenueToday = cashEntries.reduce((sum, p) => sum + p.amount, 0)

  return {
    totalAppointments: appointments.length,
    completed: completed.length,
    cancelled: cancelled.length,
    noShow: noShow.length,
    revenueToday,
    upcomingToday: upcoming,
  }
}

export async function getDashboardStats(from?: string, to?: string) {
  const startDate = from ? parseDay(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  startDate.setHours(0, 0, 0, 0)
  const endDate = to ? parseDay(to, true) : new Date()
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()))
    throw new Error('Período inválido')
  // Período de no máximo um ano: o gráfico monta um ponto por dia.
  if (endDate.getTime() - startDate.getTime() > 366 * 86400000)
    throw new Error('Escolha um período de até um ano')

  const [appointments, cashEntries] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        startsAt: { gte: startDate, lte: endDate },
        status: AppointmentStatus.COMPLETED,
      },
      include: {
        services: { include: { service: { select: { id: true, name: true } } } },
        barber: { select: { id: true, name: true } },
      },
    }),
    listCashEntries(startDate, endDate),
  ])

  // Receita por dia, com todos os dias do período (dia sem entrada fica com zero)
  const revenueByDay: Record<string, number> = {}
  for (const day = new Date(startDate); day <= endDate; day.setDate(day.getDate() + 1))
    revenueByDay[dayKey(day)] = 0
  cashEntries.forEach((p) => {
    const day = dayKey(p.paidAt)
    revenueByDay[day] = (revenueByDay[day] || 0) + p.amount
  })

  // Top serviços
  const serviceCount: Record<string, { name: string; count: number; revenue: number }> = {}
  appointments.forEach((a) => {
    a.services.forEach((as) => {
      const id = as.service.id
      if (!serviceCount[id]) serviceCount[id] = { name: as.service.name, count: 0, revenue: 0 }
      serviceCount[id].count++
      serviceCount[id].revenue += Number(as.priceSnapshot)
    })
  })

  // Top barbeiros
  const barberCount: Record<string, { name: string; count: number }> = {}
  appointments.forEach((a) => {
    const id = a.barber.id
    if (!barberCount[id]) barberCount[id] = { name: a.barber.name, count: 0 }
    barberCount[id].count++
  })

  const allAppointments = await prisma.appointment.groupBy({
    by: ['status'],
    where: { startsAt: { gte: startDate, lte: endDate } },
    _count: { status: true },
  })

  return {
    revenueByDay: Object.entries(revenueByDay).map(([date, total]) => ({ date, total })),
    topServices: Object.values(serviceCount).sort((a, b) => b.count - a.count).slice(0, 5),
    topBarbers: Object.values(barberCount).sort((a, b) => b.count - a.count),
    appointmentsByStatus: allAppointments.map((g) => ({
      status: g.status,
      count: g._count.status,
    })),
  }
}
