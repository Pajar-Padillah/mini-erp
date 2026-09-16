package model

import (
	"time"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type SalesOrder struct {
	ID             uint             `gorm:"primaryKey" json:"id"`
	CompanyID      uint             `gorm:"not null;index:idx_so_company_status" json:"company_id"`
	Company        *Company         `gorm:"foreignKey:CompanyID" json:"company,omitempty"`
	OrderNo        string           `gorm:"size:40;not null;uniqueIndex" json:"order_no"`
	CustomerName   string           `gorm:"size:200;not null" json:"customer_name"`
	OrderDate      time.Time        `gorm:"type:date;not null" json:"order_date"`
	DocumentStatus DocumentStatus   `gorm:"size:20;not null;default:DRAFT;index:idx_so_company_status" json:"document_status"`
	TotalAmount    decimal.Decimal  `gorm:"type:numeric(18,2);not null;default:0" json:"total_amount"`
	Notes          string           `gorm:"type:text" json:"notes"`
	CreatedBy      string           `gorm:"size:150" json:"created_by"`
	SubmittedAt    *time.Time       `json:"submitted_at"`
	Items          []SalesOrderItem `gorm:"foreignKey:SalesOrderID" json:"items,omitempty"`
	CreatedAt      time.Time        `json:"created_at"`
	UpdatedAt      time.Time        `json:"updated_at"`
	DeletedAt      gorm.DeletedAt   `gorm:"index" json:"-"`
}

type SalesOrderItem struct {
	ID           uint            `gorm:"primaryKey" json:"id"`
	SalesOrderID uint            `gorm:"not null;index;uniqueIndex:idx_soi_order_line" json:"sales_order_id"`
	LineNo       int             `gorm:"not null;uniqueIndex:idx_soi_order_line" json:"line_no"`
	ProductID    uint            `gorm:"not null;index" json:"product_id"`
	Product      *Product        `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	QtyOrdered   decimal.Decimal `gorm:"type:numeric(18,3);not null" json:"qty_ordered"`
	UnitPrice    decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"unit_price"`
	CreatedAt    time.Time       `json:"created_at"`

	RemainingQty decimal.Decimal `gorm:"-" json:"remaining_qty,omitempty"`
}
