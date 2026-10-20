import { z } from 'zod'

export const createBarberSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  phone: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  avatarUrl: z.string().url().startsWith('https://', 'Use um link https://').optional().or(z.literal('')),
  serviceOverrides: z
    .record(
      z.string().uuid(),
      z.object({
        price: z.number().positive().max(99999).multipleOf(0.01).optional(),
        durationMin: z.number().int().positive().max(480).optional(),
      }),
    )
    .optional(),
  serviceIds: z.array(z.string().uuid()).max(100).optional(),
  commissionRate: z.number().min(0).max(100).optional(),
})

export const updateBarberSchema = createBarberSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export type CreateBarberInput = z.infer<typeof createBarberSchema>
export type UpdateBarberInput = z.infer<typeof updateBarberSchema>
