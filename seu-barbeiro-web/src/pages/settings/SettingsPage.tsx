import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings,
  Clock,
  Star,
  MessageCircle,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Send,
  Loader2,
  QrCode,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { isAxiosError } from 'axios'
import { PaymentsTab } from './PaymentsTab'
import { SecurityTab } from './SecurityTab'
import { getSettings, updateSettings } from '../../api/settings.api'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'

type Tab = 'info' | 'hours' | 'loyalty' | 'whatsapp' | 'payments' | 'security'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'info', label: 'Informações', icon: Settings },
  { id: 'hours', label: 'Horários', icon: Clock },
  { id: 'loyalty', label: 'Fidelidade', icon: Star },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'payments', label: 'Pix e cliente', icon: QrCode },
  { id: 'security', label: 'Segurança', icon: ShieldCheck },
]

const DAYS = [
  { key: 'monday', label: 'Segunda-feira' },
  { key: 'tuesday', label: 'Terça-feira' },
  { key: 'wednesday', label: 'Quarta-feira' },
  { key: 'thursday', label: 'Quinta-feira' },
  { key: 'friday', label: 'Sexta-feira' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
]

function parseHours(value: string): {
  open: string
  close: string
  closed: boolean
} {
  if (!value || value === 'closed')
    return { open: '08:00', close: '18:00', closed: true }
  const [open, close] = value.split('-')
  return { open: open ?? '08:00', close: close ?? '18:00', closed: false }
}

// ─── TAB: INFORMAÇÕES ────────────────────────────────────────────────────────

function InfoTab({
  settings,
  onSave,
}: {
  settings: Record<string, string>
  onSave: (s: Record<string, string>) => void
}) {
  const [form, setForm] = useState({
    shop_name: settings.shop_name ?? '',
    shop_segment: settings.shop_segment ?? 'barbershop',
    shop_logo: settings.shop_logo ?? '',
    shop_description: settings.shop_description ?? '',
    shop_phone: settings.shop_phone ?? '',
    shop_address: settings.shop_address ?? '',
    shop_instagram: settings.shop_instagram ?? '',
  })

  return (
    <div className="space-y-5 max-w-xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5 col-span-2">
          <label htmlFor="shop-segment" className="text-xs font-medium text-zinc-600">
            Tipo de estabelecimento
          </label>
          <select
            id="shop-segment"
            value={form.shop_segment}
            onChange={(e) => setForm({ ...form, shop_segment: e.target.value })}
            className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
          >
            <option value="beauty">Salão de beleza (marca Belaza)</option>
            <option value="barbershop">Barbearia (marca Seu Barbeiro)</option>
          </select>
          <p className="text-xs text-zinc-500">
            Muda a marca, as cores e os textos do painel e das páginas que o cliente abre.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 col-span-2">
          <label className="text-xs font-medium text-zinc-600">
            {form.shop_segment === 'beauty' ? 'Nome do salão' : 'Nome da barbearia'}
          </label>
          <Input
            value={form.shop_name}
            onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
            placeholder="Nome do salão"
          />
          <label className="block text-sm mt-3">Logo (URL HTTPS)</label>
          <Input
            value={form.shop_logo}
            onChange={(e) => setForm({ ...form, shop_logo: e.target.value })}
            placeholder="https://..."
          />
          <label className="block text-sm mt-3">Descrição pública</label>
          <Input
            value={form.shop_description}
            onChange={(e) =>
              setForm({ ...form, shop_description: e.target.value })
            }
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-600">
            Telefone / WhatsApp
          </label>
          <Input
            value={form.shop_phone}
            onChange={(e) => setForm({ ...form, shop_phone: e.target.value })}
            placeholder="(32) 99160-8852"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-600">Instagram</label>
          <Input
            value={form.shop_instagram}
            onChange={(e) =>
              setForm({ ...form, shop_instagram: e.target.value })
            }
            placeholder="@usuario"
          />
        </div>
        <div className="flex flex-col gap-1.5 col-span-2">
          <label className="text-xs font-medium text-zinc-600">Endereço</label>
          <Input
            value={form.shop_address}
            onChange={(e) => setForm({ ...form, shop_address: e.target.value })}
            placeholder="Rua, número, bairro, cidade"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onSave(form)}>
          <Save className="h-4 w-4 mr-1.5" />
          Salvar informações
        </Button>
      </div>
    </div>
  )
}

