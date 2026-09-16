package dto

import "github.com/shopspring/decimal"

type SalesPaymentAllocationInput struct {
	SalesInvoiceID uint            `json:"sales_invoice_id" binding:"required"`
	Amount         decimal.Decimal `json:"amount" binding:"required"`
}

type CreateSalesPaymentRequest struct {
	CompanyID     uint                          `json:"company_id" binding:"required"`
	PaymentDate   string                        `json:"payment_date" binding:"required"`
	PaymentMethod string                        `json:"payment_method"`
	Notes         string                        `json:"notes"`
	Allocations   []SalesPaymentAllocationInput `json:"allocations" binding:"required,min=1,dive"`
}

type UpdateSalesPaymentRequest struct {
	PaymentDate   string                        `json:"payment_date" binding:"required"`
	PaymentMethod string                        `json:"payment_method"`
	Notes         string                        `json:"notes"`
	Allocations   []SalesPaymentAllocationInput `json:"allocations" binding:"required,min=1,dive"`
}
