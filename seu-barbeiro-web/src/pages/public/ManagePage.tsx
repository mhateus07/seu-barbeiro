import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  CalendarClock,
  CalendarX2,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  QrCode,
  Scissors,
  User,
} from 'lucide-react'
import {
  getManaged,
  getManagedSlots,
  manageAction,
  type ManagedAppointment,
} from '../../api/public.api'
import { formatCurrency } from '../../utils/formatCurrency'
import { PublicShell } from './PublicShell'
import { formatPhone } from '../../utils/formatPhone'

const statusText: Record<string, { label: string; tone: string }> = {
  SCHEDULED: { label: 'Agendado', tone: 'bg-amber-500/15 text-amber-300' },
  CONFIRMED: { label: 'Confirmado', tone: 'bg-sky-500/15 text-sky-300' },
  IN_PROGRESS: { label: 'Em atendimento', tone: 'bg-violet-500/15 text-violet-300' },
  COMPLETED: { label: 'Concluído', tone: 'bg-emerald-500/15 text-emerald-300' },
  CANCELLED: { label: 'Cancelado', tone: 'bg-zinc-700/60 text-zinc-300' },
  NO_SHOW: { label: 'Não compareceu', tone: 'bg-zinc-700/60 text-zinc-300' },
}

const message = (error: unknown) =>
  (isAxiosError(error) && error.response?.data?.message) ||
  'Não foi possível concluir. Tente novamente.'

const localDay = (d: Date) => d.toLocaleDateString('sv-SE')

