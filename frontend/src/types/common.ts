export type DocumentStatus = 'DRAFT' | 'ACTIVE' | 'PROCESSED' | 'COMPLETED' | 'SUBMITTED'
export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID'

export interface ListMeta {
  page: number
  page_size: number
  total_items: number
}

export interface ListResponse<T> {
  data: T[]
  meta: ListMeta
}

export interface ApiError {
  error: string
}

export interface Company {
  id: number
  code: string
  name: string
  /** Set on branches; a group (or standalone company) has none. */
  parent_id: number | null
}

export interface Brand {
  id: number
  code: string
  name: string
}

export interface Product {
  id: number
  brand_id: number
  brand?: Brand
  sku: string
  name: string
  uom: string
  unit_price: string
  is_active: boolean
}

export interface Stock {
  id: number
  company_id: number
  product_id: number
  product?: Product
  quantity_on_hand: string
}
