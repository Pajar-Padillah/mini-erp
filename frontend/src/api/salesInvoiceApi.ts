import { apiClient } from './client'
import type { ListResponse } from '../types/common'
import type { CreateSalesInvoiceRequest, SalesInvoice, UpdateSalesInvoiceRequest } from '../types/salesInvoice'

export const salesInvoiceApi = {
  async list(params?: { status?: string; payment_status?: string; page?: number; page_size?: number }): Promise<ListResponse<SalesInvoice>> {
    const res = await apiClient.get<ListResponse<SalesInvoice>>('/sales-invoices', { params })
    return res.data
  },
  async listPickable(): Promise<SalesInvoice[]> {
    const [active, processed] = await Promise.all([
      apiClient.get<ListResponse<SalesInvoice>>('/sales-invoices', { params: { status: 'ACTIVE', page_size: 200 } }),
      apiClient.get<ListResponse<SalesInvoice>>('/sales-invoices', { params: { status: 'PROCESSED', page_size: 200 } }),
    ])
    return [...active.data.data, ...processed.data.data]
  },
  async get(id: number): Promise<SalesInvoice> {
    const res = await apiClient.get<SalesInvoice>(`/sales-invoices/${id}`)
    return res.data
  },
  async create(req: CreateSalesInvoiceRequest): Promise<SalesInvoice> {
    const res = await apiClient.post<SalesInvoice>('/sales-invoices', req)
    return res.data
  },
  async update(id: number, req: UpdateSalesInvoiceRequest): Promise<SalesInvoice> {
    const res = await apiClient.put<SalesInvoice>(`/sales-invoices/${id}`, req)
    return res.data
  },
  async submit(id: number): Promise<SalesInvoice> {
    const res = await apiClient.post<SalesInvoice>(`/sales-invoices/${id}/submit`)
    return res.data
  },
  async unsubmit(id: number): Promise<SalesInvoice> {
    const res = await apiClient.post<SalesInvoice>(`/sales-invoices/${id}/unsubmit`)
    return res.data
  },
  async remove(id: number): Promise<void> {
    await apiClient.delete(`/sales-invoices/${id}`)
  },
}
