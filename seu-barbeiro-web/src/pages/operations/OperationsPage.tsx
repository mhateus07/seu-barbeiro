import {
  AgendaTimeline,
  type AgendaColumn,
  type SlotTarget,
} from './AgendaTimeline'
import { AgendaSummary, MiniCalendar } from './AgendaPanel'
import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { addDays, format, isSameDay, parseISO, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { api } from '../../api/axios'
import { useAuth } from '../../contexts/auth-state'
import { formatCurrency } from '../../utils/formatCurrency'
import { Skeleton } from '../../components/ui/Skeleton'
import { AppointmentExtras } from './AppointmentExtras'
import {
  CalendarDays,
  TrendingUp,
  Users,
  Package,
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
  Ban,
} from 'lucide-react'

type Option = { id: string; name: string }
type Field = {
  key: string
  label: string
  type?: string
  options?: Option[]
  value?: string | number | boolean
  required?: boolean
}
type FormSpec = {
  title: string
  description?: string
  fields: Field[]
  submit: (values: Record<string, string>) => Promise<unknown>
}
type RecordEntry = {
  id: string
  createdAt: string
  formula?: string
  products?: string
  preferences?: string
  notes?: string
  photoUrls: string[]
}
type Service = Option & {
  returnDays?: number
  durationMin: number
  processingMin: number
  finishingMin: number
  price: number
  resourceId?: string
}
type Barber = Option & {
  serviceIds: string[]
  serviceOverrides: Record<string, { price?: number; durationMin?: number }>
}
export type Appointment = {
  id: string
  startsAt: string
  endsAt: string
  status: string
  totalPrice: number
  discount: number
  client: Option
  barber: Option
  services: { service: Service }[]
  payments: {
    id: string
    amount: number
    refundedAt?: string
    method: string
  }[]
  items: {
    id: string
    description: string
    quantity: number
    unitPrice: number
  }[]
  segments: { id: string; kind: string; startsAt: string; endsAt: string }[]
  manageToken?: string | null
  depositAmount?: number | string | null
  depositExpiresAt?: string | null
  depositPaidAt?: string | null
  subscriptionCovered?: number | string
}
export type Agenda = {
  appointments: Appointment[]
  barbers: Barber[]
  services: Service[]
  resources: Option[]
  schedules: {
    barberId: string
    weekday: number
    openMinute: number
    closeMinute: number
  }[]
  blocks: {
    id: string
    barberId: string
    startsAt: string
    endsAt: string
    reason: string
  }[]
}
type Growth = {
  reactivation: {
    clientId: string
    name: string
    service: string
    serviceId: string
    consent: boolean
    daysLate: number
  }[]
  waitlist: {
    id: string
    client: Option
    from: string
    to: string
    status: string
    expiresAt?: string
    serviceIds: string[]
    barberId?: string
  }[]
  unpaid: { id: string; balance: number }[]
  metrics: {
    outreach: number
    attributedBookings: number
    attributedReceived: number
    waitlistCompleted: number
    completed: number
    returnCount: number
  }
}
const inputClass =
  'mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm font-normal text-zinc-900 outline-hidden transition-all focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15'
const buttonClass =
  'inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-soft transition-colors hover:border-amber-400 hover:text-zinc-900 disabled:opacity-50'
const statusLabels: Record<string, string> = {
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  NO_SHOW: 'Faltou',
}
const money = (v: number) => formatCurrency(Number(v))
const iso = (value: string) => new Date(value).toISOString()
const localDate = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const time = (v: string) =>
  new Date(v).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })

