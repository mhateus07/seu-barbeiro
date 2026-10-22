import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Copy,
  Crown,
  Pencil,
  Plus,
  Repeat,
  Search,
  Send,
  Users,
  Wallet,
} from 'lucide-react'
import {
  cancelSubscription,
  createSubscription,
  listPlans,
  listSubscriptions,
  payManually,
  resendPix,
  savePlan,
  type Plan,
  type Subscription,
} from '../../api/subscriptions.api'
import { listServices } from '../../api/services.api'
import { listClients } from '../../api/clients.api'
import { useAuth } from '../../contexts/auth-state'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Skeleton } from '../../components/ui/Skeleton'
import { formatCurrency } from '../../utils/formatCurrency'
import { formatDate } from '../../utils/formatDate'
import { formatPhone } from '../../utils/formatPhone'

const statusInfo: Record<Subscription['status'], { label: string; tone: string }> = {
  ACTIVE: { label: 'Ativa', tone: 'bg-emerald-50 text-emerald-700' },
  PENDING: { label: 'Aguardando 1º pagamento', tone: 'bg-amber-50 text-amber-700' },
  PAST_DUE: { label: 'Em atraso', tone: 'bg-red-50 text-red-700' },
  CANCELLED: { label: 'Cancelada', tone: 'bg-zinc-100 text-zinc-600' },
}
const chargeLabels: Record<string, string> = {
  PENDING: 'pendente',
  PAID: 'paga',
  EXPIRED: 'expirada',
  CANCELLED: 'cancelada',
}
const errorMessage = (error: unknown) =>
  (isAxiosError(error) && error.response?.data?.error?.message) ||
  'Não foi possível concluir.'

type PlanForm = {
  id?: string
  name: string
  description: string
  price: string
  usesPerCycle: string
  serviceIds: string[]
}
const emptyPlan: PlanForm = { name: '', description: '', price: '', usesPerCycle: '', serviceIds: [] }

