import { api } from './axios'
import type { Client, ClientWithLoyalty, LoyaltyCard, PaginatedResponse } from '../types'

export async function listClients(
  search?: string,
  page = 1,
  limit = 20,
): Promise<PaginatedResponse<ClientWithLoyalty>> {
  const { data } = await api.get('/clients', { params: { search, page, limit, withLoyalty: 'true' } })
  return data
}

export async function createClient(input: Partial<Client>): Promise<Client> {
  const { data } = await api.post('/clients', input)
  return data.data
}

export async function updateClient(id: string, input: Partial<Client>): Promise<Client> {
  const { data } = await api.patch(`/clients/${id}`, input)
  return data.data
}

export async function deleteClient(id: string): Promise<void> {
  await api.delete(`/clients/${id}`)
}

export async function getClientLoyalty(clientId: string): Promise<LoyaltyCard> {
  const { data } = await api.get(`/clients/${clientId}/loyalty`)
  return data.data
}

export async function redeemLoyaltyPoints(clientId: string, points: number): Promise<LoyaltyCard> {
  const { data } = await api.post(`/clients/${clientId}/loyalty/redeem`, { points })
  return data.data
}

/** Baixa tudo o que o salão guarda sobre o cliente (pedido do titular, LGPD). */
export async function exportClientData(clientId: string): Promise<unknown> {
  const { data } = await api.get(`/clients/${clientId}/export`)
  return data.data
}

/** Remove nome, telefone, e-mail e fichas; mantém atendimentos e valores. */
export async function anonymizeClient(clientId: string): Promise<void> {
  await api.post(`/clients/${clientId}/anonymize`)
}
