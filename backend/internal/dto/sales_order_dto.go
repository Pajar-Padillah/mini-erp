package dto

import "github.com/shopspring/decimal"

type SalesOrderItemInput struct {
	ProductID  uint            `json:"product_id" binding:"required"`
	QtyOrdered decimal.Decimal `json:"qty_ordered" binding:"required"`
	UnitPrice  decimal.Decimal `json:"unit_price" binding:"required"`
}

type CreateSalesOrderRequest struct {
	CompanyID    uint                  `json:"company_id" binding:"required"`
	CustomerName string                `json:"customer_name" binding:"required"`
	OrderDate    string                `json:"order_date" binding:"required"`
	Notes        string                `json:"notes"`
	CreatedBy    string                `json:"created_by"`
	Items        []SalesOrderItemInput `json:"items" binding:"required,min=1,dive"`
}

type UpdateSalesOrderRequest struct {
	CustomerName string                `json:"customer_name" binding:"required"`
	OrderDate    string                `json:"order_date" binding:"required"`
	Notes        string                `json:"notes"`
	Items        []SalesOrderItemInput `json:"items" binding:"required,min=1,dive"`
}
