import { useEffect, useRef, useState } from 'react'
import type { Agenda, Appointment } from './OperationsPage'
import { barberColor, statusLabels, statusStyles } from './agendaTheme'

/** Altura de um minuto na grade, em pixels. */
const PX = 1.6
const SNAP = 15

export type AgendaColumn = {
  key: string
  /** Dia da coluna, no formato yyyy-MM-dd. */
  date: string
  /** Profissional da coluna; ausente na semana com todos os profissionais. */
  barberId?: string
  /** Filtro de profissional aplicado na visão semanal. */
  barberFilter?: string
  title: string
  subtitle?: string
  today?: boolean
}

export type SlotTarget = { barberId?: string; startsAt: string }

const time = (value: string) =>
  new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
const localDay = (value: string | Date) =>
  new Date(value).toLocaleDateString('sv-SE')
const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
const minuteOfDay = (value: string | Date, date: string) =>
  Math.max(
    0,
    Math.min(
      1440,
      (new Date(value).getTime() - new Date(`${date}T00:00:00`).getTime()) /
        60000,
    ),
  )
const movable = (a: Appointment) => ['SCHEDULED', 'CONFIRMED'].includes(a.status)

type Piece = {
  id: string
  appointment: Appointment
  kind: string
  top: number
  bottom: number
  lane: number
  lanes: number
}

/** Distribui atendimentos sobrepostos em faixas lado a lado. */
function layout(pieces: Omit<Piece, 'lane' | 'lanes'>[]): Piece[] {
  const sorted = [...pieces].sort((a, b) => a.top - b.top || b.bottom - a.bottom)
  const result: Piece[] = []
  let cluster: Piece[] = [],
    lanesEnd: number[] = [],
    clusterEnd = -1
  const flush = () => {
    cluster.forEach((p) => (p.lanes = lanesEnd.length))
    cluster = []
    lanesEnd = []
  }
  for (const piece of sorted) {
    if (piece.top >= clusterEnd) flush()
    let lane = lanesEnd.findIndex((end) => end <= piece.top)
    if (lane < 0) lane = lanesEnd.push(piece.bottom) - 1
    else lanesEnd[lane] = piece.bottom
    const placed = { ...piece, lane, lanes: 1 }
    cluster.push(placed)
    result.push(placed)
    clusterEnd = Math.max(clusterEnd, piece.bottom)
  }
  flush()
  return result
}

function useNowMinute() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now.getHours() * 60 + now.getMinutes()
}

