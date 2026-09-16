import { apiClient } from './client'
import type { ListResponse } from '../types/common'
import type { CreateSalesPaymentRequest, SalesPayment, UpdateSalesPaymentRequest } from '../types/salesPayment'

export const salesPaymentApi = {
  async list(params?: { status?: string; page?: number; page_size?: number }): Promise<ListResponse<SalesPayment>> {
    const res = await apiClient.get<ListResponse<SalesPayment>>('/sales-payments', { params })
    return res.data
  },
  async get(id: number): Promise<SalesPayment> {
    const res = await apiClient.get<SalesPayment>(`/sales-payments/${id}`)
    return res.data
  },
  async create(req: CreateSalesPaymentRequest): Promise<SalesPayment> {
    const res = await apiClient.post<SalesPayment>('/sales-payments', req)
    return res.data
  },
  async update(id: number, req: UpdateSalesPaymentRequest): Promise<SalesPayment> {
    const res = await apiClient.put<SalesPayment>(`/sales-payments/${id}`, req)
    return res.data
  },
  async submit(id: number): Promise<SalesPayment> {
    const res = await apiClient.post<SalesPayment>(`/sales-payments/${id}/submit`)
    return res.data
  },
  async unsubmit(id: number): Promise<SalesPayment> {
    const res = await apiClient.post<SalesPayment>(`/sales-payments/${id}/unsubmit`)
    return res.data
  },
  async remove(id: number): Promise<void> {
    await apiClient.delete(`/sales-payments/${id}`)
  },
}
