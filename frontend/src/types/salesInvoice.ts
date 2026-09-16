import type { DocumentStatus, PaymentStatus, Product } from './common'
import type { SalesDeliveryItem } from './salesDelivery'

export interface SalesInvoiceItem {
  id: number
  sales_invoice_id: number
  line_no: number
  source_delivery_item_id: number
  source_delivery_item?: SalesDeliveryItem
  product_id: number
  product?: Product
  qty: string
  unit_price: string
}

export interface SalesInvoice {
  id: number
  company_id: number
  invoice_no: string
  invoice_date: string
  document_status: DocumentStatus
  payment_status: PaymentStatus
  total_amount: string
  paid_amount: string
  notes: string
  submitted_at: string | null
  items: SalesInvoiceItem[]
}

export interface SalesInvoiceItemInput {
  source_delivery_item_id: number
  qty: string
}

export interface CreateSalesInvoiceRequest {
  company_id: number
  invoice_date: string
  notes?: string
  items: SalesInvoiceItemInput[]
}

export interface UpdateSalesInvoiceRequest {
  invoice_date: string
  notes?: string
  items: SalesInvoiceItemInput[]
}
