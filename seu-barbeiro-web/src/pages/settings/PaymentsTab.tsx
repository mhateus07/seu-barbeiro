import { useState } from 'react'
import { CheckCircle2, ExternalLink, KeyRound, QrCode, Repeat, Link2 } from 'lucide-react'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

const card = 'rounded-2xl border border-zinc-200 bg-white p-5 shadow-soft space-y-4'
const label = 'text-xs font-medium text-zinc-600'
const select =
  'w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-hidden focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15'

export function PaymentsTab({
  settings,
  onSave,
}: {
  settings: Record<string, string>
  onSave: (s: Record<string, string>) => void
}) {
  const configured = settings.mp_access_token_set === 'true'
  const [token, setToken] = useState('')
  const [form, setForm] = useState({
    deposit_mode: settings.deposit_mode ?? 'off',
    deposit_type: settings.deposit_type ?? 'percent',
    deposit_value: settings.deposit_value ?? '30',
    deposit_expire_minutes: settings.deposit_expire_minutes ?? '30',
    client_change_min_hours: settings.client_change_min_hours ?? '2',
    subscription_notice_days: settings.subscription_notice_days ?? '3',
    subscription_grace_days: settings.subscription_grace_days ?? '5',
    booking_min_minutes: settings.booking_min_minutes ?? '30',
    booking_max_days: settings.booking_max_days ?? '60',
    whatsapp_quiet_hours: settings.whatsapp_quiet_hours ?? '21:00-08:00',
    reception_max_discount_percent: settings.reception_max_discount_percent ?? '100',
    professional_can_receive: settings.professional_can_receive ?? 'false',
  })
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  return (
    <div className="max-w-xl space-y-5">
      <section className={card}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-100 text-sky-700">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-zinc-900">Mercado Pago</p>
              <p className="text-xs text-zinc-500">Recebe o sinal e as mensalidades por Pix</p>
            </div>
          </div>
          {configured ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Conectado
            </span>
          ) : (
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
              Não conectado
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={label}>Access Token de produção</label>
          <Input
            type="password"
            autoComplete="off"
            placeholder={configured ? '•••••••• (salvo; cole outro para trocar)' : 'APP_USR-...'}
            value={token}
            onChange={(e) => setToken(e.target.value.trim())}
          />
          <p className="text-xs leading-relaxed text-zinc-500">
            No Mercado Pago: <strong>Seu negócio → Configurações → Credenciais</strong> (ou
            Suas integrações → Credenciais de produção). Copie o <em>Access Token</em>. Ele
            fica guardado só no servidor e não aparece de novo aqui.
          </p>
          <a
            href="https://www.mercadopago.com.br/developers/panel/app"
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-amber-600 hover:underline"
          >
            Abrir credenciais do Mercado Pago <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex gap-2">
          <Button disabled={!token} onClick={() => onSave({ mp_access_token: token })}>
            Salvar token
          </Button>
          {configured && (
            <Button variant="ghost" onClick={() => onSave({ mp_access_token: '' })}>
              Desconectar
            </Button>
          )}
        </div>
      </section>

      <section className={`${card} ${configured ? '' : 'opacity-60'}`}>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700">
            <QrCode className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900">Sinal no agendamento online</p>
            <p className="text-xs text-zinc-500">
              {configured
                ? 'O cliente paga por Pix ao agendar; sem pagamento, o horário é liberado.'
                : 'Conecte o Mercado Pago para ativar.'}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={label}>Quem paga sinal</label>
          <select
            className={select}
            disabled={!configured}
            value={form.deposit_mode}
            onChange={(e) => set('deposit_mode')(e.target.value)}
          >
            <option value="off">Ninguém (desligado)</option>
            <option value="all">Todos os agendamentos online</option>
            <option value="no_show">Só quem faltou nos últimos 12 meses</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={label}>Tipo</label>
            <select
              className={select}
              disabled={!configured}
              value={form.deposit_type}
              onChange={(e) => set('deposit_type')(e.target.value)}
            >
              <option value="percent">Porcentagem do valor</option>
              <option value="fixed">Valor fixo (R$)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={label}>{form.deposit_type === 'percent' ? 'Porcentagem (%)' : 'Valor (R$)'}</label>
            <Input
              type="number"
              min="1"
              step={form.deposit_type === 'percent' ? '1' : '0.01'}
              disabled={!configured}
              value={form.deposit_value}
              onChange={(e) => set('deposit_value')(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={label}>Prazo para pagar (minutos)</label>
          <Input
            type="number"
            min="10"
            max="1440"
            disabled={!configured}
            value={form.deposit_expire_minutes}
            onChange={(e) => set('deposit_expire_minutes')(e.target.value)}
            className="max-w-[140px]"
          />
        </div>
      </section>

      <section className={card}>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-700">
            <Link2 className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900">Link do cliente</p>
            <p className="text-xs text-zinc-500">
              Vai na confirmação e no lembrete do WhatsApp para o cliente confirmar, remarcar ou cancelar.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="0"
            max="72"
            value={form.client_change_min_hours}
            onChange={(e) => set('client_change_min_hours')(e.target.value)}
            className="max-w-[100px]"
          />
          <span className="text-sm text-zinc-600">horas de antecedência mínima para mudanças</span>
        </div>
      </section>

      <section className={card}>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
            <Repeat className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900">Assinaturas</p>
            <p className="text-xs text-zinc-500">Cobrança mensal por Pix enviada pelo WhatsApp</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={label}>Enviar cobrança (dias antes)</label>
            <Input
              type="number"
              min="0"
              max="15"
              value={form.subscription_notice_days}
              onChange={(e) => set('subscription_notice_days')(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={label}>Validade do Pix (dias)</label>
            <Input
              type="number"
              min="1"
              max="30"
              value={form.subscription_grace_days}
              onChange={(e) => set('subscription_grace_days')(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className={card}>
        <div>
          <p className="font-semibold text-zinc-900">Regras do dia a dia</p>
          <p className="text-xs text-zinc-500">
            Janela do agendamento online, horário das mensagens e permissões da equipe.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={label}>Antecedência mínima (minutos)</label>
            <Input
              type="number"
              min="0"
              value={form.booking_min_minutes}
              onChange={(e) => set('booking_min_minutes')(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={label}>Agenda aberta por (dias)</label>
            <Input
              type="number"
              min="1"
              max="730"
              value={form.booking_max_days}
              onChange={(e) => set('booking_max_days')(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={label}>Pausa das mensagens</label>
            <Input
              placeholder="21:00-08:00"
              value={form.whatsapp_quiet_hours}
              onChange={(e) => set('whatsapp_quiet_hours')(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={label}>Desconto máximo da recepção (%)</label>
            <Input
              type="number"
              min="0"
              max="100"
              value={form.reception_max_discount_percent}
              onChange={(e) => set('reception_max_discount_percent')(e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={form.professional_can_receive === 'true'}
            onChange={(e) =>
              set('professional_can_receive')(e.target.checked ? 'true' : 'false')
            }
          />
          Profissional pode lançar recebimento nos próprios atendimentos
        </label>
      </section>

      <div className="flex justify-end">
        <Button onClick={() => onSave(form)}>Salvar configurações</Button>
      </div>
    </div>
  )
}
