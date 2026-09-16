import type { DocumentStatus } from './common'
import type { SalesInvoice } from './salesInvoice'

export interface SalesPaymentAllocation {
  id: number
  sales_payment_id: number
  line_no: number
  sales_invoice_id: number
  sales_invoice?: SalesInvoice
  amount: string
}

export interface SalesPayment {
  id: number
  company_id: number
  payment_no: string
  payment_date: string
  payment_method: string
  document_status: DocumentStatus
  total_amount: string
  notes: string
  submitted_at: string | null
  allocations: SalesPaymentAllocation[]
}

export interface SalesPaymentAllocationInput {
  sales_invoice_id: number
  amount: string
}

export interface CreateSalesPaymentRequest {
  company_id: number
  payment_date: string
  payment_method?: string
  notes?: string
  allocations: SalesPaymentAllocationInput[]
}

export interface UpdateSalesPaymentRequest {
  payment_date: string
  payment_method?: string
  notes?: string
  allocations: SalesPaymentAllocationInput[]
}