export function AgendaTimeline({
  agenda,
  columns,
  showBarber,
  select,
  removeBlock,
  move,
  create,
  canEdit,
  canManageBlocks = canEdit,
  ready,
}: {
  agenda: Agenda
  columns: AgendaColumn[]
  /** Mostra o profissional nos cartões (semana com todos). */
  showBarber: boolean
  select: (appointment: Appointment) => void
  removeBlock: (id: string) => void
  move: (appointment: Appointment, target: SlotTarget) => void
  create: (target: SlotTarget) => void
  canEdit: boolean
  /** O profissional também libera os próprios bloqueios. */
  canManageBlocks?: boolean
  /** Falso enquanto a grade mostra dados do período anterior. */
  ready: boolean
}) {
  const nowMinute = useNowMinute()
  const scroller = useRef<HTMLDivElement>(null)
  const drag = useRef<{ appointment: Appointment; grab: number } | null>(null)
  const [preview, setPreview] = useState<{
    column: string
    minute: number
    duration: number
  } | null>(null)

  const active = agenda.appointments.filter(
    (a) => !['CANCELLED', 'NO_SHOW'].includes(a.status),
  )
  const inColumn = <T extends { barberId?: string; startsAt: string }>(
    item: T & { barber?: { id: string } },
    column: AgendaColumn,
  ) => {
    const barberId = item.barber?.id ?? item.barberId
    if (column.barberId && barberId !== column.barberId) return false
    if (column.barberFilter && barberId !== column.barberFilter) return false
    return localDay(item.startsAt) === column.date
  }

  const visible = columns.flatMap((c) =>
    active.filter((a) => inColumn(a, c)).map((a) => ({ a, date: c.date })),
  )
  const start = Math.min(
    8 * 60,
    ...visible.map(({ a, date }) => Math.floor(minuteOfDay(a.startsAt, date) / 60) * 60),
  )
  const end = Math.max(
    20 * 60,
    ...visible.map(({ a, date }) => Math.ceil(minuteOfDay(a.endsAt, date) / 60) * 60),
  )
  const height = (end - start) * PX
  const hours = Array.from({ length: (end - start) / 60 }, (_, i) => start + i * 60)
  const minColumn = columns.length > 4 ? 104 : 220
  const grid = {
    gridTemplateColumns: `56px repeat(${columns.length}, minmax(${minColumn}px, 1fr))`,
  }

  // Ao abrir um período, rola até o primeiro atendimento (ou o horário atual),
  // uma única vez e só depois que os dados desse período chegaram.
  const periodKey = columns.map((c) => c.key).join()
  const scrolledFor = useRef('')
  useEffect(() => {
    const el = scroller.current
    if (!el || !ready || scrolledFor.current === periodKey) return
    scrolledFor.current = periodKey
    const first = visible.length
      ? Math.min(...visible.map(({ a, date }) => minuteOfDay(a.startsAt, date)))
      : nowMinute
    el.scrollTop = Math.max(0, (Math.min(first, nowMinute) - start - 45) * PX)
    // Só no carregamento do período.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey, ready])

  const pointerMinute = (event: React.MouseEvent | React.DragEvent, offset = 0) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const raw = start + (event.clientY - rect.top) / PX - offset
    return Math.max(start, Math.min(end - SNAP, Math.round(raw / SNAP) * SNAP))
  }

  if (!agenda.barbers.length)
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
        <p className="font-display text-lg font-semibold text-zinc-800">
          Nenhum profissional cadastrado
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          Cadastre um profissional em Equipe e serviços para começar a agenda.
        </p>
      </div>
    )

  return (
    <div
      ref={scroller}
      className="relative max-h-[calc(100dvh-260px)] min-h-[420px] overflow-auto rounded-2xl border border-zinc-200 bg-white"
      aria-label="Grade de horários"
    >
      <div
        className="sticky top-0 z-30 grid border-b border-zinc-200 bg-white"
        style={grid}
      >
        <div className="sticky left-0 z-10 bg-white" />
        {columns.map((c) => {
          const count = active.filter((a) => inColumn(a, c)).length
          return (
            <div
              key={c.key}
              className={`flex items-center gap-2.5 border-l border-zinc-100 px-3 py-2.5 ${c.barberId ? '' : 'flex-col justify-center gap-0.5 px-1 text-center'}`}
            >
              {c.barberId ? (
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                  style={{ background: barberColor(agenda, c.barberId) }}
                >
                  {c.title.slice(0, 1).toUpperCase()}
                </span>
              ) : (
                <>
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wide ${c.today ? 'text-zinc-900' : 'text-zinc-500'}`}
                  >
                    {c.title}
                  </span>
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-full font-display text-base font-bold ${
                      c.today ? 'bg-amber-500 text-white' : 'text-zinc-900'
                    }`}
                  >
                    {c.subtitle}
                  </span>
                </>
              )}
              <div className="min-w-0 leading-tight">
                {c.barberId && (
                  <p className="truncate text-sm font-semibold text-zinc-900">
                    {c.title}
                  </p>
                )}
                <p className="truncate text-[11px] text-zinc-500">
                  {count
                    ? `${count} atendimento${count > 1 ? 's' : ''}`
                    : 'Livre'}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid" style={grid}>
        <div className="sticky left-0 z-20 bg-white" style={{ height }}>
          {hours.map((h) => (
            <span
              key={h}
              className="hora absolute right-2 -translate-y-1/2 text-[11px] text-zinc-500"
              style={{ top: (h - start) * PX }}
            >
              {h === start ? '' : hhmm(h)}
            </span>
          ))}
        </div>

        {columns.map((c) => {
          const barberId = c.barberId ?? c.barberFilter
          const weekday = new Date(`${c.date}T12:00:00`).getDay()
          const schedule = barberId
            ? agenda.schedules.find(
                (s) => s.barberId === barberId && s.weekday === weekday,
              )
            : undefined
          const closed = schedule
            ? [
                [start, Math.max(start, schedule.openMinute)],
                [Math.min(end, schedule.closeMinute), end],
              ].filter(([a, b]) => b > a)
            : []
          const pieces = layout(
            active
              .filter((a) => inColumn(a, c))
              .flatMap((a) =>
                (a.segments.length
                  ? a.segments
                  : [{ id: a.id, kind: 'ACTIVE', startsAt: a.startsAt, endsAt: a.endsAt }]
                ).map((s) => ({
                  id: s.id,
                  appointment: a,
                  kind: s.kind,
                  top: minuteOfDay(s.startsAt, c.date),
                  bottom: minuteOfDay(s.endsAt, c.date),
                })),
              )
              .filter((p) => p.kind !== 'PROCESSING'),
          )
          const processing = active
            .filter((a) => inColumn(a, c))
            .flatMap((a) =>
              a.segments
                .filter((s) => s.kind === 'PROCESSING')
                .map((s) => ({ s, a })),
            )
          return (
            <div
              key={c.key}
              data-column={c.key}
              className={`relative border-l border-zinc-100 ${c.today ? 'bg-amber-50/40' : ''} ${canEdit ? 'cursor-copy' : ''}`}
              style={{ height }}
              onClick={(e) => {
                if (!canEdit || e.target !== e.currentTarget) return
                create({
                  barberId,
                  startsAt: `${c.date}T${hhmm(pointerMinute(e))}`,
                })
              }}
              onDragOver={(e) => {
                const current = drag.current
                if (!current) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                const minute = pointerMinute(e, current.grab)
                const duration =
                  (new Date(current.appointment.endsAt).getTime() -
                    new Date(current.appointment.startsAt).getTime()) /
                  60000
                if (preview?.column !== c.key || preview.minute !== minute)
                  setPreview({ column: c.key, minute, duration })
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  setPreview(null)
              }}
              onDrop={(e) => {
                const current = drag.current
                if (!current) return
                e.preventDefault()
                const minute = pointerMinute(e, current.grab)
                drag.current = null
                setPreview(null)
                move(current.appointment, {
                  barberId: c.barberId ?? current.appointment.barber.id,
                  startsAt: `${c.date}T${hhmm(minute)}`,
                })
              }}
            >
              {hours.map((h) => (
                <div key={h} className="pointer-events-none absolute inset-x-0" style={{ top: (h - start) * PX }}>
                  <div className="border-t border-zinc-100" />
                  <div
                    className="border-t border-dashed border-zinc-100/70"
                    style={{ marginTop: 30 * PX - 1 }}
                  />
                </div>
              ))}

              {closed.map(([a, b]) => (
                <div
                  key={a}
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bg-[repeating-linear-gradient(-45deg,transparent_0_6px,var(--color-zinc-100)_6px_7px)] bg-zinc-50/60"
                  style={{ top: (a - start) * PX, height: (b - a) * PX }}
                />
              ))}

              {agenda.blocks
                .filter((block) => inColumn(block, c))
                .map((block) => {
                  const top = minuteOfDay(block.startsAt, c.date)
                  return (
                    <div
                      key={block.id}
                      className="absolute inset-x-1 z-10 overflow-hidden rounded-lg border border-dashed border-zinc-300 bg-zinc-100/95 px-2 py-1 text-xs text-zinc-600"
                      style={{
                        top: (top - start) * PX,
                        height: Math.max(26, (minuteOfDay(block.endsAt, c.date) - top) * PX),
                      }}
                    >
                      <p className="truncate font-medium">
                        {time(block.startsAt)}–{time(block.endsAt)} · {block.reason}
                      </p>
                      {canManageBlocks && (
                        <button
                          className="font-semibold text-zinc-800 underline-offset-2 hover:underline"
                          onClick={() => removeBlock(block.id)}
                        >
                          Liberar
                        </button>
                      )}
                    </div>
                  )
                })}

              {processing.map(({ s, a }) => {
                const top = minuteOfDay(s.startsAt, c.date)
                return (
                  <button
                    key={s.id}
                    onClick={() => select(a)}
                    title={`${a.client.name} · pausa do serviço`}
                    className="absolute inset-x-1 z-0 overflow-hidden rounded-lg border border-dashed border-sky-300 bg-sky-50/60 px-2 py-1 text-left text-[11px] text-sky-700"
                    style={{
                      top: (top - start) * PX,
                      height: Math.max(24, (minuteOfDay(s.endsAt, c.date) - top) * PX),
                    }}
                  >
                    {time(s.startsAt)} · Pausa · {a.client.name}
                  </button>
                )
              })}

              {pieces.map((p) => {
                const a = p.appointment
                const h = Math.max(22, (p.bottom - p.top) * PX - 2)
                // Até 20 min o card não comporta duas linhas: horário e nome lado a lado.
                const compact = h < 32
                const canMove = canEdit && movable(a)
                const services = a.services.map((s) => s.service.name).join(' + ')
                return (
                  <button
                    key={p.id}
                    draggable={canMove}
                    onDragStart={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      drag.current = {
                        appointment: a,
                        grab: (e.clientY - rect.top) / PX + (p.top - minuteOfDay(a.startsAt, c.date)),
                      }
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', a.id)
                    }}
                    onDragEnd={() => {
                      drag.current = null
                      setPreview(null)
                    }}
                    onClick={() => select(a)}
                    title={`${a.client.name} · ${services} · ${statusLabels[a.status]}${canMove ? ' · arraste para reagendar' : ''}`}
                    className={`group absolute z-10 overflow-hidden rounded-lg border px-2 ${compact ? 'flex items-center gap-1.5 py-0' : 'py-1'} text-left transition-[border-color,box-shadow] hover:z-20 active:shadow-lift ${statusStyles[a.status] || 'border-zinc-200 bg-zinc-50'} ${canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    style={{
                      top: (p.top - start) * PX + 1,
                      height: h,
                      left: `calc(${(p.lane / p.lanes) * 100}% + 4px)`,
                      width: `calc(${100 / p.lanes}% - 8px)`,
                    }}
                  >
                    <p className="hora flex shrink-0 items-center gap-1 truncate text-[10px] font-medium text-zinc-600">
                      {showBarber && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: barberColor(agenda, a.barber.id) }}
                        />
                      )}
                      {compact ? time(a.startsAt) : `${time(a.startsAt)}–${time(a.endsAt)}`}
                    </p>
                    {a.depositAmount && !a.depositPaidAt && (
                      <span
                        className="absolute right-1 top-1 rounded bg-amber-500 px-1 text-[9px] font-bold leading-4 text-white"
                        title="Aguardando sinal Pix"
                      >
                        PIX
                      </span>
                    )}
                    <p className="truncate text-xs font-semibold text-zinc-900">
                      {a.client.name}
                    </p>
                    {h >= 58 && (
                      <p className="truncate text-[11px] text-zinc-500">
                        {showBarber ? `${a.barber.name} · ` : ''}
                        {services}
                      </p>
                    )}
                  </button>
                )
              })}

              {preview?.column === c.key && (
                <div
                  className="pointer-events-none absolute inset-x-1 z-30 rounded-lg border-2 border-dashed border-amber-500 bg-amber-100/60 px-2 py-1 text-[11px] font-semibold text-amber-800"
                  style={{
                    top: (preview.minute - start) * PX,
                    height: Math.max(28, preview.duration * PX),
                  }}
                >
                  {hhmm(preview.minute)}
                </div>
              )}

              {c.today && nowMinute >= start && nowMinute <= end && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                  style={{ top: (nowMinute - start) * PX }}
                  aria-hidden
                >
                  <span className="-ml-1 h-2 w-2 rounded-full bg-accent" />
                  <span className="h-0.5 flex-1 bg-accent" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
