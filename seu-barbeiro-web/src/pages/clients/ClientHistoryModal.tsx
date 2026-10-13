import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { listAppointments } from '../../api/appointments.api'
import { anonymizeClient, exportClientData, getClientLoyalty, redeemLoyaltyPoints } from '../../api/clients.api'
import { useAuth } from '../../contexts/auth-state'
import { isAxiosError } from 'axios'
import { getSettings } from '../../api/settings.api'
import { formatCurrency } from '../../utils/formatCurrency'
import { Star, Gift, Download, UserX } from 'lucide-react'
import type { ClientWithLoyalty } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
  client: ClientWithLoyalty | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function ClientHistoryModal({ open, onClose, client }: Props) {
  const qc = useQueryClient()
  const [redeemPoints, setRedeemPoints] = useState('')
  const [redeemMsg, setRedeemMsg] = useState('')

  const { data: appointmentsData, isLoading } = useQuery({
    queryKey: ['client-history', client?.id],
    queryFn: () => listAppointments({ clientId: client!.id, limit: 100 }),
    enabled: open && !!client,
  })

  const { data: loyalty, isLoading: loyaltyLoading } = useQuery({
    queryKey: ['client-loyalty', client?.id],
    queryFn: () => getClientLoyalty(client!.id),
    enabled: open && !!client,
  })

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    enabled: open,
  })

  const redeemMutation = useMutation({
    mutationFn: (points: number) => redeemLoyaltyPoints(client!.id, points),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['client-loyalty', client?.id] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      setRedeemMsg(`${redeemPoints} pontos resgatados. Novo saldo: ${updated.pointsBalance} pts`)
      setRedeemPoints('')
    },
    onError: (err) => setRedeemMsg((err as Error).message),
  })

  // Pedidos do titular (LGPD): só o dono baixa ou remove os dados pessoais.
  const { admin } = useAuth()
  const isOwner = admin?.role === 'OWNER'
  const [privacyMsg, setPrivacyMsg] = useState('')
  const errorText = (err: unknown) =>
    (isAxiosError(err) && err.response?.data?.error?.message) || 'Não foi possível concluir.'

  async function handleExport() {
    setPrivacyMsg('')
    try {
      const data = await exportClientData(client!.id)
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `dados-${client!.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setPrivacyMsg(errorText(err))
    }
  }

  const anonymizeMutation = useMutation({
    mutationFn: () => anonymizeClient(client!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      onClose()
    },
    onError: (err) => setPrivacyMsg(errorText(err)),
  })

  const appointments = appointmentsData?.data ?? []
  const completed = appointments.filter((a) => a.status === 'COMPLETED')
  const totalSpent = completed.reduce((sum, a) => sum + Number(a.totalPrice), 0)

  const redemptionPoints = Number(settings?.loyalty_redemption_points ?? 100)
  const redemptionValue = Number(settings?.loyalty_redemption_value ?? 10)
  const loyaltyEnabled = settings?.loyalty_enabled === 'true'
  const balance = loyalty?.pointsBalance ?? 0
  const canRedeem = balance >= redemptionPoints

  function handleRedeem() {
    const pts = Number(redeemPoints)
    if (!pts || pts <= 0) return
    if (pts > balance) {
      setRedeemMsg(`Saldo insuficiente (${balance} pts disponíveis)`)
      return
    }
    setRedeemMsg('')
    redeemMutation.mutate(pts)
  }

  return (
    <Modal open={open} onClose={onClose} title={`Histórico — ${client?.name ?? ''}`} size="lg">
      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Spinner size="lg" /></div>
      ) : (
        <div className="space-y-4">
          {/* Resumo */}
          <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{appointments.length}</p>
              <p className="text-xs text-amber-700 mt-0.5">Agendamentos</p>
            </div>
            <div className="rounded-xl bg-green-50 border border-green-100 p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{completed.length}</p>
              <p className="text-xs text-green-700 mt-0.5">Concluídos</p>
            </div>
            <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3 text-center">
              <p className="text-xl font-bold text-zinc-800">{formatCurrency(totalSpent)}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Total gasto</p>
            </div>
          </div>

          {/* Fidelidade */}
          {loyaltyEnabled && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span className="text-sm font-semibold text-amber-800">Cartão fidelidade</span>
                </div>
                {loyaltyLoading ? <Spinner /> : (
                  <div className="text-right">
                    <p className="text-xl font-bold text-amber-700">{balance} pts</p>
                    <p className="text-[11px] text-amber-600">{loyalty?.visitCount ?? 0} visitas · {loyalty?.pointsEarned ?? 0} ganhos · {loyalty?.pointsRedeemed ?? 0} resgatados</p>
                  </div>
                )}
              </div>

              {/* Barra de progresso */}
              {redemptionPoints > 0 && (
                <div>
                  <div className="flex justify-between text-[11px] text-amber-700 mb-1">
                    <span>{balance} pts</span>
                    <span>Meta: {redemptionPoints} pts = R$ {redemptionValue}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-amber-200">
                    <div
                      className="h-2 rounded-full bg-amber-500 transition-all"
                      style={{ width: `${Math.min(100, (balance / redemptionPoints) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Resgate */}
              {canRedeem && (
                <div className="flex items-center gap-2 pt-1">
                  <Gift className="h-4 w-4 text-amber-600 shrink-0" />
                  <input
                    type="number"
                    min={redemptionPoints}
                    step={redemptionPoints}
                    max={balance}
                    placeholder={`Ex: ${redemptionPoints}`}
                    value={redeemPoints}
                    onChange={(e) => setRedeemPoints(e.target.value)}
                    className="w-24 rounded-lg border border-amber-300 px-2 py-1 text-sm text-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-amber-400"
                  />
                  <span className="text-xs text-amber-700">pontos</span>
                  <Button
                    onClick={handleRedeem}
                    disabled={redeemMutation.isPending || !redeemPoints}
                    className="py-1.5! px-3! text-xs!"
                  >
                    Resgatar
                  </Button>
                </div>
              )}
              {redeemMsg && (
                <p className="text-xs text-amber-800 font-medium">{redeemMsg}</p>
              )}
            </div>
          )}

          {/* Lista de agendamentos */}
          {appointments.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">Nenhum atendimento registrado.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {appointments.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
                  <div className="min-w-[80px]">
                    <p className="text-xs font-semibold text-zinc-700">{formatDate(a.startsAt)}</p>
                    <p className="text-xs text-zinc-400">{formatTime(a.startsAt)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 truncate">
                      {a.services.map((s) => s.service.name).join(' + ')}
                    </p>
                    <p className="text-xs text-zinc-400">{a.barber.name}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-sm font-semibold text-zinc-700">{formatCurrency(Number(a.totalPrice))}</span>
                    <Badge status={a.status} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {isOwner && (
            <div className="border-t border-zinc-200 pt-4">
              <p className="text-sm font-semibold text-zinc-800">Dados pessoais</p>
              <p className="mt-1 text-xs text-zinc-500">
                Quando o cliente pedir, entregue a cópia dos dados ou remova nome, telefone, e-mail e
                fichas. Os atendimentos e valores continuam no financeiro como "Cliente removido".
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={handleExport}>
                  <Download className="h-4 w-4" /> Baixar dados
                </Button>
                <Button
                  variant="secondary"
                  disabled={anonymizeMutation.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        `Remover os dados pessoais de ${client?.name}? Isso não pode ser desfeito.`,
                      )
                    )
                      anonymizeMutation.mutate()
                  }}
                >
                  <UserX className="h-4 w-4" /> Remover dados pessoais
                </Button>
              </div>
              {privacyMsg && <p className="mt-2 text-xs text-red-700">{privacyMsg}</p>}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
