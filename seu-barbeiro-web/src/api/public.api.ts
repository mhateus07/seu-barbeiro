import { getSalon } from './salon'
import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3333/api/v1'
export const publicApi = axios.create({ baseURL: `${BASE}/public` })
const api = publicApi
api.interceptors.request.use((config) => {
  config.headers['X-Salon'] = getSalon()
  return config
})

export interface PublicService {
  id: string
  name: string
  description?: string
  price: number
  durationMin: number
  processingMin: number
  finishingMin: number
}

export interface PublicBarber {
  id: string
  name: string
  avatarUrl?: string
  serviceIds: string[]
  serviceOverrides: Record<string, { price?: number; durationMin?: number }>
}

export interface PublicInfo {
  shopLogo: string
  shopDescription: string
  shopName: string
  shopPhone: string
  shopAddress: string
  shopInstagram: string
  hours: Record<string, string>
}

export async function getPublicInfo(): Promise<PublicInfo> {
  const { data } = await api.get('/info')
  return data
}

export async function getPublicServices(): Promise<PublicService[]> {
  const { data } = await api.get('/services')
  return data
}

export async function getPublicBarbers(): Promise<PublicBarber[]> {
  const { data } = await api.get('/barbers')
  return data
}

export async function getAvailableSlots(
  barberId: string,
  date: string,
  duration: number,
  serviceIds: string[],
): Promise<string[]> {
  const { data } = await api.get(`/barbers/${barberId}/slots`, {
    params: { date, duration, serviceIds: serviceIds.join(',') },
  })
  return data.slots
}

export async function createPublicAppointment(payload: {
  clientName: string
  clientPhone: string
  clientEmail?: string
  barberId: string
  serviceIds: string[]
  date: string
  time: string
  outreachToken?: string
  notes?: string
}) {
  const { data } = await api.post('/appointments', payload)
  return data
}

// ─── Pix e autoatendimento ───────────────────────────────────────────────────

export interface PublicPix {
  kind: 'DEPOSIT' | 'SUBSCRIPTION'
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | 'FAILED'
  amount: number
  qrCode: string | null
  qrCodeBase64: string | null
  expiresAt: string
  shopName: string
}

export async function getPix(token: string): Promise<PublicPix> {
  const { data } = await api.get(`/pix/${token}`)
  return data
}

export interface ManagedAppointment {
  status: string
  startsAt: string
  endsAt: string
  clientFirstName: string
  barber: { id: string; name: string; avatarUrl?: string }
  services: { id: string; name: string }[]
  totalPrice: number
  canChange: boolean
  canConfirm: boolean
  minNoticeHours: number
  deposit: {
    amount: number
    paid: boolean
    payToken: string | null
    expiresAt: string | null
  } | null
  shop: { name: string; phone: string; address: string }
}

export async function getManaged(token: string): Promise<ManagedAppointment> {
  const { data } = await api.get(`/manage/${token}`)
  return data
}
export async function getManagedSlots(token: string, date: string): Promise<string[]> {
  const { data } = await api.get(`/manage/${token}/slots`, { params: { date } })
  return data.slots
}
export async function manageAction(
  token: string,
  action: 'confirm' | 'cancel' | 'reschedule',
  body?: { date: string; time: string },
) {
  const { data } = await api.post(`/manage/${token}/${action}`, body)
  return data
}
