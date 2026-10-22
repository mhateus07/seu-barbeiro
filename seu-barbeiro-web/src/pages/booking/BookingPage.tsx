import { PublicWaitlist } from './PublicWaitlist'
import { isAxiosError } from 'axios'
import { useState, useEffect } from 'react'
import {
  Scissors,
  User,
  Calendar,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Phone,
  Mail,
  MessageSquare,
  MapPin,
} from 'lucide-react'
import {
  getPublicInfo,
  getPublicServices,
  getPublicBarbers,
  getAvailableSlots,
  createPublicAppointment,
} from '../../api/public.api'
import type {
  PublicService,
  PublicBarber,
  PublicInfo,
} from '../../api/public.api'
import { formatCurrency } from '../../utils/formatCurrency'
import { PixPanel } from '../../components/public/PixPanel'
import { getSalon } from '../../api/salon'

type Step = 1 | 2 | 3 | 4 | 5 | 6

const STEP_LABELS: Record<number, string> = {
  1: 'Serviços',
  2: 'Profissional',
  3: 'Data & Hora',
  4: 'Seus dados',
  5: 'Confirmar',
}

const DAY_NAMES: Record<string, string> = {
  sunday: 'Dom',
  monday: 'Seg',
  tuesday: 'Ter',
  wednesday: 'Qua',
  thursday: 'Qui',
  friday: 'Sex',
  saturday: 'Sáb',
}

function formatHours(val: string) {
  if (!val || val === 'closed') return 'Fechado'
  return val.replace('-', ' – ')
}

