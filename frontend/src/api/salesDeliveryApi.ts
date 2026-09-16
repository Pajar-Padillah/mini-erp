import { apiClient } from './client'
import type { ListResponse } from '../types/common'
import type { CreateSalesDeliveryRequest, SalesDelivery, UpdateSalesDeliveryRequest } from '../types/salesDelivery'

export const salesDeliveryApi = {
  async list(params?: { status?: string; sales_order_id?: number; page?: number; page_size?: number }): Promise<ListResponse<SalesDelivery>> {
    const res = await apiClient.get<ListResponse<SalesDelivery>>('/sales-deliveries', { params })
    return res.data
  },
  async listPickable(): Promise<SalesDelivery[]> {
    const [active, processed] = await Promise.all([
      apiClient.get<ListResponse<SalesDelivery>>('/sales-deliveries', { params: { status: 'ACTIVE', page_size: 200 } }),
      apiClient.get<ListResponse<SalesDelivery>>('/sales-deliveries', { params: { status: 'PROCESSED', page_size: 200 } }),
    ])
    return [...active.data.data, ...processed.data.data]
  },
  async get(id: number): Promise<SalesDelivery> {
    const res = await apiClient.get<SalesDelivery>(`/sales-deliveries/${id}`)
    return res.data
  },
  async create(req: CreateSalesDeliveryRequest): Promise<SalesDelivery> {
    const res = await apiClient.post<SalesDelivery>('/sales-deliveries', req)
    return res.data
  },
  async update(id: number, req: UpdateSalesDeliveryRequest): Promise<SalesDelivery> {
    const res = await apiClient.put<SalesDelivery>(`/sales-deliveries/${id}`, req)
    return res.data
  },
  async submit(id: number): Promise<SalesDelivery> {
    const res = await apiClient.post<SalesDelivery>(`/sales-deliveries/${id}/submit`)
    return res.data
  },
  async unsubmit(id: number): Promise<SalesDelivery> {
    const res = await apiClient.post<SalesDelivery>(`/sales-deliveries/${id}/unsubmit`)
    return res.data
  },
  async remove(id: number): Promise<void> {
    await apiClient.delete(`/sales-deliveries/${id}`)
  },
}
