package dto

import "github.com/shopspring/decimal"

type SalesInvoiceItemInput struct {
	SourceDeliveryItemID uint            `json:"source_delivery_item_id" binding:"required"`
	Qty                  decimal.Decimal `json:"qty" binding:"required"`
}

type CreateSalesInvoiceRequest struct {
	CompanyID   uint                    `json:"company_id" binding:"required"`
	InvoiceDate string                  `json:"invoice_date" binding:"required"`
	Notes       string                  `json:"notes"`
	Items       []SalesInvoiceItemInput `json:"items" binding:"required,min=1,dive"`
}

type UpdateSalesInvoiceRequest struct {
	InvoiceDate string                  `json:"invoice_date" binding:"required"`
	Notes       string                  `json:"notes"`
	Items       []SalesInvoiceItemInput `json:"items" binding:"required,min=1,dive"`
}