function formatDateBR(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

export function BookingPage() {
  const [step, setStep] = useState<Step>(1)
  const [info, setInfo] = useState<PublicInfo | null>(null)
  const [services, setServices] = useState<PublicService[]>([])
  const [barbers, setBarbers] = useState<PublicBarber[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [selectedBarber, setSelectedBarber] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [slots, setSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [appointment, setAppointment] = useState<{
    id: string
    startsAt: string
    totalPrice: number
    client: { name: string }
    barber: { name: string }
    services: { service: { name: string } }[]
    manageToken?: string
    deposit: { amount: number; payToken: string; expiresAt: string } | null
  } | null>(null)
  const [depositPaid, setDepositPaid] = useState(false)

  useEffect(() => {
    Promise.all([getPublicInfo(), getPublicServices(), getPublicBarbers()])
      .then(([i, s, b]) => {
        setInfo(i)
        setServices(s)
        setBarbers(b)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  const hasSpecialPricing = barbers.some((b) =>
    selectedServices.some(
      (id) =>
        b.serviceOverrides?.[id]?.price !== undefined ||
        b.serviceOverrides?.[id]?.durationMin !== undefined,
    ),
  )
  const totalDuration = selectedServices.reduce((sum, id) => {
    const s = services.find((sv) => sv.id === id)
    return (
      sum +
      ((barbers.find((b) => b.id === selectedBarber)?.serviceOverrides?.[id]
        ?.durationMin ??
        s?.durationMin ??
        0) +
        (s?.processingMin ?? 0) +
        (s?.finishingMin ?? 0))
    )
  }, 0)

  const totalPrice = selectedServices.reduce((sum, id) => {
    const s = services.find((sv) => sv.id === id)
    return (
      sum +
      (s
        ? Number(
            barbers.find((b) => b.id === selectedBarber)?.serviceOverrides?.[id]
              ?.price ?? s.price,
          )
        : 0)
    )
  }, 0)

  function toggleService(id: string) {
    setSelectedBarber('')
    setSelectedTime('')
    setSelectedDate('')
    setSlots([])
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    )
  }

  function handleBarberSelect(id: string) {
    setSelectedBarber(id)
    setSelectedDate('')
    setSelectedTime('')
    setSlots([])
  }

  async function handleDateChange(date: string) {
    setSelectedDate(date)
    setSelectedTime('')
    setSlots([])
    if (!date || !selectedBarber) return
    setLoadingSlots(true)
    try {
      const result = await getAvailableSlots(
        selectedBarber,
        date,
        totalDuration,
        selectedServices,
      )
      setSlots(result)
    } catch {
      setSlots([])
    } finally {
      setLoadingSlots(false)
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError('')
    try {
      const result = await createPublicAppointment({
        outreachToken:
          new URLSearchParams(window.location.search).get('outreach') ||
          undefined,
        clientName,
        clientPhone,
        clientEmail: clientEmail || undefined,
        barberId: selectedBarber,
        serviceIds: selectedServices,
        date: selectedDate,
        time: selectedTime,
        notes: notes || undefined,
      })
      setAppointment(result)
      setStep(6)
    } catch (err: unknown) {
      setSubmitError(
        (isAxiosError(err) && err.response?.data?.message) ||
          'Erro ao criar agendamento. Tente novamente.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const today = new Date().toLocaleDateString('sv-SE')
  const barberName =
    selectedBarber === 'any'
      ? 'Sem preferência'
      : (barbers.find((b) => b.id === selectedBarber)?.name ?? '')

  const canNextStep1 = selectedServices.length > 0
  const canNextStep2 = selectedBarber !== ''
  const canNextStep3 = selectedDate !== '' && selectedTime !== ''
  const canNextStep4 = clientName.trim() !== '' && clientPhone.trim() !== ''

  if (loading) {
    return (
      <div className="on-ink min-h-dvh bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
      </div>
    )
  }

  if (loadError)
    return (
      <main className="on-ink min-h-dvh bg-zinc-950 p-10 text-center text-espuma">
        <p>Não foi possível carregar este salão.</p>
        <button
          className="underline mt-4"
          onClick={() => window.location.reload()}
        >
          Tentar novamente
        </button>
      </main>
    )

  return (
    <div className="on-ink flex min-h-dvh flex-col bg-zinc-950 text-espuma">
      {/* Header */}
      <header className="border-b border-white/10 bg-navalha">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <img
            src={info?.shopLogo || '/favicon.svg'}
            alt="Logo do salão"
            className="h-11 w-11 rounded-xl object-cover ring-1 ring-white/15"
          />
          <div>
            <p className="font-display text-[17px] font-bold leading-tight text-espuma">
              {info?.shopName ?? 'Agendamento online'}
            </p>
          </div>
        </div>
      </header>

      <div className="w-full max-w-2xl mx-auto flex-1 px-4 py-6">
        {/* Step 6 — Sucesso */}
        {step === 6 && appointment?.deposit && !depositPaid && (
          <div className="py-6 animate-pop-in">
            <h2 className="font-display text-2xl font-bold text-white">
              Falta só o sinal
            </h2>
            <p className="mt-1 mb-6 text-zinc-400">
              {appointment.client.name.split(' ')[0]}, seu horário de{' '}
              {formatDateBR(selectedDate)} às {selectedTime} está reservado. Pague o
              sinal de {formatCurrency(appointment.deposit.amount)} para confirmar. O
              valor é descontado no dia do atendimento.
            </p>
            <PixPanel
              token={appointment.deposit.payToken}
              onPaid={() => setDepositPaid(true)}
            />
            <p className="mt-4 text-center text-xs text-zinc-500">
              Sem o pagamento no prazo, o horário é liberado automaticamente.
            </p>
          </div>
        )}

        {step === 6 && appointment && (!appointment.deposit || depositPaid) && (
          <div className="text-center py-12">
            <div className="flex justify-center mb-6">
              <div className="bg-amber-500/20 rounded-full p-5">
                <CheckCircle2 className="h-16 w-16 text-amber-500" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Horário confirmado
            </h2>
            <p className="text-zinc-400 mb-8">
              Até logo, {appointment.client.name.split(' ')[0]}! Te esperamos no
              salão.
            </p>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-left space-y-4 mb-8">
              <div className="flex items-center gap-3 pb-4 border-b border-zinc-800">
                <Scissors className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">
                    Serviços
                  </p>
                  <p className="text-white font-medium">
                    {appointment.services.map((s) => s.service.name).join(', ')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 pb-4 border-b border-zinc-800">
                <User className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">
                    Profissional
                  </p>
                  <p className="text-white font-medium">
                    {appointment.barber.name}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 pb-4 border-b border-zinc-800">
                <Calendar className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">
                    Data e hora
                  </p>
                  <p className="text-white font-medium">
                    {formatDateBR(selectedDate)} às {selectedTime}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">
                    Endereço
                  </p>
                  <p className="text-white font-medium">{info?.shopAddress}</p>
                </div>
              </div>
            </div>

            {appointment.manageToken && (
              <a
                href={`/meu-horario/${appointment.manageToken}?salon=${encodeURIComponent(getSalon())}`}
                className="mb-6 inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-200 hover:border-amber-500/60"
              >
                <Calendar className="h-4 w-4" /> Ver, remarcar ou cancelar meu horário
              </a>
            )}
            <br />
            <button
              onClick={() => {
                setDepositPaid(false)
                setStep(1)
                setSelectedServices([])
                setSelectedBarber('')
                setSelectedDate('')
                setSelectedTime('')
                setSlots([])
                setClientName('')
                setClientPhone('')
                setClientEmail('')
                setNotes('')
                setAppointment(null)
              }}
              className="text-amber-500 hover:text-amber-400 text-sm font-medium underline"
            >
              Fazer outro agendamento
            </button>
          </div>
        )}

        {/* Steps 1–5 */}
        {step !== 6 && (
          <>
            {/* Progress */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                {[1, 2, 3, 4, 5].map((s) => (
                  <div key={s} className="flex items-center flex-1">
                    <div
                      className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0 transition-colors ${
                        s < step
                          ? 'bg-amber-500 text-zinc-900'
                          : s === step
                            ? 'bg-amber-500 text-zinc-900 ring-2 ring-amber-500/30'
                            : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {s < step ? <CheckCircle2 className="h-4 w-4" /> : s}
                    </div>
                    {s < 5 && (
                      <div
                        className={`flex-1 h-0.5 mx-1 transition-colors ${
                          s < step ? 'bg-amber-500' : 'bg-zinc-800'
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
              <p className="text-center text-sm text-zinc-400">
                Passo {step} de 5 —{' '}
                <span className="text-white font-medium">
                  {STEP_LABELS[step]}
                </span>
              </p>
            </div>

            {/* Step 1: Serviços */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="mb-6">
                  <h2 className="text-2xl font-extrabold text-espuma">
                    Escolha os serviços
                  </h2>
                  <p className="text-zinc-400 text-sm mt-1">
                    Selecione um ou mais serviços
                  </p>
                </div>

                <div className="space-y-3">
                  {services.map((service) => {
                    const selected = selectedServices.includes(service.id)
                    return (
                      <button
                        key={service.id}
                        onClick={() => toggleService(service.id)}
                        className={`w-full text-left p-4 rounded-2xl border transition-all ${
                          selected
                            ? 'border-amber-500 bg-amber-500/10'
                            : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0 mr-4">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-white">
                                {service.name}
                              </p>
                              {selected && (
                                <CheckCircle2 className="h-4 w-4 text-amber-500 shrink-0" />
                              )}
                            </div>
                            {service.description && (
                              <p className="text-sm text-zinc-400 mt-0.5 truncate">
                                {service.description}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="flex items-center gap-1 text-xs text-zinc-500">
                                <Clock className="h-3 w-3" />
                                {service.durationMin +
                                  (service.processingMin ?? 0) +
                                  (service.finishingMin ?? 0)}{' '}
                                min
                              </span>
                            </div>
                          </div>
                          <span className="hora shrink-0 text-base font-medium text-espuma">
                            {formatCurrency(Number(service.price))}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {selectedServices.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mt-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-zinc-400">Duração total</span>
                      <span className="text-white">{totalDuration} min</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400 font-medium">Total</span>
                      <span className="text-amber-400 font-bold text-lg">
                        {formatCurrency(totalPrice)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Profissional */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="mb-6">
                  <h2 className="text-2xl font-extrabold text-espuma">
                    Escolha o profissional
                  </h2>
                  <p className="text-zinc-400 text-sm mt-1">
                    Ou deixe que escolhemos para você
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Sem preferência */}
                  <button
                    disabled={hasSpecialPricing}
                    onClick={() => handleBarberSelect('any')}
                    className={`w-full text-left p-4 rounded-2xl border transition-all ${
                      selectedBarber === 'any'
                        ? 'border-amber-500 bg-amber-500/10'
                        : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                        <Scissors className="h-5 w-5 text-zinc-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-white">
                            Sem preferência
                          </p>
                          {selectedBarber === 'any' && (
                            <CheckCircle2 className="h-4 w-4 text-amber-500" />
                          )}
                        </div>
                        <p className="text-sm text-zinc-400">
                          {hasSpecialPricing
                            ? 'Selecione um profissional para consultar preço e duração.'
                            : 'Qualquer profissional disponível'}
                        </p>
                      </div>
                    </div>
                  </button>

                  {barbers
                    .filter(
                      (b) =>
                        !b.serviceIds?.length ||
                        selectedServices.every((id) =>
                          b.serviceIds.includes(id),
                        ),
                    )
                    .map((barber) => (
                      <button
                        key={barber.id}
                        onClick={() => handleBarberSelect(barber.id)}
                        className={`w-full text-left p-4 rounded-2xl border transition-all ${
                          selectedBarber === barber.id
                            ? 'border-amber-500 bg-amber-500/10'
                            : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                            {barber.avatarUrl ? (
                              <img
                                src={barber.avatarUrl}
                                alt={barber.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <User className="h-5 w-5 text-zinc-400" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-white">
                                {barber.name}
                              </p>
                              {selectedBarber === barber.id && (
                                <CheckCircle2 className="h-4 w-4 text-amber-500" />
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Step 3: Data & Hora */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="mb-6">
                  <h2 className="text-2xl font-extrabold text-espuma">
                    Escolha a data
                  </h2>
                  <p className="text-zinc-400 text-sm mt-1">
                    Selecione o dia para ver os horários disponíveis
                  </p>
                </div>

                {/* Horários de funcionamento */}
                {info && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3 font-medium">
                      Horários de funcionamento
                    </p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                      {Object.entries(info.hours).map(([day, hours]) => (
                        <div key={day} className="flex justify-between text-sm">
                          <span className="text-zinc-400">
                            {DAY_NAMES[day]}
                          </span>
                          <span
                            className={
                              hours === 'closed'
                                ? 'text-zinc-600'
                                : 'text-white'
                            }
                          >
                            {formatHours(hours)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Date picker */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Data
                  </label>
                  <input
                    type="date"
                    min={today}
                    value={selectedDate}
                    onInput={(e) => handleDateChange(e.currentTarget.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-hidden focus:border-amber-500 transition-colors"
                  />
                </div>

                {/* Slots */}
                {selectedDate && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-3">
                      Horários disponíveis
                    </label>

                    {loadingSlots ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
                      </div>
                    ) : slots.length === 0 ? (
                      <div className="text-center py-8 bg-zinc-900 border border-zinc-800 rounded-2xl">
                        <Clock className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
                        <p className="text-zinc-400 font-medium">
                          Nenhum horário disponível
                        </p>
                        <p className="text-zinc-600 text-sm mt-1">
                          Escolha outra data
                        </p>
                        <PublicWaitlist key={`${selectedDate}:${selectedBarber}:${selectedServices.join(',')}`} date={selectedDate} barberId={selectedBarber} serviceIds={selectedServices} />
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2">
                        {slots.map((slot) => (
                          <button
                            key={slot}
                            onClick={() => setSelectedTime(slot)}
                            className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${
                              selectedTime === slot
                                ? 'bg-amber-500 text-zinc-900'
                                : 'bg-zinc-900 border border-zinc-700 text-white hover:border-amber-500 hover:text-amber-400'
                            }`}
                          >
                            {slot}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Seus Dados */}
            {step === 4 && (
              <div className="space-y-5">
                <div className="mb-6">
                  <h2 className="text-2xl font-extrabold text-espuma">Seus dados</h2>
                  <p className="text-zinc-400 text-sm mt-1">
                    Para identificar e confirmar seu agendamento
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Nome completo <span className="text-amber-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Seu nome"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-zinc-600 focus:outline-hidden focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Telefone / WhatsApp{' '}
                    <span className="text-amber-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input
                      type="tel"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="(32) 99999-9999"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-zinc-600 focus:outline-hidden focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    E-mail{' '}
                    <span className="text-zinc-600 text-xs font-normal">
                      (opcional)
                    </span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-zinc-600 focus:outline-hidden focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Observações{' '}
                    <span className="text-zinc-600 text-xs font-normal">
                      (opcional)
                    </span>
                  </label>
                  <div className="relative">
                    <MessageSquare className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-500" />
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Alguma preferência ou informação para o profissional..."
                      rows={3}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-zinc-600 focus:outline-hidden focus:border-amber-500 transition-colors resize-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Confirmar */}
            {step === 5 && (
              <div className="space-y-5">
                <div className="mb-6">
                  <h2 className="text-2xl font-extrabold text-espuma">
                    Confirmar agendamento
                  </h2>
                  <p className="text-zinc-400 text-sm mt-1">
                    Revise os detalhes antes de confirmar
                  </p>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800">
                  <div className="flex items-start gap-3 p-4">
                    <Scissors className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">
                        Serviços
                      </p>
                      <div className="space-y-1">
                        {selectedServices.map((id) => {
                          const s = services.find((sv) => sv.id === id)
                          return s ? (
                            <div
                              key={id}
                              className="flex justify-between text-sm"
                            >
                              <span className="text-white">{s.name}</span>
                              <span className="text-amber-400 font-medium">
                                {formatCurrency(
                                  Number(
                                    barbers.find((b) => b.id === selectedBarber)
                                      ?.serviceOverrides?.[id]?.price ??
                                      s.price,
                                  ),
                                )}
                              </span>
                            </div>
                          ) : null
                        })}
                      </div>
                      <p className="text-xs text-zinc-500 mt-2">
                        {totalDuration} min no total
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4">
                    <User className="h-5 w-5 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">
                        Profissional
                      </p>
                      <p className="text-white font-medium">{barberName}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4">
                    <Calendar className="h-5 w-5 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">
                        Data e hora
                      </p>
                      <p className="text-white font-medium">
                        {formatDateBR(selectedDate)} às {selectedTime}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4">
                    <Phone className="h-5 w-5 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">
                        Cliente
                      </p>
                      <p className="text-white font-medium">{clientName}</p>
                      <p className="text-zinc-400 text-sm">{clientPhone}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex justify-between items-center">
                  <span className="text-amber-300 font-medium">Total</span>
                  <span className="text-amber-400 font-bold text-2xl">
                    {formatCurrency(totalPrice)}
                  </span>
                </div>

                {submitError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                    <p className="text-red-400 text-sm">{submitError}</p>
                  </div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center gap-3 mt-8">
              {step > 1 && (
                <button
                  onClick={() => setStep((prev) => (prev - 1) as Step)}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors font-medium"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Voltar
                </button>
              )}

              {step < 5 && (
                <button
                  onClick={() => setStep((prev) => (prev + 1) as Step)}
                  disabled={
                    (step === 1 && !canNextStep1) ||
                    (step === 2 && !canNextStep2) ||
                    (step === 3 && !canNextStep3) ||
                    (step === 4 && !canNextStep4)
                  }
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-900 font-bold transition-colors"
                >
                  Continuar
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}

              {step === 5 && (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-900 font-bold transition-colors"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Agendando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Confirmar agendamento
                    </>
                  )}
                </button>
              )}
            </div>
            {step === 5 && (
              <p className="mt-3 text-center text-xs leading-relaxed text-zinc-500">
                Seu nome e telefone ficam com o salão para o agendamento e os lembretes no WhatsApp.{' '}
                <a href="/privacidade" target="_blank" className="underline underline-offset-2 hover:text-zinc-300">
                  Política de privacidade
                </a>
              </p>
            )}
          </>
        )}
      </div>

      <footer className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 text-xs text-zinc-500">
        <span>Agendamento online por Seu Barbeiro</span>
        <a href="/privacidade" className="underline underline-offset-2 hover:text-zinc-300">
          Privacidade
        </a>
      </footer>
    </div>
  )
}
