import { apiClient } from './client'
import type { Brand, Company, ListResponse, Product, Stock } from '../types/common'

export const catalogApi = {
  async listCompanies(): Promise<Company[]> {
    const res = await apiClient.get<ListResponse<Company>>('/companies')
    return res.data.data
  },
  async listBrands(): Promise<Brand[]> {
    const res = await apiClient.get<ListResponse<Brand>>('/brands')
    return res.data.data
  },
  async listProducts(): Promise<Product[]> {
    const res = await apiClient.get<ListResponse<Product>>('/products')
    return res.data.data
  },
  async listStocks(): Promise<Stock[]> {
    const res = await apiClient.get<ListResponse<Stock>>('/stocks')
    return res.data.data
  },
}
