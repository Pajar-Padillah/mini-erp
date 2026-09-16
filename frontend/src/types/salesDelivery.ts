import type { DocumentStatus, Product } from './common'
import type { SalesOrder, SalesOrderItem } from './salesOrder'

export interface SalesDeliveryItem {
  id: number
  sales_delivery_id: number
  sales_delivery?: SalesDelivery
  line_no: number
  source_order_item_id: number
  source_order_item?: SalesOrderItem
  product_id: number
  product?: Product
  qty: string
  unit_price: string
  remaining_qty?: string
}

export interface SalesDelivery {
  id: number
  company_id: number
  sales_order_id: number
  sales_order?: SalesOrder
  delivery_no: string
  delivery_date: string
  document_status: DocumentStatus
  notes: string
  submitted_at: string | null
  items: SalesDeliveryItem[]
}

export interface SalesDeliveryItemInput {
  source_order_item_id: number
  qty: string
}

export interface CreateSalesDeliveryRequest {
  company_id: number
  sales_order_id: number
  delivery_date: string
  notes?: string
  items: SalesDeliveryItemInput[]
}

export interface UpdateSalesDeliveryRequest {
  delivery_date: string
  notes?: string
  items: SalesDeliveryItemInput[]
}
