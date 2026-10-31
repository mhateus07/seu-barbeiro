import { z } from 'zod'
import { Request, Response } from 'express'
import * as PublicService from './public.service'
import { personName } from '../../utils/person-name'

// Erros são tratados pelo handler de public.routes.ts.

export async function getInfo(_req: Request, res: Response) {
  res.json(await PublicService.getPublicInfo())
}

export async function getServices(_req: Request, res: Response) {
  res.json(await PublicService.getPublicServices())
}

export async function getBarbers(_req: Request, res: Response) {
  res.json(await PublicService.getPublicBarbers())
}

export async function getSlots(req: Request, res: Response) {
  const params = z
    .object({
      barberId: z.union([z.string().uuid(), z.literal('any')]),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      duration: z.coerce.number().int().positive().max(1440),
      serviceIds: z.array(z.string().uuid()).max(10),
    })
    .parse({
      barberId: req.params.barberId,
      date: req.query.date,
      duration: req.query.duration,
      serviceIds: String(req.query.serviceIds || '')
        .split(',')
        .filter(Boolean),
    })
  const slots = await PublicService.getAvailableSlots(
    params.barberId,
    params.date,
    params.duration,
    params.serviceIds,
  )
  res.json({ slots })
}

export async function createAppointment(req: Request, res: Response) {
  const data = z
    .object({
      clientName: personName,
      clientPhone: z.string().min(10).max(25),
      clientEmail: z.string().email().optional().or(z.literal('')),
      barberId: z.union([z.string().uuid(), z.literal('any')]),
      serviceIds: z.array(z.string().uuid()).min(1).max(10),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      notes: z.string().max(2000).optional(),
      outreachToken: z.string().max(100).optional(),
    })
    .parse(req.body)
  res.status(201).json(await PublicService.createPublicAppointment(data))
}
