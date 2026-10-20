import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd/MM/yyyy', { locale: ptBR })
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'HH:mm')
}

/** Dia de hoje como "AAAA-MM-DD" no fuso do aparelho (toISOString daria o dia em UTC). */
export function todayKey(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Dia ("AAAA-MM-DD") de uma data da API, no fuso do aparelho. */
export function dayKeyOf(date: string | Date): string {
  return format(typeof date === 'string' ? parseISO(date) : date, 'yyyy-MM-dd')
}

/** "AAAA-MM-DD" como data local; new Date("2026-10-09") cairia no dia 8 no Brasil. */
export function parseDayKey(day: string): Date {
  return parseISO(day)
}
