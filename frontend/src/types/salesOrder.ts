import type { DocumentStatus, Company, Product } from './common'

export interface SalesOrderItem {
  id: number
  sales_order_id: number
  line_no: number
  product_id: number
  product?: Product
  qty_ordered: string
  unit_price: string
  remaining_qty?: string
}

export interface SalesOrder {
  id: number
  company_id: number
  company?: Company
  order_no: string
  customer_name: string
  order_date: string
  document_status: DocumentStatus
  total_amount: string
  notes: string
  created_by: string
  submitted_at: string | null
  items: SalesOrderItem[]
}

export interface SalesOrderItemInput {
  product_id: number
  qty_ordered: string
  unit_price: string
}

export interface CreateSalesOrderRequest {
  company_id: number
  customer_name: string
  order_date: string
  notes?: string
  created_by?: string
  items: SalesOrderItemInput[]
}

export type UpdateSalesOrderRequest = Omit<CreateSalesOrderRequest, 'company_id'>