export function ManagePage() {
  const { token = '' } = useParams()
  const [params] = useSearchParams()
  const autoConfirm = useRef(params.get('confirmar') === '1')
  const [data, setData] = useState<ManagedAppointment | null>(null)
  const [loadError, setLoadError] = useState('')
  const [mode, setMode] = useState<'view' | 'reschedule' | 'cancel'>('view')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState<string[] | null>(null)
  const [time, setTime] = useState('')

  const load = useCallback(async () => {
    try {
      setData(await getManaged(token))
    } catch (e) {
      setLoadError(message(e))
    }
  }, [token])
  useEffect(() => {
    void load()
  }, [load])

  const days = useMemo(
    () =>
      Array.from({ length: 21 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() + i)
        return d
      }),
    [],
  )

  useEffect(() => {
    if (!date) return
    let active = true
    setSlots(null)
    setTime('')
    getManagedSlots(token, date)
      .then((s) => active && setSlots(s))
      .catch((e) => {
        if (!active) return
        setSlots([])
        setError(message(e))
      })
    return () => {
      active = false
    }
  }, [date, token])

  async function act(action: 'confirm' | 'cancel' | 'reschedule') {
    setBusy(true)
    setError('')
    try {
      await manageAction(token, action, action === 'reschedule' ? { date, time } : undefined)
      setDone(
        action === 'confirm'
          ? 'Presença confirmada. Te esperamos!'
          : action === 'cancel'
            ? 'Horário cancelado. Esperamos te ver em breve.'
            : 'Horário remarcado com sucesso.',
      )
      setMode('view')
      await load()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  // O lembrete do WhatsApp manda o link com ?confirmar=1: abrir já confirma.
  useEffect(() => {
    if (!data || !autoConfirm.current) return
    autoConfirm.current = false
    if (data.canConfirm) void act('confirm')
  })

  if (loadError)
    return (
      <PublicShell>
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <CalendarX2 className="mx-auto h-12 w-12 text-zinc-500" />
          <p className="mt-4 font-display text-lg font-bold">Link inválido</p>
          <p className="mt-1 text-sm text-zinc-400">{loadError}</p>
        </div>
      </PublicShell>
    )
  if (!data)
    return (
      <PublicShell>
        <div className="grid place-items-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      </PublicShell>
    )

  const start = new Date(data.startsAt)
  const status = statusText[data.status] ?? statusText.SCHEDULED
  const depositPending = data.deposit && !data.deposit.paid

  return (
    <PublicShell title={data.shop.name}>
      <p className="text-sm text-zinc-400">Olá, {data.clientFirstName}!</p>
      <h1 className="mt-1 font-display text-2xl font-bold">Seu horário</h1>

      {done && (
        <div role="status" className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {done}
        </div>
      )}

      <section className="mt-5 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 p-5">
          <div>
            <p className="font-display text-xl font-bold first-letter:uppercase">
              {start.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <p className="tabular mt-0.5 text-3xl font-extrabold text-amber-400">
              {start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.tone}`}>
            {status.label}
          </span>
        </div>
        <dl className="space-y-3 p-5 text-sm">
          <div className="flex items-center gap-3">
            <Scissors className="h-4 w-4 text-amber-500" />
            <dd>{data.services.map((s) => s.name).join(' + ')} · {formatCurrency(data.totalPrice)}</dd>
          </div>
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-amber-500" />
            <dd>com {data.barber.name}</dd>
          </div>
          {data.shop.address && (
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-amber-500" />
              <dd>{data.shop.address}</dd>
            </div>
          )}
          {data.deposit && (
            <div className="flex items-center gap-3">
              <QrCode className="h-4 w-4 text-amber-500" />
              <dd>
                Sinal de {formatCurrency(data.deposit.amount)} ·{' '}
                {data.deposit.paid ? (
                  <span className="text-emerald-400">pago</span>
                ) : (
                  <span className="text-amber-300">aguardando pagamento</span>
                )}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {depositPending && data.deposit?.payToken && (
        <Link
          to={`/pagar/${data.deposit.payToken}${window.location.search}`}
          className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3.5 text-sm font-bold text-zinc-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400"
        >
          <QrCode className="h-4 w-4" /> Pagar sinal com Pix
        </Link>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </p>
      )}

      {mode === 'view' && data.canChange && (
        <div className="mt-5 grid gap-2">
          {data.canConfirm && (
            <button
              disabled={busy}
              onClick={() => act('confirm')}
              className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3.5 text-sm font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" /> Confirmar presença
            </button>
          )}
          <button
            onClick={() => {
              setMode('reschedule')
              setError('')
              setDate(localDay(start) >= localDay(new Date()) ? localDay(start) : localDay(new Date()))
            }}
            className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3.5 text-sm font-semibold hover:border-amber-500/60"
          >
            <CalendarClock className="h-4 w-4" /> Remarcar
          </button>
          <button
            onClick={() => {
              setMode('cancel')
              setError('')
            }}
            className="rounded-2xl px-4 py-3 text-sm font-semibold text-zinc-400 hover:text-red-300"
          >
            Cancelar horário
          </button>
        </div>
      )}

      {mode === 'view' && !data.canChange && ['SCHEDULED', 'CONFIRMED'].includes(data.status) && (
        <p className="mt-5 flex items-start gap-2 rounded-2xl bg-zinc-900 p-4 text-sm text-zinc-400">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          Alterações pelo link podem ser feitas até {data.minNoticeHours} h antes.
          {data.shop.phone ? ` Para mudar agora, fale com o salão: ${formatPhone(data.shop.phone)}.` : ''}
        </p>
      )}

      {mode === 'reschedule' && (
        <section className="mt-5 space-y-4">
          <h2 className="font-display text-lg font-bold">Escolha o novo horário</h2>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {days.map((d) => {
              const value = localDay(d)
              const active = value === date
              return (
                <button
                  key={value}
                  onClick={() => setDate(value)}
                  className={`flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2 transition-colors ${active ? 'border-amber-500 bg-amber-500 text-zinc-950' : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600'}`}
                >
                  <span className="text-[10px] font-semibold uppercase">
                    {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                  </span>
                  <span className="font-display text-lg font-bold">{d.getDate()}</span>
                </button>
              )
            })}
          </div>
          {slots === null ? (
            <div className="grid place-items-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
            </div>
          ) : slots.length ? (
            <div className="grid grid-cols-4 gap-2">
              {slots.map((s) => (
                <button
                  key={s}
                  onClick={() => setTime(s)}
                  className={`tabular rounded-xl border py-2.5 text-sm font-semibold transition-colors ${time === s ? 'border-amber-500 bg-amber-500 text-zinc-950' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-zinc-900 p-4 text-center text-sm text-zinc-400">
              Sem horários livres neste dia. Tente outra data.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode('view')}
              className="rounded-2xl border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-300"
            >
              Voltar
            </button>
            <button
              disabled={!time || busy}
              onClick={() => act('reschedule')}
              className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-zinc-950 disabled:opacity-40"
            >
              {busy ? 'Remarcando…' : 'Confirmar'}
            </button>
          </div>
        </section>
      )}

      {mode === 'cancel' && (
        <section className="mt-5 rounded-3xl border border-red-500/25 bg-red-500/5 p-5">
          <h2 className="font-display text-lg font-bold">Cancelar este horário?</h2>
          <p className="mt-1 text-sm text-zinc-400">
            A vaga será liberada para outro cliente.
            {data.deposit?.paid ? ' Sobre o sinal pago, combine a devolução ou o crédito com o salão.' : ''}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode('view')}
              className="rounded-2xl border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-300"
            >
              Manter
            </button>
            <button
              disabled={busy}
              onClick={() => act('cancel')}
              className="rounded-2xl bg-red-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? 'Cancelando…' : 'Cancelar'}
            </button>
          </div>
        </section>
      )}
    </PublicShell>
  )
}
