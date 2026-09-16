package dto

import "github.com/shopspring/decimal"

type SalesDeliveryItemInput struct {
	SourceOrderItemID uint            `json:"source_order_item_id" binding:"required"`
	Qty               decimal.Decimal `json:"qty" binding:"required"`
}

type CreateSalesDeliveryRequest struct {
	CompanyID    uint                     `json:"company_id" binding:"required"`
	SalesOrderID uint                     `json:"sales_order_id" binding:"required"`
	DeliveryDate string                   `json:"delivery_date" binding:"required"`
	Notes        string                   `json:"notes"`
	Items        []SalesDeliveryItemInput `json:"items" binding:"required,min=1,dive"`
}

type UpdateSalesDeliveryRequest struct {
	DeliveryDate string                   `json:"delivery_date" binding:"required"`
	Notes        string                   `json:"notes"`
	Items        []SalesDeliveryItemInput `json:"items" binding:"required,min=1,dive"`
}
