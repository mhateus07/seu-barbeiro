import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { createService, updateService } from '../../api/services.api'
import type { Service } from '../../types'
import { useAuth } from '../../contexts/auth-state'

interface Props {
  open: boolean
  onClose: () => void
  service?: Service | null
}

interface FormData {
  name: string
  description: string
  price: number
  durationMin: number
}

export function ServiceFormModal({ open, onClose, service }: Props) {
  const qc = useQueryClient()
  const isEdit = !!service
  // Preço é do dono; para a recepção o campo fica só para leitura.
  const isOwner = useAuth().admin?.role === 'OWNER'

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>()

  useEffect(() => {
    if (service) {
      reset({ name: service.name, description: service.description || '', price: service.price, durationMin: service.durationMin })
    } else {
      reset({ name: '', description: '', price: 0, durationMin: 30 })
    }
  }, [service, reset])

  const mutation = useMutation({
    // Campo desativado chega como undefined e não vai na requisição.
    mutationFn: (data: FormData) =>
      isEdit ? updateService(service!.id, data) : createService(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] })
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar serviço' : 'Novo serviço'}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <Input label="Nome *" {...register('name', { required: 'Obrigatório' })} error={errors.name?.message} />
        <Input label="Descrição" {...register('description')} />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Preço (R$) *"
            type="number"
            step="0.01"
            min="0"
            disabled={!isOwner}
            {...register('price', { required: 'Obrigatório', valueAsNumber: true })}
            error={errors.price?.message}
          />
          <Input
            label="Duração (min) *"
            type="number"
            min="1"
            {...register('durationMin', { required: 'Obrigatório', valueAsNumber: true })}
            error={errors.durationMin?.message}
          />
        </div>
        {mutation.error && <p className="text-sm text-red-500">{(mutation.error as Error).message}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>
            {isEdit ? 'Salvar' : 'Cadastrar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