// ─── TAB: HORÁRIOS ───────────────────────────────────────────────────────────

function HoursTab({
  settings,
  onSave,
}: {
  settings: Record<string, string>
  onSave: (s: Record<string, string>) => void
}) {
  const [hours, setHours] = useState(() => {
    const result: Record<
      string,
      { open: string; close: string; closed: boolean }
    > = {}
    for (const day of DAYS) {
      result[day.key] = parseHours(settings[`hours_${day.key}`] ?? '')
    }
    return result
  })

  function handleSave() {
    const out: Record<string, string> = {}
    for (const day of DAYS) {
      const h = hours[day.key]
      out[`hours_${day.key}`] = h.closed ? 'closed' : `${h.open}-${h.close}`
    }
    onSave(out)
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">
                Dia
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-500 uppercase">
                Fechado
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-500 uppercase">
                Abertura
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-500 uppercase">
                Fechamento
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {DAYS.map((day) => {
              const h = hours[day.key]
              return (
                <tr key={day.key} className="hover:bg-zinc-50/50">
                  <td className="px-4 py-3 font-medium text-zinc-700">
                    {day.label}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={h.closed}
                      onChange={(e) =>
                        setHours({
                          ...hours,
                          [day.key]: { ...h, closed: e.target.checked },
                        })
                      }
                      className="h-4 w-4 rounded-sm accent-amber-500"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="time"
                      value={h.open}
                      disabled={h.closed}
                      onChange={(e) =>
                        setHours({
                          ...hours,
                          [day.key]: { ...h, open: e.target.value },
                        })
                      }
                      className="rounded-lg border border-zinc-200 px-2 py-1 text-sm text-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-amber-400 disabled:opacity-40"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="time"
                      value={h.close}
                      disabled={h.closed}
                      onChange={(e) =>
                        setHours({
                          ...hours,
                          [day.key]: { ...h, close: e.target.value },
                        })
                      }
                      className="rounded-lg border border-zinc-200 px-2 py-1 text-sm text-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-amber-400 disabled:opacity-40"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-1.5" />
          Salvar horários
        </Button>
      </div>
    </div>
  )
}

// ─── TAB: FIDELIDADE ─────────────────────────────────────────────────────────

function LoyaltyTab({
  settings,
  onSave,
}: {
  settings: Record<string, string>
  onSave: (s: Record<string, string>) => void
}) {
  const [form, setForm] = useState({
    loyalty_enabled: settings.loyalty_enabled ?? 'true',
    loyalty_points_per_visit: settings.loyalty_points_per_visit ?? '10',
    loyalty_redemption_points: settings.loyalty_redemption_points ?? '100',
    loyalty_redemption_value: settings.loyalty_redemption_value ?? '10',
  })

  const redemptionRatio =
    Number(form.loyalty_redemption_points) > 0
      ? (
          Number(form.loyalty_redemption_value) /
          Number(form.loyalty_redemption_points)
        ).toFixed(2)
      : '0'

  return (
    <div className="space-y-5 max-w-xl">
      {/* Toggle */}
      <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-5 py-4">
        <div>
          <p className="font-medium text-zinc-800">Programa de fidelidade</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Clientes acumulam pontos a cada atendimento concluído
          </p>
        </div>
        <button
          onClick={() =>
            setForm({
              ...form,
              loyalty_enabled:
                form.loyalty_enabled === 'true' ? 'false' : 'true',
            })
          }
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.loyalty_enabled === 'true' ? 'bg-amber-500' : 'bg-zinc-300'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${form.loyalty_enabled === 'true' ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      </div>

      {/* Config */}
      <div
        className={`space-y-4 ${form.loyalty_enabled !== 'true' ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-600">
            Pontos por atendimento concluído
          </label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="1"
              value={form.loyalty_points_per_visit}
              onChange={(e) =>
                setForm({ ...form, loyalty_points_per_visit: e.target.value })
              }
              className="max-w-[120px]"
            />
            <span className="text-sm text-zinc-500">pontos</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600">
              Pontos para resgate
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                value={form.loyalty_redemption_points}
                onChange={(e) =>
                  setForm({
                    ...form,
                    loyalty_redemption_points: e.target.value,
                  })
                }
              />
              <span className="text-sm text-zinc-500">pts</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600">
              Valor do resgate (R$)
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.loyalty_redemption_value}
                onChange={(e) =>
                  setForm({ ...form, loyalty_redemption_value: e.target.value })
                }
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm">
          <p className="font-medium text-amber-800">Resumo do programa:</p>
          <ul className="mt-1.5 space-y-1 text-amber-700 text-xs">
            <li>
              Cliente ganha{' '}
              <strong>{form.loyalty_points_per_visit} pontos</strong> por
              atendimento
            </li>
            <li>
              A cada <strong>{form.loyalty_redemption_points} pontos</strong>{' '}
              acumulados, pode resgatar{' '}
              <strong>R$ {form.loyalty_redemption_value}</strong>
            </li>
            <li>
              Cada ponto equivale a <strong>R$ {redemptionRatio}</strong>
            </li>
          </ul>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => onSave(form)}>
          <Save className="h-4 w-4 mr-1.5" />
          Salvar fidelidade
        </Button>
      </div>
    </div>
  )
}

// ─── TAB: WHATSAPP ───────────────────────────────────────────────────────────

function WhatsAppTab({
  settings,
  onSave,
}: {
  settings: Record<string, string>
  onSave: (s: Record<string, string>) => void
}) {
  const [form, setForm] = useState({
    whatsapp_enabled: settings.whatsapp_enabled ?? 'false',
    whatsapp_api_url: settings.whatsapp_api_url ?? '',
    // A chave nunca volta do servidor; em branco mantém a que já está salva.
    whatsapp_api_key: '',
    whatsapp_instance: settings.whatsapp_instance ?? '',
    whatsapp_reminder_hours: settings.whatsapp_reminder_hours ?? '24',
  })

  const [testPhone, setTestPhone] = useState('')
  const [testMsg, setTestMsg] = useState(
    'Olá! Esta é uma mensagem de teste do nosso salão.',
  )
  const [testResult, setTestResult] = useState<{
    sent: boolean
    queued?: boolean
    error?: string
  } | null>(null)
  const [testLoading, setTestLoading] = useState(false)

  const [reminderResult, setReminderResult] = useState<{
    sent: number
    failed: number
    queued: number
  } | null>(null)
  const [reminderLoading, setReminderLoading] = useState(false)

  async function handleTest() {
    if (!testPhone) return
    setTestLoading(true)
    setTestResult(null)
    try {
      const { sendCustomNotification } = await import(
        '../../api/notifications.api'
      )
      const result = await sendCustomNotification({
        phone: testPhone,
        message: testMsg,
      })
      setTestResult({
        sent: result.sent,
        queued: result.queued,
        error: result.error,
      })
    } catch (err) {
      setTestResult({ sent: false, error: (err as Error).message })
    } finally {
      setTestLoading(false)
    }
  }

  async function handleSendReminders() {
    setReminderLoading(true)
    setReminderResult(null)
    try {
      const { sendReminders } = await import('../../api/notifications.api')
      const result = await sendReminders()
      setReminderResult(result)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setReminderLoading(false)
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      {/* Toggle */}
      <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-5 py-4">
        <div>
          <p className="font-medium text-zinc-800">Notificações via WhatsApp</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Enviar lembretes e confirmações automaticamente
          </p>
        </div>
        <button
          onClick={() =>
            setForm({
              ...form,
              whatsapp_enabled:
                form.whatsapp_enabled === 'true' ? 'false' : 'true',
            })
          }
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.whatsapp_enabled === 'true' ? 'bg-green-500' : 'bg-zinc-300'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${form.whatsapp_enabled === 'true' ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      </div>

      {/* Info Evolution API */}
      <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700">
        <p className="font-semibold mb-1">Compatível com Evolution API</p>
        <p>
          Configure sua instância da Evolution API (ou Z-API). A URL deve ser o
          endereço base, ex: <code>https://api.seudominio.com</code>
        </p>
      </div>

      <div
        className={`space-y-4 ${form.whatsapp_enabled !== 'true' ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-600">
            URL da API
          </label>
          <Input
            value={form.whatsapp_api_url}
            onChange={(e) =>
              setForm({ ...form, whatsapp_api_url: e.target.value })
            }
            placeholder="https://api.seudominio.com"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600">
              Chave da API (Bearer Token)
            </label>
            <Input
              type="password"
              value={form.whatsapp_api_key}
              onChange={(e) =>
                setForm({ ...form, whatsapp_api_key: e.target.value })
              }
              placeholder={
                settings.whatsapp_api_key_set === 'true'
                  ? 'Salva. Em branco para manter'
                  : 'sua-chave-secreta'
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600">
              Nome da instância
            </label>
            <Input
              value={form.whatsapp_instance}
              onChange={(e) =>
                setForm({ ...form, whatsapp_instance: e.target.value })
              }
              placeholder="meu-salao"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-600">
            Horas de antecedência para lembrete
          </label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="1"
              max="72"
              value={form.whatsapp_reminder_hours}
              onChange={(e) =>
                setForm({ ...form, whatsapp_reminder_hours: e.target.value })
              }
              className="max-w-[100px]"
            />
            <span className="text-sm text-zinc-500">
              horas antes do agendamento
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => {
            const { whatsapp_api_key, ...rest } = form
            onSave(whatsapp_api_key ? form : rest)
          }}
        >
          <Save className="h-4 w-4 mr-1.5" />
          Salvar WhatsApp
        </Button>
      </div>

      {/* Teste + Lembretes */}
      {form.whatsapp_enabled === 'true' && (
        <div className="space-y-4 pt-2 border-t border-zinc-100">
          <p className="text-sm font-semibold text-zinc-700">Testar envio</p>
          <div className="flex gap-2">
            <Input
              placeholder="Telefone (ex: 32991608852)"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="flex-1"
            />
          </div>
          <textarea
            value={testMsg}
            onChange={(e) => setTestMsg(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-amber-400 resize-none"
          />
          {testResult && (
            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${testResult.sent || testResult.queued ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
            >
              {testResult.sent ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {testResult.queued
                ? 'Mensagem na fila. Consulte o histórico para acompanhar o envio.'
                : testResult.sent
                  ? 'Mensagem enviada com sucesso!'
                  : `Erro: ${testResult.error}`}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              onClick={handleTest}
              disabled={testLoading || !testPhone}
              variant="secondary"
            >
              {testLoading ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1.5" />
              )}
              Enviar teste
            </Button>
            <Button
              onClick={handleSendReminders}
              disabled={reminderLoading}
              variant="secondary"
            >
              {reminderLoading ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1.5" />
              )}
              Enviar lembretes agora
            </Button>
          </div>
          {reminderResult && (
            <p className="text-sm text-zinc-600">
              Lembretes na janela de envio:{' '}
              <strong>{reminderResult.queued}</strong>. Acompanhe o resultado no
              histórico.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('info')
  const [savedMsg, setSavedMsg] = useState(false)

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })

  const saveMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      // Nome, logo e segmento aparecem na barra lateral e trocam a marca.
      qc.invalidateQueries({ queryKey: ['identity'] })
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 3000)
    },
    onError: (error) =>
      toast.error(
        (isAxiosError(error) && error.response?.data?.error?.message) ||
          'Não foi possível salvar.',
      ),
  })

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  const s = settings ?? {}

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-800 md:text-2xl">Configurações</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Gerencie informações, horários e integrações
          </p>
        </div>
        {savedMsg && (
          <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            Salvo com sucesso!
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-zinc-100 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-2 flex-1 justify-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-zinc-800 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div>
        {activeTab === 'info' && (
          <InfoTab settings={s} onSave={(data) => saveMutation.mutate(data)} />
        )}
        {activeTab === 'hours' && (
          <HoursTab settings={s} onSave={(data) => saveMutation.mutate(data)} />
        )}
        {activeTab === 'loyalty' && (
          <LoyaltyTab
            settings={s}
            onSave={(data) => saveMutation.mutate(data)}
          />
        )}
        {activeTab === 'payments' && (
          <PaymentsTab
            key={s.mp_access_token_set}
            settings={s}
            onSave={(data) => saveMutation.mutate(data)}
          />
        )}
        {activeTab === 'security' && <SecurityTab />}
        {activeTab === 'whatsapp' && (
          <WhatsAppTab
            settings={s}
            onSave={(data) => saveMutation.mutate(data)}
          />
        )}
      </div>
    </div>
  )
}
