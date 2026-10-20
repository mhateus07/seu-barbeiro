import { z } from 'zod'

export const createServiceSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  price: z.number().positive('Preço deve ser positivo').max(99999).multipleOf(0.01, 'Use no máximo 2 casas decimais'),
  returnDays: z.number().int().min(1).max(365).nullable().optional(),
  processingMin: z.number().int().min(0).max(480).optional(),
  finishingMin: z.number().int().min(0).max(480).optional(),
  resourceId: z.string().uuid().nullable().optional(),
  durationMin: z.number().int().positive('Duração deve ser positiva'),
})

export const updateServiceSchema = createServiceSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export type CreateServiceInput = z.infer<typeof createServiceSchema>
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>