function ActionForm({
  spec,
  close,
  saved,
}: {
  spec: FormSpec
  close: () => void
  saved: () => void
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const dialog = useRef<HTMLElement>(null)
  useEffect(() => {
    dialog.current
      ?.querySelector<HTMLElement>('input, select, textarea, button')
      ?.focus()
  }, [])
  function dialogKey(event: React.KeyboardEvent) {
    if (event.key === 'Escape' && !busy) close()
    if (event.key !== 'Tab') return
    const nodes = Array.from(
      dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
      ) || [],
    )
    const first = nodes[0],
      last = nodes[nodes.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const submitted = new FormData(e.currentTarget as HTMLFormElement)
    const data = Object.fromEntries(
      spec.fields.map((field) => [
        field.key,
        field.type === 'checkbox'
          ? String(submitted.has(field.key))
          : String(submitted.get(field.key) ?? ''),
      ]),
    )
    try {
      await spec.submit(data)
      saved()
      close()
    } catch (e: unknown) {
      const err = e as {
        response?: { data?: { error?: { message?: string }; message?: string } }
      }
      setError(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Não foi possível salvar. Revise os dados e tente novamente.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-zinc-950/55 p-4">
      <section
        ref={dialog}
        onKeyDown={dialogKey}
        role="dialog"
        aria-modal="true"
        aria-label={spec.title}
        className="w-full max-w-lg max-h-[90dvh] animate-pop-in overflow-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-lift"
      >
        <div className="flex justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold text-zinc-900">{spec.title}</h2>
          <button
            aria-label="Fechar"
            onClick={close}
            disabled={busy}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X size={18} />
          </button>
        </div>
        {spec.description && (
          <p className="text-sm text-zinc-600 mb-4">{spec.description}</p>
        )}
        <form onSubmit={submit} className="space-y-4">
          {spec.fields.map((f) => (
            <label key={f.key} className="block text-sm font-medium text-zinc-700">
              {f.label}
              {f.type === 'checkbox' ? (
                <input
                  name={f.key}
                  className="ml-3"
                  type="checkbox"
                  defaultChecked={String(f.value) === 'true'}
                />
              ) : f.options ? (
                <select
                  name={f.key}
                  required={f.required !== false}
                  className={inputClass}
                  defaultValue={String(f.value ?? '')}
                >
                  <option value="">Selecione</option>
                  {f.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea
                  name={f.key}
                  rows={3}
                  required={f.required !== false}
                  className={inputClass}
                  defaultValue={String(f.value ?? '')}
                />
              ) : (
                <input
                  name={f.key}
                  required={f.required !== false}
                  type={f.type || 'text'}
                  step={f.type === 'number' ? '0.01' : undefined}
                  className={inputClass}
                  defaultValue={String(f.value ?? '')}
                />
              )}
            </label>
          ))}
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={busy}
            className="w-full rounded-xl bg-amber-500 p-3 font-semibold text-white transition-colors hover:bg-amber-400 active:translate-y-px disabled:opacity-50"
          >
            {busy ? 'Salvando…' : 'Confirmar'}
          </button>
        </form>
      </section>
    </div>
  )
}

export function OperationsPage() {
  const { admin } = useAuth(),
    qc = useQueryClient()
  const isStaff = admin?.role !== 'PROFESSIONAL',
    isOwner = admin?.role === 'OWNER'
  const [tab, setTab] = useState('agenda'),
    [date, setDate] = useState(localDate),
    // Dia (uma coluna por profissional) é o mais legível com a agenda cheia.
    [view, setView] = useState<'day' | 'week'>('day'),
    [barberFilter, setBarberFilter] = useState(''),
    [form, setForm] = useState<FormSpec | null>(null)
  const rangeStart =
      view === 'week'
        ? format(startOfWeek(parseISO(date)), 'yyyy-MM-dd')
        : date,
    days = view === 'week' ? 7 : 1
  const [selected, setSelected] = useState<Appointment | null>(null),
    [records, setRecords] = useState<RecordEntry[] | null>(null),
    [notice, setNotice] = useState('')
  const {
    data: agenda,
    isLoading,
    isPlaceholderData,
    error,
  } = useQuery<Agenda>({
    queryKey: ['operations-agenda', rangeStart, days],
    queryFn: async () =>
      (
        await api.get('/operations/agenda', {
          params: { date: rangeStart, days },
        })
      ).data,
    placeholderData: (previous) => previous,
  })
  const { data: growth } = useQuery<Growth>({
    queryKey: ['operations-growth'],
    enabled: isStaff && tab === 'growth',
    queryFn: async () => (await api.get('/operations/growth')).data,
  })
  const { data: clients = [] } = useQuery<
    (Option & { marketingConsent: boolean })[]
  >({
    queryKey: ['operations-clients'],
    enabled: isStaff,
    queryFn: async () => {
      const all = []
      let page = 1
      while (true) {
        const r = (await api.get('/clients', { params: { page, limit: 100 } }))
          .data
        all.push(...r.data)
        if (page >= r.meta.totalPages) return all
        page++
      }
    },
  })
  const { data: products = [] } = useQuery<
    (Option & { price: number; cost: number; stock: number })[]
  >({
    queryKey: ['operations-products'],
    enabled: isStaff,
    queryFn: async () => (await api.get('/operations/products')).data,
  })
  const { data: users = [] } = useQuery<
    (Option & { email: string; role: string; isActive: boolean })[]
  >({
    queryKey: ['operations-users'],
    enabled: isOwner && tab === 'team',
    queryFn: async () => (await api.get('/operations/users')).data,
  })
  const { data: myCommission } = useQuery<{
    commission: number
    appointments: number
  }>({
    queryKey: ['operations-my-commission'],
    enabled: !isStaff,
    queryFn: async () => (await api.get('/operations/my-commission')).data,
  })
  function saved() {
    toast.success('Tudo certo, alteração salva.')
    void qc.invalidateQueries()
    setRecords(null)
  }
  function confirm(
    title: string,
    submit: () => Promise<unknown>,
    description?: string,
  ) {
    setForm({ title, description, fields: [], submit })
  }
  function book(a?: Appointment, slot?: SlotTarget) {
    setForm({
      title: a ? 'Agendar próximo retorno' : 'Novo atendimento',
      description:
        'O horário será validado com a escala, os bloqueios e os recursos do salão.',
      fields: [
        {
          key: 'clientId',
          label: 'Cliente',
          options: clients,
          value: a?.client.id,
        },
        {
          key: 'barberId',
          label: 'Profissional',
          options: agenda?.barbers,
          value: a?.barber.id ?? slot?.barberId,
        },
        {
          key: 'serviceId',
          label: 'Serviço',
          options: agenda?.services,
          value: a?.services[0]?.service.id,
        },
        {
          key: 'startsAt',
          label: 'Data e hora',
          type: 'datetime-local',
          value: a
            ? `${new Date(new Date(a.startsAt).getTime() + (a.services[0]?.service.returnDays || 30) * 86400000).toLocaleDateString('sv-SE')}T${time(a.startsAt)}`
            : (slot?.startsAt ?? `${date}T09:00`),
        },
        ...(!a
          ? [
              {
                key: 'secondService',
                label: 'Segundo serviço (opcional)',
                options: agenda?.services,
                required: false,
              },
              {
                key: 'secondBarber',
                label: 'Profissional do segundo serviço',
                options: agenda?.barbers,
                required: false,
              },
              {
                key: 'secondStart',
                label: 'Horário do segundo serviço',
                type: 'datetime-local',
                required: false,
              },
            ]
          : []),
      ],
      submit: (v) =>
        v.secondService
          ? api.post('/operations/visits', {
              clientId: v.clientId,
              appointments: [
                {
                  barberId: v.barberId,
                  serviceIds: [v.serviceId],
                  startsAt: iso(v.startsAt),
                },
                {
                  barberId: v.secondBarber,
                  serviceIds: [v.secondService],
                  startsAt: iso(v.secondStart),
                },
              ],
            })
          : api.post('/appointments', {
              clientId: v.clientId,
              barberId: v.barberId,
              serviceIds: [v.serviceId],
              startsAt: iso(v.startsAt),
              ...(a ? { returnOfId: a.id } : {}),
            }),
    })
  }
  function technical(a: Appointment) {
    setForm({
      title: `Ficha técnica · ${a.client.name}`,
      fields: [
        {
          key: 'formula',
          label: 'Fórmula / procedimento',
          type: 'textarea',
          required: false,
        },
        {
          key: 'products',
          label: 'Produtos utilizados',
          type: 'textarea',
          required: false,
        },
        {
          key: 'preferences',
          label: 'Preferências',
          type: 'textarea',
          required: false,
        },
        {
          key: 'notes',
          label: 'Observações',
          type: 'textarea',
          required: false,
        },
        {
          key: 'photo',
          label: 'Link HTTPS da foto (opcional)',
          type: 'url',
          required: false,
        },
        {
          key: 'photoConsent',
          label: 'Cliente autorizou o registro da foto',
          type: 'checkbox',
        },
      ],
      submit: (v) =>
        api.post(`/operations/clients/${a.client.id}/records`, {
          formula: v.formula,
          products: v.products,
          preferences: v.preferences,
          notes: v.notes,
          photoUrls: v.photo ? [v.photo] : [],
          photoConsent: v.photoConsent === 'true',
        }),
    })
  }
  function addWaitlist() {
    setForm({
      title: 'Entrar na lista de espera',
      description: 'Registre o intervalo em que o cliente pode ser atendido.',
      fields: [
        { key: 'clientId', label: 'Cliente', options: clients },
        {
          key: 'barberId',
          label: 'Profissional (opcional)',
          options: agenda?.barbers,
          required: false,
        },
        { key: 'serviceId', label: 'Serviço', options: agenda?.services },
        {
          key: 'from',
          label: 'Disponível a partir de',
          type: 'datetime-local',
        },
        { key: 'to', label: 'Disponível até', type: 'datetime-local' },
      ],
      submit: (v) =>
        api.post('/operations/waitlist', {
          clientId: v.clientId,
          barberId: v.barberId || undefined,
          serviceIds: [v.serviceId],
          from: iso(v.from),
          to: iso(v.to),
        }),
    })
  }
  // O painel continua aberto após salvar e some se o atendimento sair do período exibido.
  const selectedFresh =
    selected &&
    (agenda ? agenda.appointments.find((a) => a.id === selected.id) : selected)
  const balance = selectedFresh
    ? Number(selectedFresh.totalPrice) -
      Number(selectedFresh.discount) -
      Number(selectedFresh.subscriptionCovered ?? 0) +
      selectedFresh.items.reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0) -
      selectedFresh.payments
        .filter((p) => !p.refundedAt)
        .reduce((sum, p) => sum + Number(p.amount), 0)
    : 0
  const day = parseISO(date)
  const step = (direction: number) =>
    setDate(format(addDays(day, direction * days), 'yyyy-MM-dd'))
  const periodLabel =
    view === 'week'
      ? `${format(parseISO(rangeStart), "d 'de' MMM", { locale: ptBR })} – ${format(addDays(parseISO(rangeStart), 6), "d 'de' MMM 'de' yyyy", { locale: ptBR })}`
      : format(day, "EEEE, d 'de' MMMM", { locale: ptBR })
  const columns: AgendaColumn[] =
    view === 'week'
      ? Array.from({ length: 7 }, (_, i) => {
          const d = addDays(parseISO(rangeStart), i)
          return {
            key: format(d, 'yyyy-MM-dd'),
            date: format(d, 'yyyy-MM-dd'),
            barberFilter: barberFilter || undefined,
            title: format(d, 'EEE', { locale: ptBR }),
            subtitle: format(d, 'd'),
            today: isSameDay(d, new Date()),
          }
        })
      : (agenda?.barbers || [])
          .filter((b) => !barberFilter || b.id === barberFilter)
          .map((b) => ({
            key: b.id,
            date,
            barberId: b.id,
            title: b.name,
            today: isSameDay(day, new Date()),
          }))
  function moveAppointment(a: Appointment, target: SlotTarget) {
    const barber = agenda?.barbers.find((b) => b.id === target.barberId)
    const when = new Date(target.startsAt)
    if (when.getTime() === new Date(a.startsAt).getTime() && target.barberId === a.barber.id)
      return
    confirm(
      'Reagendar atendimento?',
      () =>
        api.patch(`/appointments/${a.id}`, {
          barberId: target.barberId,
          startsAt: iso(target.startsAt),
        }),
      `${a.client.name} passa para ${format(when, "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}${barber && barber.id !== a.barber.id ? ` com ${barber.name}` : ''}. O horário será validado com a escala e os bloqueios.`,
    )
  }
  return (
    <div className="max-w-[1500px] mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-zinc-900 md:text-3xl">
            Agenda e operação
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Atendimentos, relacionamento e resultados do salão.
          </p>
        </div>
        {isStaff && (
          <button
            onClick={() => book()}
            className="flex w-full items-center justify-center gap-2 rounded-xl sm:w-auto bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-400 active:scale-[0.98]"
          >
            <Plus size={16} strokeWidth={2.5} /> Novo atendimento
          </button>
        )}
      </header>
      <nav
        className="no-scrollbar flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-1 shadow-soft"
        aria-label="Áreas de operação"
      >
        {[
          { id: 'agenda', label: 'Agenda', icon: CalendarDays },
          ...(isStaff
            ? [
                {
                  id: 'growth',
                  label: 'Retorno e oportunidades',
                  icon: TrendingUp,
                },
                { id: 'team', label: 'Equipe e serviços', icon: Users },
                { id: 'products', label: 'Produtos', icon: Package },
              ]
            : []),
        ].map((t) => (
          <button
            key={t.id}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => {
              setTab(t.id)
              setSelected(null)
            }}
            className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-all ${tab === t.id ? 'bg-zinc-900 text-white shadow-soft' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </nav>
      {notice && (
        <div
          role="status"
          className="rounded-xl bg-emerald-50 text-emerald-800 p-3 flex justify-between"
        >
          {notice}
          <button aria-label="Fechar aviso" onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          Não foi possível carregar a operação. Verifique a conexão e as
          migrações do servidor.
        </p>
      )}
      {tab === 'agenda' && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-xl border border-zinc-200 bg-white p-0.5 shadow-soft">
                <button
                  aria-label={view === 'week' ? 'Semana anterior' : 'Dia anterior'}
                  onClick={() => step(-1)}
                  className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => setDate(localDate())}
                  className="rounded-lg px-2.5 py-1 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
                >
                  Hoje
                </button>
                <button
                  aria-label={view === 'week' ? 'Próxima semana' : 'Próximo dia'}
                  onClick={() => step(1)}
                  className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <h2 className="mr-auto min-w-0 flex-1 truncate font-display text-base font-bold first-letter:uppercase text-zinc-900 sm:flex-none md:text-lg">
                {periodLabel}
              </h2>
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
              <input
                aria-label="Ir para a data"
                type="date"
                value={date}
                onChange={(e) => e.currentTarget.value && setDate(e.currentTarget.value)}
                className="w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-700 shadow-soft sm:w-auto xl:hidden"
              />
              {isStaff && (agenda?.barbers.length || 0) > 1 && (
                <select
                  aria-label="Filtrar profissional"
                  value={barberFilter}
                  onChange={(e) => setBarberFilter(e.currentTarget.value)}
                  className="w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-700 shadow-soft sm:w-auto"
                >
                  <option value="">Toda a equipe</option>
                  {agenda?.barbers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
              <div
                role="radiogroup"
                aria-label="Visualização"
                className="flex rounded-xl border border-zinc-200 bg-white p-0.5 shadow-soft"
              >
                {(
                  [
                    ['day', 'Dia'],
                    ['week', 'Semana'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={view === id}
                    onClick={() => setView(id)}
                    className={`flex-1 rounded-lg px-3 py-1 text-sm font-medium transition-all ${view === id ? 'bg-white text-zinc-900 shadow-[0_1px_2px_rgb(21_35_63/0.12)]' : 'text-zinc-500 hover:text-zinc-900'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {(isStaff || (agenda?.barbers.length ?? 0) > 0) && (
                <button
                  className={`${buttonClass} justify-center`}
                  onClick={() =>
                    setForm({
                      title: 'Bloquear horário',
                      fields: [
                        {
                          key: 'barberId',
                          label: 'Profissional',
                          options: agenda?.barbers,
                          value:
                            barberFilter ||
                            (agenda?.barbers.length === 1 ? agenda.barbers[0].id : ''),
                        },
                        {
                          key: 'startsAt',
                          label: 'Início',
                          type: 'datetime-local',
                          value: `${date}T12:00`,
                        },
                        {
                          key: 'endsAt',
                          label: 'Fim',
                          type: 'datetime-local',
                          value: `${date}T13:00`,
                        },
                        { key: 'reason', label: 'Motivo', value: 'Intervalo' },
                      ],
                      submit: (v) =>
                        api.post('/operations/blocks', {
                          ...v,
                          startsAt: iso(v.startsAt),
                          endsAt: iso(v.endsAt),
                        }),
                    })
                  }
                >
                  <Ban size={15} /> Bloquear horário
                </button>
              )}
              </div>
            </div>
            {myCommission && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Sua comissão no mês:{' '}
                <strong>{money(myCommission.commission)}</strong> ·{' '}
                {myCommission.appointments} atendimentos
              </p>
            )}
            {isStaff && (
              <p className="hidden text-xs text-zinc-400 md:block">
                Clique num horário livre para agendar. Arraste um atendimento
                para reagendar.
              </p>
            )}
            {isLoading && !agenda && (
              <Skeleton className="h-[560px] rounded-2xl" />
            )}
            {agenda && (
              <AgendaTimeline
                agenda={agenda}
                columns={columns}
                showBarber={view === 'week' && !barberFilter}
                canEdit={isStaff}
                canManageBlocks
                ready={!isPlaceholderData}
                select={(a) => {
                  setSelected(a)
                  setRecords(null)
                }}
                removeBlock={(id) =>
                  confirm('Remover bloqueio?', () =>
                    api.delete(`/operations/blocks/${id}`),
                  )
                }
                move={moveAppointment}
                create={(slot) => book(undefined, slot)}
              />
            )}
            {agenda &&
              agenda.appointments.some((a) =>
                ['CANCELLED', 'NO_SHOW'].includes(a.status),
              ) && (
                <details className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-soft">
                  <summary className="cursor-pointer font-medium text-zinc-700">
                    Cancelamentos e ausências
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {agenda.appointments
                      .filter((a) => ['CANCELLED', 'NO_SHOW'].includes(a.status))
                      .map((a) => (
                        <button
                          key={a.id}
                          className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-zinc-600 hover:bg-zinc-200"
                          onClick={() => setSelected(a)}
                        >
                          {format(new Date(a.startsAt), 'dd/MM')} {time(a.startsAt)}{' '}
                          · {a.client.name} · {statusLabels[a.status]}
                        </button>
                      ))}
                  </div>
                </details>
              )}
          </div>
          <aside className="hidden space-y-4 xl:block">
            <MiniCalendar date={date} week={view === 'week'} onPick={setDate} />
            {agenda && (
              <AgendaSummary agenda={agenda} barberFilter={barberFilter || undefined} />
            )}
          </aside>
        </div>
      )}

      {tab === 'growth' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              {
                label: 'Convites neste mês',
                value: growth?.metrics.outreach ?? 0,
              },
              {
                label: 'Reservas atribuídas',
                value: growth?.metrics.attributedBookings ?? 0,
              },
              {
                label: 'Recebido nas reservas atribuídas',
                value: money(growth?.metrics.attributedReceived ?? 0),
              },
              {
                label: 'Retornos / atendimentos concluídos',
                value: `${growth?.metrics.returnCount ?? 0} / ${growth?.metrics.completed ?? 0}`,
              },
            ].map((m) => (
              <div key={m.label} className="min-w-0 bg-white border rounded-2xl p-4">
                <p className="text-xs leading-tight text-zinc-500">{m.label}</p>
                <p className="tabular truncate text-xl font-bold mt-2 sm:text-2xl">{m.value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-500">
            Atribuição identifica a origem da reserva; não comprova receita
            adicional. Valores recebidos descontam estornos.
          </p>
          <section className="rounded-2xl border bg-white p-5 space-y-3">
            <h2 className="font-bold">Clientes no momento de voltar</h2>
            <p className="text-sm text-zinc-500">
              Configure o intervalo de retorno em Equipe e serviços. Clientes
              com uma visita futura não aparecem aqui.
            </p>
            {growth?.reactivation.map((c) => (
              <div
                key={c.clientId}
                className="flex flex-wrap justify-between gap-3 border-t py-3"
              >
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-sm text-zinc-500">
                    {c.service} · {c.daysLate} dias após o retorno esperado
                  </p>
                </div>
                <button
                  className={buttonClass}
                  onClick={() =>
                    c.consent
                      ? confirm(
                          `Enviar convite para ${c.name}?`,
                          () =>
                            api.post('/operations/reactivation', {
                              clientId: c.clientId,
                              serviceId: c.serviceId,
                            }),
                          'O convite será colocado na fila do WhatsApp. É permitido um convite por cliente a cada sete dias.',
                        )
                      : setForm({
                          title: 'Preferência de comunicação',
                          fields: [
                            {
                              key: 'marketingConsent',
                              label: `${c.name} autorizou receber convites`,
                              type: 'checkbox',
                            },
                          ],
                          submit: (v) =>
                            api.patch(
                              `/operations/clients/${c.clientId}/consent`,
                              {
                                marketingConsent: v.marketingConsent === 'true',
                              },
                            ),
                        })
                  }
                >
                  {c.consent ? 'Convidar para voltar' : 'Registrar autorização'}
                </button>
              </div>
            ))}
            {!growth?.reactivation.length && (
              <p className="text-sm py-4 text-zinc-500">
                Nenhum retorno atrasado identificado.
              </p>
            )}
          </section>
          <section className="rounded-2xl border bg-white p-5 space-y-3">
            <div className="flex justify-between">
              <h2 className="font-bold">Lista de espera</h2>
              {isOwner && (
                <button
                  className={buttonClass}
                  onClick={() =>
                    setForm({
                      title: 'Preenchimento automático',
                      description:
                        'Quando houver cancelamento, oferecer a vaga ao primeiro cliente compatível. Exige WhatsApp configurado.',
                      fields: [
                        {
                          key: 'enabled',
                          label: 'Ativar ofertas automáticas',
                          type: 'checkbox',
                        },
                      ],
                      submit: (v) =>
                        api.patch('/settings', {
                          settings: {
                            waitlist_auto_offer:
                              v.enabled === 'true' ? 'true' : 'false',
                          },
                        }),
                    })
                  }
                >
                  Automação
                </button>
              )}
              <button onClick={addWaitlist} className={buttonClass}>
                Adicionar cliente
              </button>
            </div>
            {growth?.waitlist.map((w) => (
              <div
                key={w.id}
                className="border-t py-3 flex flex-wrap justify-between gap-3"
              >
                <div>
                  <p className="font-medium">{w.client.name}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(w.from).toLocaleString('pt-BR')} até{' '}
                    {new Date(w.to).toLocaleString('pt-BR')}
                  </p>
                  <p className="text-xs">
                    {w.status === 'OFFERED'
                      ? `Oferta enviada · expira ${w.expiresAt ? time(w.expiresAt) : ''}`
                      : 'Aguardando vaga'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className={buttonClass}
                    onClick={() =>
                      setForm({
                        title: `Oferecer vaga · ${w.client.name}`,
                        description:
                          'O horário fica reservado por 15 minutos para este cliente.',
                        fields: [
                          {
                            key: 'barberId',
                            label: 'Profissional',
                            options: agenda?.barbers,
                            value: w.barberId,
                          },
                          {
                            key: 'startsAt',
                            label: 'Horário disponível',
                            type: 'datetime-local',
                          },
                        ],
                        submit: async (v) => {
                          const result = await api.post(
                            `/operations/waitlist/${w.id}/offer`,
                            { barberId: v.barberId, startsAt: iso(v.startsAt) },
                          )
                          setNotice(
                            `Oferta criada. Link para o cliente: ${result.data.link}`,
                          )
                        },
                      })
                    }
                  >
                    Oferecer vaga
                  </button>
                  <button
                    className={buttonClass}
                    onClick={() =>
                      confirm('Retirar da lista de espera?', () =>
                        api.delete(`/operations/waitlist/${w.id}`),
                      )
                    }
                  >
                    Retirar
                  </button>
                </div>
              </div>
            ))}
            {!growth?.waitlist.length && (
              <p className="text-sm text-zinc-500 py-4">
                Não há clientes aguardando.
              </p>
            )}
          </section>
          <section className="rounded-2xl border bg-white p-5">
            <h2 className="font-bold">Recebimentos pendentes</h2>
            <p className="text-sm mt-2">
              {growth?.unpaid.length ?? 0} atendimentos concluídos com saldo.
              Total:{' '}
              {money(
                growth?.unpaid.reduce((sum, a) => sum + a.balance, 0) ?? 0,
              )}
              .
            </p>
            <p className="text-xs text-zinc-500 mt-2">
              Abra o atendimento na agenda para registrar o pagamento.
            </p>
          </section>
        </div>
      )}
      {tab === 'team' && (
        <div className="space-y-5">
          <section className="rounded-2xl bg-white border p-5 space-y-3">
            <h2 className="font-bold">Escalas e especialidades</h2>
            {agenda?.barbers.map((b) => (
              <div
                key={b.id}
                className="flex justify-between items-center border-t py-3 gap-3"
              >
                <p>{b.name}</p>
                <div className="flex gap-2">
                  <button
                    className={buttonClass}
                    onClick={() =>
                      setForm({
                        title: `Escala · ${b.name}`,
                        description:
                          'Defina início e fim por dia. Use 00:00 nos dois campos para marcar folga.',
                        fields: [
                          'Domingo',
                          'Segunda',
                          'Terça',
                          'Quarta',
                          'Quinta',
                          'Sexta',
                          'Sábado',
                        ].flatMap((name, day) => {
                          const schedule = agenda.schedules.find(
                            (s) => s.barberId === b.id && s.weekday === day,
                          )
                          const fmt = (n: number) =>
                            `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
                          return [
                            {
                              key: `open${day}`,
                              label: `${name}: início`,
                              type: 'time',
                              value: fmt(
                                schedule?.openMinute ?? (day ? 480 : 0),
                              ),
                            },
                            {
                              key: `close${day}`,
                              label: `${name}: fim`,
                              type: 'time',
                              value: fmt(
                                schedule?.closeMinute ?? (day ? 1080 : 0),
                              ),
                            },
                          ]
                        }),
                        submit: (v) =>
                          api.put(
                            `/operations/schedules/${b.id}`,
                            Array.from({ length: 7 }, (_, weekday) => {
                              const min = (s: string) => {
                                const [h, m] = s.split(':').map(Number)
                                return h * 60 + m
                              }
                              return {
                                weekday,
                                openMinute: min(v[`open${weekday}`]),
                                closeMinute: min(v[`close${weekday}`]),
                              }
                            }),
                          ),
                      })
                    }
                  >
                    Escala
                  </button>
                  <button
                    className={buttonClass}
                    onClick={() =>
                      setForm({
                        title: `Serviços de ${b.name}`,
                        description:
                          'Sem seleção, o profissional atende todos os serviços.',
                        fields: agenda.services.map((s) => ({
                          key: s.id,
                          label: s.name,
                          type: 'checkbox',
                          value: b.serviceIds.includes(s.id),
                        })),
                        submit: (v) =>
                          api.patch(`/barbers/${b.id}`, {
                            serviceIds: Object.keys(v).filter(
                              (key) => v[key] === 'true',
                            ),
                          }),
                      })
                    }
                  >
                    Especialidades
                  </button>
                  {isOwner && <button
                    className={buttonClass}
                    onClick={() =>
                      setForm({
                        title: `Preço e duração · ${b.name}`,
                        description:
                          'Valores em branco usam o padrão do serviço.',
                        fields: [
                          {
                            key: 'serviceId',
                            label: 'Serviço',
                            options: agenda.services,
                          },
                          {
                            key: 'price',
                            label: 'Preço específico',
                            type: 'number',
                            required: false,
                          },
                          {
                            key: 'durationMin',
                            label: 'Duração ativa (min)',
                            type: 'number',
                            required: false,
                          },
                        ],
                        submit: (v) =>
                          api.patch(`/barbers/${b.id}`, {
                            serviceOverrides: {
                              ...b.serviceOverrides,
                              [v.serviceId]: {
                                ...(v.price ? { price: Number(v.price) } : {}),
                                ...(v.durationMin
                                  ? { durationMin: Number(v.durationMin) }
                                  : {}),
                              },
                            },
                          }),
                      })
                    }
                  >
                    Preço e duração
                  </button>}
                </div>
              </div>
            ))}
          </section>
          <section className="rounded-2xl bg-white border p-5 space-y-3">
            <h2 className="font-bold">Etapas dos serviços e retorno</h2>
            <p className="text-sm text-zinc-500">
              Durante a pausa, o profissional pode atender outra pessoa. O
              recurso permanece reservado.
            </p>
            {agenda?.services.map((s) => (
              <div
                key={s.id}
                className="flex justify-between border-t py-3 gap-3"
              >
                <div>
                  <p>{s.name}</p>
                  <p className="text-xs text-zinc-500">
                    {s.durationMin} min ativos + {s.processingMin} min de pausa
                    + {s.finishingMin} min de finalização · retorno{' '}
                    {s.returnDays ? `${s.returnDays} dias` : 'não definido'}
                  </p>
                </div>
                <button
                  className={buttonClass}
                  onClick={() =>
                    setForm({
                      title: s.name,
                      fields: [
                        {
                          key: 'durationMin',
                          label: 'Aplicação / atendimento ativo (min)',
                          type: 'number',
                          value: s.durationMin,
                        },
                        {
                          key: 'processingMin',
                          label: 'Pausa (min)',
                          type: 'number',
                          value: s.processingMin,
                        },
                        {
                          key: 'finishingMin',
                          label: 'Finalização (min)',
                          type: 'number',
                          value: s.finishingMin,
                        },
                        {
                          key: 'returnDays',
                          label: 'Retorno sugerido (dias)',
                          type: 'number',
                          value: s.returnDays || '',
                          required: false,
                        },
                        {
                          key: 'resourceId',
                          label: 'Recurso utilizado (opcional)',
                          options: agenda.resources,
                          value: s.resourceId || '',
                          required: false,
                        },
                      ],
                      submit: (v) =>
                        api.patch(`/services/${s.id}`, {
                          durationMin: Number(v.durationMin),
                          processingMin: Number(v.processingMin),
                          finishingMin: Number(v.finishingMin),
                          returnDays: v.returnDays
                            ? Number(v.returnDays)
                            : null,
                          resourceId: v.resourceId || null,
                        }),
                    })
                  }
                >
                  Configurar
                </button>
              </div>
            ))}
            {isOwner && (
              <button
                className={buttonClass}
                onClick={() =>
                  setForm({
                    title: 'Novo recurso',
                    fields: [{ key: 'name', label: 'Nome (ex.: Lavatório 1)' }],
                    submit: (v) => api.post('/operations/resources', v),
                  })
                }
              >
                Cadastrar cadeira, sala ou equipamento
              </button>
            )}
          </section>
          {isOwner && (
            <section className="rounded-2xl bg-white border p-5 space-y-3">
              <div className="flex justify-between gap-3">
                <h2 className="font-bold">Acessos da equipe</h2>
                <button
                  className={buttonClass}
                  onClick={() =>
                    setForm({
                      title: 'Criar acesso',
                      fields: [
                        { key: 'name', label: 'Nome' },
                        { key: 'email', label: 'E-mail', type: 'email' },
                        {
                          key: 'password',
                          label: 'Senha inicial (mínimo 10 caracteres)',
                          type: 'password',
                        },
                        {
                          key: 'role',
                          label: 'Perfil',
                          options: [
                            { id: 'OWNER', name: 'Dono' },
                            { id: 'RECEPTION', name: 'Recepção' },
                            { id: 'PROFESSIONAL', name: 'Profissional' },
                          ],
                        },
                        {
                          key: 'barberId',
                          label:
                            'Vincular profissional (obrigatório para perfil profissional)',
                          options: agenda?.barbers,
                          required: false,
                        },
                      ],
                      submit: (v) =>
                        api.post('/operations/users', {
                          ...v,
                          barberId: v.barberId || undefined,
                        }),
                    })
                  }
                >
                  Novo acesso
                </button>
              </div>
              {users.map((u) => (
                <div
                  key={u.id}
                  className="border-t py-3 flex justify-between gap-3"
                >
                  <div>
                    <p>{u.name}</p>
                    <p className="text-xs text-zinc-500">
                      {u.email} ·{' '}
                      {u.role === 'OWNER'
                        ? 'Dono'
                        : u.role === 'RECEPTION'
                          ? 'Recepção'
                          : 'Profissional'}{' '}
                      · {u.isActive ? 'Ativo' : 'Inativo'}
                    </p>
                  </div>
                  <div className="flex gap-2 items-start">
                    <button
                      className={buttonClass}
                      onClick={() =>
                        setForm({
                          title: `Trocar senha de ${u.name}`,
                          fields: [
                            {
                              key: 'password',
                              label: 'Nova senha (mínimo 10 caracteres)',
                              type: 'password',
                            },
                          ],
                          submit: (v) =>
                            api.patch(`/operations/users/${u.id}`, {
                              password: v.password,
                            }),
                        })
                      }
                    >
                      Trocar senha
                    </button>
                    {u.id !== admin?.id && (
                      <button
                        className={buttonClass}
                        onClick={() =>
                          confirm(
                            `${u.isActive ? 'Desativar' : 'Ativar'} acesso de ${u.name}?`,
                            () =>
                              api.patch(`/operations/users/${u.id}`, {
                                isActive: !u.isActive,
                              }),
                          )
                        }
                      >
                        {u.isActive ? 'Desativar' : 'Ativar'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
      {tab === 'products' && (
        <section className="rounded-2xl border bg-white p-5 space-y-4">
          <div className="flex justify-between">
            <h2 className="font-bold">Produtos e estoque</h2>
            {isOwner && (
              <button
                className={buttonClass}
                onClick={() =>
                  setForm({
                    title: 'Cadastrar produto',
                    fields: [
                      { key: 'name', label: 'Nome' },
                      { key: 'price', label: 'Preço de venda', type: 'number' },
                      { key: 'cost', label: 'Custo unitário', type: 'number' },
                      {
                        key: 'stock',
                        label: 'Estoque inicial',
                        type: 'number',
                      },
                    ],
                    submit: (v) =>
                      api.post('/operations/products', {
                        name: v.name,
                        price: Number(v.price),
                        cost: Number(v.cost),
                        stock: Number(v.stock),
                      }),
                  })
                }
              >
                Novo produto
              </button>
            )}
          </div>
          {products.map((p) => (
            <div key={p.id} className="border-t py-3 flex justify-between">
              <span>{p.name}</span>
              <span>
                {money(p.price)} · {p.stock} unidades
              </span>
            </div>
          ))}
          {!products.length && (
            <p className="text-sm text-zinc-500">
              Cadastre os produtos vendidos no salão. A venda na comanda baixa o
              estoque automaticamente.
            </p>
          )}
        </section>
      )}
      <AnimatePresence>
      {selectedFresh && (
        <motion.section
          key="appointment-drawer"
          initial={{ opacity: 0, x: 32 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 32 }}
          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          role="dialog"
          aria-label="Detalhes do atendimento"
          className="fixed inset-y-4 right-4 left-4 md:left-auto md:w-[440px] z-40 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 space-y-4 shadow-lift"
        >
          <div className="flex justify-between">
            <div>
              <h2 className="text-lg font-bold text-zinc-900">
                {selectedFresh.client.name}
              </h2>
              <p className="text-sm first-letter:uppercase text-zinc-500">
                {format(new Date(selectedFresh.startsAt), "EEEE, d 'de' MMMM", { locale: ptBR })}{' '}
                · {time(selectedFresh.startsAt)}–{time(selectedFresh.endsAt)}
              </p>
              <p className="mt-1.5 flex items-center gap-2 text-sm text-zinc-600">
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                  {statusLabels[selectedFresh.status]}
                </span>
                {selectedFresh.barber.name}
              </p>
            </div>
            <button
              aria-label="Fechar atendimento"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {isStaff && (
              <>
                {(
                  {
                    SCHEDULED: 'CONFIRMED',
                    CONFIRMED: 'IN_PROGRESS',
                    IN_PROGRESS: 'COMPLETED',
                  } as Record<string, string>
                )[selectedFresh.status] && (
                  <button
                    className={buttonClass}
                    onClick={() => {
                      const next = (
                        {
                          SCHEDULED: 'CONFIRMED',
                          CONFIRMED: 'IN_PROGRESS',
                          IN_PROGRESS: 'COMPLETED',
                        } as Record<string, string>
                      )[selectedFresh.status]
                      confirm(`Alterar para ${statusLabels[next]}?`, () =>
                        api.patch(`/appointments/${selectedFresh.id}/status`, {
                          status: next,
                        }),
                      )
                    }}
                  >
                    {
                      (
                        {
                          SCHEDULED: 'Confirmar',
                          CONFIRMED: 'Iniciar',
                          IN_PROGRESS: 'Concluir',
                        } as Record<string, string>
                      )[selectedFresh.status]
                    }
                  </button>
                )}
                {['SCHEDULED', 'CONFIRMED'].includes(selectedFresh.status) && (
                  <>
                    <button
                      className={buttonClass}
                      onClick={() =>
                        setForm({
                          title: 'Reagendar atendimento',
                          fields: [
                            {
                              key: 'barberId',
                              label: 'Profissional',
                              options: agenda?.barbers,
                              value: selectedFresh.barber.id,
                            },
                            {
                              key: 'startsAt',
                              label: 'Novo horário',
                              type: 'datetime-local',
                            },
                          ],
                          submit: (v) =>
                            api.patch(`/appointments/${selectedFresh.id}`, {
                              barberId: v.barberId,
                              startsAt: iso(v.startsAt),
                            }),
                        })
                      }
                    >
                      Reagendar
                    </button>
                    <button
                      className={buttonClass}
                      onClick={() =>
                        confirm(
                          'Cancelar atendimento?',
                          () =>
                            api.patch(
                              `/appointments/${selectedFresh.id}/status`,
                              { status: 'CANCELLED' },
                            ),
                          'Recebimentos existentes permanecem registrados. Faça o estorno na comanda se necessário.',
                        )
                      }
                    >
                      Cancelar
                    </button>
                    <button
                      className={buttonClass}
                      onClick={() =>
                        confirm('Registrar ausência?', () =>
                          api.patch(
                            `/appointments/${selectedFresh.id}/status`,
                            { status: 'NO_SHOW' },
                          ),
                        )
                      }
                    >
                      Faltou
                    </button>
                  </>
                )}
                {selectedFresh.status === 'COMPLETED' && (
                  <button
                    className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white"
                    onClick={() => book(selectedFresh)}
                  >
                    Agendar retorno
                  </button>
                )}
              </>
            )}
            <button
              className={buttonClass}
              onClick={() => technical(selectedFresh)}
            >
              Nova ficha técnica
            </button>
            <button
              className={buttonClass}
              onClick={async () => {
                try {
                  setRecords(
                    (
                      await api.get(
                        `/operations/clients/${selectedFresh.client.id}/records`,
                      )
                    ).data,
                  )
                } catch {
                  setNotice('Não foi possível carregar as fichas.')
                }
              }}
            >
              Ver histórico técnico
            </button>
          </div>
          {records && (
            <div className="space-y-3">
              {records.map((r) => (
                <article
                  key={r.id}
                  className="bg-zinc-50 rounded-xl p-4 text-sm space-y-2"
                >
                  <p className="font-semibold">
                    {new Date(r.createdAt).toLocaleString('pt-BR')}
                  </p>
                  {r.formula && <p>Fórmula: {r.formula}</p>}
                  {r.products && <p>Produtos: {r.products}</p>}
                  {r.preferences && <p>Preferências: {r.preferences}</p>}
                  {r.notes && <p>{r.notes}</p>}
                  {r.photoUrls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block underline"
                    >
                      Abrir foto autorizada
                    </a>
                  ))}
                </article>
              ))}
              {!records.length && (
                <p className="text-sm text-zinc-500">
                  Nenhuma ficha registrada.
                </p>
              )}
            </div>
          )}
          {isStaff && <AppointmentExtras appointment={selectedFresh} />}
          {isStaff && (
            <div className="border-t pt-4 space-y-3">
              <h3 className="font-semibold">Comanda</h3>
              <p className="text-sm">
                Serviços: {money(selectedFresh.totalPrice)} · Desconto:{' '}
                {money(selectedFresh.discount)}
                {Number(selectedFresh.subscriptionCovered) > 0 &&
                  ` · Assinatura: −${money(Number(selectedFresh.subscriptionCovered))}`}{' '}
                · Recebido:{' '}
                {money(
                  selectedFresh.payments
                    .filter((p) => !p.refundedAt)
                    .reduce((sum, p) => sum + Number(p.amount), 0),
                )}
              </p>
              {selectedFresh.items.map((i) => (
                <p key={i.id} className="text-sm flex justify-between">
                  {i.quantity} × {i.description} ·{' '}
                  {money(Number(i.unitPrice) * i.quantity)}
                  <button
                    className="underline"
                    onClick={() =>
                      confirm('Remover item e devolver ao estoque?', () =>
                        api.delete(
                          `/operations/orders/${selectedFresh.id}/items/${i.id}`,
                        ),
                      )
                    }
                  >
                    Remover
                  </button>
                </p>
              ))}
              <p className="font-bold">
                Saldo:{' '}
                {money(balance)}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className={buttonClass}
                  onClick={() =>
                    setForm({
                      title: 'Registrar recebimento',
                      description:
                        'Permite sinal e pagamentos divididos. Este registro não cobra o cartão nem gera Pix automaticamente.',
                      fields: [
                        {
                          key: 'amount',
                          label: 'Valor recebido',
                          type: 'number',
                          value: balance > 0 ? balance.toFixed(2) : undefined,
                        },
                        {
                          key: 'method',
                          label: 'Forma de pagamento',
                          options: [
                            { id: 'PIX', name: 'Pix' },
                            { id: 'CASH', name: 'Dinheiro' },
                            { id: 'CREDIT_CARD', name: 'Crédito' },
                            { id: 'DEBIT_CARD', name: 'Débito' },
                          ],
                        },
                      ],
                      submit: (v) =>
                        api.post('/finances/payments', {
                          appointmentId: selectedFresh.id,
                          amount: Number(v.amount),
                          method: v.method,
                        }),
                    })
                  }
                >
                  Receber sinal / saldo
                </button>
                <button
                  className={buttonClass}
                  onClick={() =>
                    setForm({
                      title: 'Adicionar produto',
                      fields: [
                        {
                          key: 'productId',
                          label: 'Produto',
                          options: products,
                        },
                        {
                          key: 'quantity',
                          label: 'Quantidade',
                          type: 'number',
                          value: 1,
                        },
                      ],
                      submit: (v) =>
                        api.post(
                          `/operations/orders/${selectedFresh.id}/items`,
                          {
                            productId: v.productId,
                            quantity: Number(v.quantity),
                          },
                        ),
                    })
                  }
                >
                  Vender produto
                </button>
                <button
                  className={buttonClass}
                  onClick={() =>
                    setForm({
                      title: 'Desconto nos serviços',
                      fields: [
                        {
                          key: 'discount',
                          label: 'Valor do desconto',
                          type: 'number',
                          value: selectedFresh.discount,
                        },
                      ],
                      submit: (v) =>
                        api.patch(
                          `/operations/orders/${selectedFresh.id}/discount`,
                          { discount: Number(v.discount) },
                        ),
                    })
                  }
                >
                  Desconto
                </button>
              </div>
              {selectedFresh.payments.map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between text-sm border-t pt-2"
                >
                  <p>
                    {p.method} · {money(p.amount)}{' '}
                    {p.refundedAt ? '· Estornado' : ''}
                  </p>
                  {!p.refundedAt && (
                    <button
                      className="underline text-red-700"
                      onClick={() =>
                        setForm({
                          title: 'Estornar recebimento',
                          description:
                            'O registro fica no histórico. A devolução do dinheiro deve ser feita no meio de pagamento original.',
                          fields: [{ key: 'reason', label: 'Motivo do estorno' }],
                          submit: (v) =>
                            api.delete(`/finances/payments/${p.id}`, {
                              data: { reason: v.reason },
                            }),
                        })
                      }
                    >
                      Estornar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.section>
      )}
      </AnimatePresence>
      {form && (
        <ActionForm spec={form} close={() => setForm(null)} saved={saved} />
      )}
    </div>
  )
}
