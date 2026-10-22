import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { createBarber, updateBarber } from '../../api/barbers.api'
import type { Barber } from '../../types'
import { useAuth } from '../../contexts/auth-state'

interface Props {
  open: boolean
  onClose: () => void
  barber?: Barber | null
}

interface FormData {
  name: string
  phone: string
  email: string
  commissionRate: string
}

export function BarberFormModal({ open, onClose, barber }: Props) {
  const qc = useQueryClient()
  const isEdit = !!barber
  // Comissão é do dono; para a recepção o campo fica só para leitura.
  const isOwner = useAuth().admin?.role === 'OWNER'

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>()

  useEffect(() => {
    if (barber) {
      reset({ name: barber.name, phone: barber.phone || '', email: barber.email || '', commissionRate: barber.commissionRate != null ? String(barber.commissionRate) : '' })
    } else {
      reset({ name: '', phone: '', email: '', commissionRate: '' })
    }
  }, [barber, reset])

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        ...data,
        commissionRate: isOwner && data.commissionRate !== '' ? Number(data.commissionRate) : undefined,
      }
      return isEdit ? updateBarber(barber!.id, payload) : createBarber(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['barbers'] })
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar profissional' : 'Novo profissional'}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <Input label="Nome *" {...register('name', { required: 'Nome obrigatório' })} error={errors.name?.message} />
        <Input label="Telefone" {...register('phone')} placeholder="(11) 99999-9999" />
        <Input label="E-mail" type="email" {...register('email')} placeholder="profissional@email.com" />
        <Input
          label="Comissão (%)"
          type="number"
          min="0"
          max="100"
          step="0.5"
          disabled={!isOwner}
          {...register('commissionRate')}
          placeholder="Ex: 40 (para 40%)"
        />
        {mutation.error && (
          <p className="text-sm text-red-500">{(mutation.error as Error).message}</p>
        )}
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
