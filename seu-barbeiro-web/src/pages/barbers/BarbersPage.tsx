import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, UserX, Scissors, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { bookingLink } from '../../api/salon'
import { listBarbers, deleteBarber } from '../../api/barbers.api'
import { BarberFormModal } from './BarberFormModal'
import type { Barber } from '../../types'
import { formatPhone } from '../../utils/formatPhone'
import { useAuth } from '../../contexts/auth-state'

export function BarbersPage() {
  // Cadastrar e desativar mexem em comissão e preço: só o dono.
  const isOwner = useAuth().admin?.role === 'OWNER'
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Barber | null>(null)

  const { data = [], isLoading } = useQuery({
    queryKey: ['barbers'],
    queryFn: () => listBarbers(),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteBarber,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['barbers'] }),
  })

  function handleEdit(barber: Barber) {
    setEditing(barber)
    setModalOpen(true)
  }

  function handleNew() {
    setEditing(null)
    setModalOpen(true)
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-800 md:text-2xl">Profissionais</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{data.length} cadastrado(s)</p>
        </div>
        {isOwner && <button
          onClick={handleNew}
          className="flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo profissional
        </button>}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 rounded-2xl bg-zinc-100 animate-pulse" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 py-16 text-zinc-400">
          <Scissors className="h-8 w-8 mb-3 text-zinc-300" />
          <p className="font-medium">Nenhum profissional cadastrado</p>
          <p className="text-sm mt-1">Clique em "Novo profissional" para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((barber) => (
            <div key={barber.id} className="rounded-2xl border border-zinc-200 bg-white p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 border border-amber-100">
                    <Scissors className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-800">{barber.name}</p>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${barber.isActive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                      {barber.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5 text-sm text-zinc-500 mb-4">
                {barber.phone && <p>{formatPhone(barber.phone)}</p>}
                {barber.email && <p className="truncate">{barber.email}</p>}
                {!barber.phone && !barber.email && <p className="italic text-zinc-300">Sem contato cadastrado</p>}
                {barber.commissionRate != null && (
                  <p className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-100">
                    Comissão: {barber.commissionRate}%
                  </p>
                )}
              </div>
              <div className="flex gap-2 border-t border-zinc-100 pt-4">
                <button
                  onClick={() => handleEdit(barber)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button
                  onClick={() => {
                    const link = `${bookingLink()}&barbeiro=${barber.id}`
                    navigator.clipboard.writeText(link).then(
                      () => toast.success(`Link de ${barber.name} copiado.`),
                      () => toast.error('Não foi possível copiar o link.'),
                    )
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition-colors"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Copiar link
                </button>
                {isOwner && <button
                  onClick={() => { if (confirm(`Desativar ${barber.name}?`)) deleteMutation.mutate(barber.id) }}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors ml-auto"
                >
                  <UserX className="h-3.5 w-3.5" />
                  Desativar
                </button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <BarberFormModal open={modalOpen} onClose={() => setModalOpen(false)} barber={editing} />
    </div>
  )
}
