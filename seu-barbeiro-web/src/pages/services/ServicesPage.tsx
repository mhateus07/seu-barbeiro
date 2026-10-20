import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Sparkles, Clock, DollarSign } from 'lucide-react'
import { listServices, deleteService } from '../../api/services.api'
import { ServiceFormModal } from './ServiceFormModal'
import { formatCurrency } from '../../utils/formatCurrency'
import type { Service } from '../../types'
import { useAuth } from '../../contexts/auth-state'

export function ServicesPage() {
  // Cadastrar e desativar mexem em comissão e preço: só o dono.
  const isOwner = useAuth().admin?.role === 'OWNER'
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)

  const { data = [], isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => listServices(),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteService,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-800 md:text-2xl">Serviços</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{data.length} cadastrado(s)</p>
        </div>
        {isOwner && <button
          onClick={() => { setEditing(null); setModalOpen(true) }}
          className="flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo serviço
        </button>}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-zinc-100 animate-pulse" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 py-16 text-zinc-400">
          <Sparkles className="h-8 w-8 mb-3 text-zinc-300" />
          <p className="font-medium">Nenhum serviço cadastrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((service) => (
            <div key={service.id} className="rounded-2xl border border-zinc-200 bg-white p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 border border-amber-100">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${service.isActive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                  {service.isActive ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <p className="font-semibold text-zinc-800 mb-1">{service.name}</p>
              {service.description && <p className="text-xs text-zinc-400 mb-3 line-clamp-2">{service.description}</p>}
              <div className="flex items-center gap-3 text-sm mt-3">
                <span className="flex items-center gap-1 font-bold text-amber-600">
                  <DollarSign className="h-3.5 w-3.5" />
                  {formatCurrency(Number(service.price))}
                </span>
                <span className="flex items-center gap-1 text-zinc-400">
                  <Clock className="h-3.5 w-3.5" />
                  {service.durationMin}min
                </span>
              </div>
              <div className="flex gap-2 border-t border-zinc-100 pt-4 mt-4">
                <button
                  onClick={() => { setEditing(service); setModalOpen(true) }}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
                {isOwner && <button
                  onClick={() => { if (confirm(`Desativar "${service.name}"?`)) deleteMutation.mutate(service.id) }}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors ml-auto"
                >
                  Desativar
                </button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <ServiceFormModal open={modalOpen} onClose={() => setModalOpen(false)} service={editing} />
    </div>
  )
}
