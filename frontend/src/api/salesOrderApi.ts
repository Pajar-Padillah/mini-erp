import { apiClient } from './client'
import type { ListResponse } from '../types/common'
import type { CreateSalesOrderRequest, SalesOrder, UpdateSalesOrderRequest } from '../types/salesOrder'

export const salesOrderApi = {
  async list(params?: { status?: string; page?: number; page_size?: number }): Promise<ListResponse<SalesOrder>> {
    const res = await apiClient.get<ListResponse<SalesOrder>>('/sales-orders', { params })
    return res.data
  },
  async listPickable(): Promise<SalesOrder[]> {
    const [active, processed] = await Promise.all([
      apiClient.get<ListResponse<SalesOrder>>('/sales-orders', { params: { status: 'ACTIVE', page_size: 200 } }),
      apiClient.get<ListResponse<SalesOrder>>('/sales-orders', { params: { status: 'PROCESSED', page_size: 200 } }),
    ])
    return [...active.data.data, ...processed.data.data]
  },
  async get(id: number): Promise<SalesOrder> {
    const res = await apiClient.get<SalesOrder>(`/sales-orders/${id}`)
    return res.data
  },
  async create(req: CreateSalesOrderRequest): Promise<SalesOrder> {
    const res = await apiClient.post<SalesOrder>('/sales-orders', req)
    return res.data
  },
  async update(id: number, req: UpdateSalesOrderRequest): Promise<SalesOrder> {
    const res = await apiClient.put<SalesOrder>(`/sales-orders/${id}`, req)
    return res.data
  },
  async submit(id: number): Promise<SalesOrder> {
    const res = await apiClient.post<SalesOrder>(`/sales-orders/${id}/submit`)
    return res.data
  },
  async unsubmit(id: number): Promise<SalesOrder> {
    const res = await apiClient.post<SalesOrder>(`/sales-orders/${id}/unsubmit`)
    return res.data
  },
  async remove(id: number): Promise<void> {
    await apiClient.delete(`/sales-orders/${id}`)
  },
}