export function SubscriptionsPage() {
  const { admin } = useAuth()
  const isOwner = admin?.role === 'OWNER'
  const qc = useQueryClient()
  const { data: plans = [], isLoading: loadingPlans } = useQuery({
    queryKey: ['plans'],
    queryFn: listPlans,
  })
  const { data: subs = [], isLoading } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: listSubscriptions,
  })
  const { data: services = [] } = useQuery({
    queryKey: ['services', 'active'],
    queryFn: () => listServices(true),
  })
  const [planForm, setPlanForm] = useState<PlanForm | null>(null)
  const [newSub, setNewSub] = useState(false)
  const [manual, setManual] = useState<{ chargeId: string; client: string } | null>(null)
  const [filter, setFilter] = useState<'all' | Subscription['status']>('all')
  const refresh = () => qc.invalidateQueries({ queryKey: ['subscriptions'] })

  const plan = useMutation({
    mutationFn: (form: PlanForm) =>
      savePlan({
        id: form.id,
        name: form.name,
        description: form.description || undefined,
        price: Number(form.price),
        usesPerCycle: form.usesPerCycle ? Number(form.usesPerCycle) : null,
        serviceIds: form.serviceIds,
      }),
    onSuccess: () => {
      toast.success('Plano salvo.')
      setPlanForm(null)
      void qc.invalidateQueries({ queryKey: ['plans'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const togglePlan = useMutation({
    mutationFn: (p: Plan) => savePlan({ id: p.id, isActive: !p.isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['plans'] }),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const cancel = useMutation({
    mutationFn: cancelSubscription,
    onSuccess: () => {
      toast.success('Assinatura cancelada. O cliente usa até o fim do período pago.')
      void refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const resend = useMutation({
    mutationFn: resendPix,
    onSuccess: async (r) => {
      try {
        await navigator.clipboard.writeText(r.link)
        toast.success('Pix gerado e enviado. Link copiado.')
      } catch {
        toast.success('Pix gerado e enviado pelo WhatsApp.')
      }
      void refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const pay = useMutation({
    mutationFn: ({ chargeId, method }: { chargeId: string; method: string }) =>
      payManually(chargeId, method),
    onSuccess: () => {
      toast.success('Pagamento registrado.')
      setManual(null)
      void refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const metrics = useMemo(() => {
    const active = subs.filter((s) => s.status === 'ACTIVE')
    return {
      active: active.length,
      mrr: active.reduce((sum, s) => sum + Number(s.priceSnapshot), 0),
      late: subs.filter((s) => s.status === 'PAST_DUE').length,
      pending: subs.filter((s) => s.status === 'PENDING').length,
    }
  }, [subs])
  const shown = subs.filter((s) => filter === 'all' || s.status === filter)
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? 'Serviço'

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-zinc-900 md:text-3xl">
            Assinaturas
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Clube do corte: o cliente paga por mês e usa no salão. Cobrança por Pix pelo WhatsApp.
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          {isOwner && (
            <Button variant="ghost" className="border border-zinc-200 bg-white" onClick={() => setPlanForm(emptyPlan)}>
              <Crown className="h-4 w-4 text-amber-500" /> Novo plano
            </Button>
          )}
          <Button onClick={() => setNewSub(true)} disabled={!plans.some((p) => p.isActive)}>
            <Plus className="h-4 w-4" /> Nova assinatura
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: 'Assinantes ativos', value: metrics.active, icon: Users, tone: 'bg-emerald-100 text-emerald-700' },
          { label: 'Receita recorrente / mês', value: formatCurrency(metrics.mrr), icon: Wallet, tone: 'bg-amber-100 text-amber-700' },
          { label: 'Em atraso', value: metrics.late, icon: AlertTriangle, tone: 'bg-red-100 text-red-700' },
          { label: 'Aguardando 1º pagamento', value: metrics.pending, icon: Repeat, tone: 'bg-sky-100 text-sky-700' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-soft sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium leading-tight text-zinc-500 sm:text-sm">{label}</p>
              <span className={`hidden h-9 w-9 shrink-0 place-items-center rounded-xl sm:grid ${tone}`}>
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="tabular mt-2 truncate font-display text-xl font-bold text-zinc-900 sm:text-2xl">{value}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Planos</h2>
        {loadingPlans ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : plans.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((p) => (
              <article
                key={p.id}
                className={`relative overflow-hidden rounded-2xl border p-5 shadow-soft ${p.isActive ? 'border-zinc-200 bg-white' : 'border-dashed border-zinc-300 bg-zinc-50 opacity-70'}`}
              >
                                <div className="relative">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-lg font-bold text-zinc-900">{p.name}</p>
                    {isOwner && (
                      <button
                        aria-label="Editar plano"
                        onClick={() =>
                          setPlanForm({
                            id: p.id,
                            name: p.name,
                            description: p.description ?? '',
                            price: String(Number(p.price)),
                            usesPerCycle: p.usesPerCycle ? String(p.usesPerCycle) : '',
                            serviceIds: p.serviceIds,
                          })
                        }
                        className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <p className="tabular mt-1 font-display text-3xl font-extrabold text-amber-600">
                    {formatCurrency(Number(p.price))}
                    <span className="text-sm font-medium text-zinc-400">/mês</span>
                  </p>
                  <p className="mt-2 text-sm text-zinc-600">
                    {p.usesPerCycle ? `${p.usesPerCycle} uso(s) por mês` : 'Uso ilimitado'} ·{' '}
                    {p.serviceIds.length ? p.serviceIds.map(serviceName).join(', ') : 'todos os serviços'}
                  </p>
                  {p.description && <p className="mt-1 text-xs text-zinc-500">{p.description}</p>}
                  <p className="mt-3 text-xs text-zinc-400">
                    {subs.filter((s) => s.plan.id === p.id && s.status === 'ACTIVE').length} assinante(s) ativo(s)
                  </p>
                  {isOwner && (
                    <button
                      onClick={() => togglePlan.mutate(p)}
                      className="mt-3 text-xs font-semibold text-zinc-500 hover:text-zinc-900"
                    >
                      {p.isActive ? 'Pausar vendas do plano' : 'Reativar plano'}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
            <Crown className="mx-auto h-8 w-8 text-amber-500" />
            <p className="mt-2 font-semibold text-zinc-800">Crie seu primeiro plano</p>
            <p className="mt-1 text-sm text-zinc-500">
              Ex.: "Clube Corte" por R$ 79,90 com 4 cortes no mês.
              {!isOwner && ' Peça ao dono do salão para cadastrar.'}
            </p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-800">Assinantes</h2>
          <div className="flex gap-1 rounded-xl bg-zinc-100 p-0.5 text-xs">
            {(['all', 'ACTIVE', 'PAST_DUE', 'PENDING', 'CANCELLED'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-2.5 py-1 font-medium ${filter === f ? 'bg-white text-zinc-900 shadow-soft' : 'text-zinc-500'}`}
              >
                {f === 'all' ? 'Todas' : statusInfo[f].label.replace(' 1º pagamento', '')}
              </button>
            ))}
          </div>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : shown.length ? (
          <ul className="divide-y divide-zinc-100">
            {shown.map((s) => {
              const charge = s.charges.find((c) => c.status === 'PENDING') ?? s.charges[0]
              return (
                <li key={s.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100 font-bold text-amber-700">
                      {s.client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-zinc-900">{s.client.name}</p>
                      <p className="text-xs text-zinc-500">
                        {s.plan.name} · {formatCurrency(Number(s.priceSnapshot))}/mês
                        {s.currentPeriodEnd && ` · válido até ${formatDate(s.currentPeriodEnd)}`}
                        {s.plan.usesPerCycle && s.status !== 'PENDING'
                          ? ` · ${s.uses}/${s.plan.usesPerCycle} usos`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusInfo[s.status].tone}`}>
                      {statusInfo[s.status].label}
                    </span>
                    {charge && charge.status === 'PENDING' && s.status !== 'CANCELLED' && (
                      <>
                        <span className="text-xs text-zinc-500">
                          Mensalidade {formatDate(charge.periodStart)} {chargeLabels[charge.status]}
                        </span>
                        {charge.pix?.status === 'PENDING' && (
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(charge.pix!.link)
                                toast.success('Link do Pix copiado.')
                              } catch {
                                toast.error('Não foi possível copiar.')
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-amber-400"
                          >
                            <Copy className="h-3 w-3" /> Link Pix
                          </button>
                        )}
                        <button
                          onClick={() => resend.mutate(charge.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-amber-400"
                        >
                          <Send className="h-3 w-3" /> {charge.pix?.status === 'PENDING' ? 'Reenviar' : 'Gerar Pix'}
                        </button>
                        <button
                          onClick={() => setManual({ chargeId: charge.id, client: s.client.name })}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Recebi
                        </button>
                      </>
                    )}
                    {s.status !== 'CANCELLED' && (
                      <button
                        aria-label="Cancelar assinatura"
                        title="Cancelar assinatura"
                        onClick={() => {
                          if (window.confirm(`Cancelar a assinatura de ${s.client.name}?`)) cancel.mutate(s.id)
                        }}
                        className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-zinc-400">Nenhuma assinatura aqui.</p>
        )}
      </section>

      <Modal open={!!planForm} onClose={() => setPlanForm(null)} title={planForm?.id ? 'Editar plano' : 'Novo plano'} size="md">
        {planForm && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              plan.mutate(planForm)
            }}
          >
            <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-600">
              Nome do plano
              <Input
                required
                minLength={2}
                value={planForm.name}
                onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                placeholder="Ex.: Clube Corte"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-600">
                Valor mensal (R$)
                <Input
                  required
                  type="number"
                  min="1"
                  step="0.01"
                  value={planForm.price}
                  onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-600">
                Usos por mês
                <Input
                  type="number"
                  min="1"
                  max="100"
                  placeholder="Ilimitado"
                  value={planForm.usesPerCycle}
                  onChange={(e) => setPlanForm({ ...planForm, usesPerCycle: e.target.value })}
                />
              </label>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-zinc-600">
                Serviços incluídos <span className="text-zinc-400">(nenhum marcado = todos)</span>
              </legend>
              <div className="grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2">
                {services.map((svc) => (
                  <label key={svc.id} className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={planForm.serviceIds.includes(svc.id)}
                      onChange={(e) =>
                        setPlanForm({
                          ...planForm,
                          serviceIds: e.target.checked
                            ? [...planForm.serviceIds, svc.id]
                            : planForm.serviceIds.filter((id) => id !== svc.id),
                        })
                      }
                    />
                    {svc.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-600">
              Descrição (opcional)
              <Input
                value={planForm.description}
                onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                placeholder="Ex.: válido de segunda a quinta"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setPlanForm(null)}>
                Cancelar
              </Button>
              <Button type="submit" loading={plan.isPending}>
                Salvar plano
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {newSub && (
        <NewSubscriptionModal
          plans={plans.filter((p) => p.isActive)}
          onClose={() => setNewSub(false)}
          onCreated={() => {
            setNewSub(false)
            void refresh()
          }}
        />
      )}

      <Modal open={!!manual} onClose={() => setManual(null)} title="Registrar pagamento da mensalidade" size="sm">
        {manual && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">
              Como {manual.client} pagou? O Pix aberto, se houver, é cancelado.
            </p>
            {[
              ['CASH', 'Dinheiro'],
              ['PIX', 'Pix (fora do sistema)'],
              ['DEBIT_CARD', 'Cartão de débito'],
              ['CREDIT_CARD', 'Cartão de crédito'],
            ].map(([method, label]) => (
              <button
                key={method}
                disabled={pay.isPending}
                onClick={() => pay.mutate({ chargeId: manual.chargeId, method })}
                className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-left text-sm font-medium text-zinc-800 hover:border-amber-400 disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

function NewSubscriptionModal({
  plans,
  onClose,
  onCreated,
}: {
  plans: Plan[]
  onClose: () => void
  onCreated: () => void
}) {
  const [search, setSearch] = useState('')
  const [client, setClient] = useState<{ id: string; name: string } | null>(null)
  const [planId, setPlanId] = useState(plans[0]?.id ?? '')
  const [startsAt, setStartsAt] = useState(new Date().toLocaleDateString('sv-SE'))
  const { data: results } = useQuery({
    queryKey: ['clients-search', search],
    queryFn: () => listClients(search, 1, 8),
    enabled: search.trim().length >= 2 && !client,
  })
  const create = useMutation({
    mutationFn: () => createSubscription({ clientId: client!.id, planId, startsAt }),
    onSuccess: () => {
      toast.success('Assinatura criada. A cobrança Pix foi enviada ao cliente.')
      onCreated()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <Modal open onClose={onClose} title="Nova assinatura">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (client) create.mutate()
        }}
      >
        <div className="flex flex-col gap-1.5 text-xs font-medium text-zinc-600">
          Cliente
          {client ? (
            <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-zinc-900">
              {client.name}
              <button type="button" className="text-xs font-semibold text-amber-700" onClick={() => setClient(null)}>
                Trocar
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  autoFocus
                  className="w-full pl-9"
                  placeholder="Buscar por nome ou telefone"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {results?.data.length ? (
                <ul className="max-h-48 overflow-y-auto rounded-xl border border-zinc-200">
                  {results.data.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setClient({ id: c.id, name: c.name })}
                        className="w-full px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-50"
                      >
                        {c.name} <span className="text-xs text-zinc-400">{formatPhone(c.phone)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : search.trim().length >= 2 ? (
                <p className="text-xs text-zinc-400">Nenhum cliente encontrado. Cadastre em Clientes.</p>
              ) : null}
            </>
          )}
        </div>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-600">
          Plano
          <select
            required
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatCurrency(Number(p.price))}/mês
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-600">
          Início
          <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </label>
        <p className="rounded-xl bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-500">
          A assinatura fica ativa quando a primeira mensalidade for paga, por Pix ou
          registrando o pagamento em "Recebi".
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!client} loading={create.isPending}>
            Criar assinatura
          </Button>
        </div>
      </form>
    </Modal>
  )
}
