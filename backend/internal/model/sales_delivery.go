package model

import (
	"time"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type SalesDelivery struct {
	ID             uint                `gorm:"primaryKey" json:"id"`
	CompanyID      uint                `gorm:"not null;index:idx_sd_company_status" json:"company_id"`
	SalesOrderID   uint                `gorm:"not null;index" json:"sales_order_id"`
	SalesOrder     *SalesOrder         `gorm:"foreignKey:SalesOrderID" json:"sales_order,omitempty"`
	DeliveryNo     string              `gorm:"size:40;not null;uniqueIndex" json:"delivery_no"`
	DeliveryDate   time.Time           `gorm:"type:date;not null" json:"delivery_date"`
	DocumentStatus DocumentStatus      `gorm:"size:20;not null;default:DRAFT;index:idx_sd_company_status" json:"document_status"`
	Notes          string              `gorm:"type:text" json:"notes"`
	SubmittedAt    *time.Time          `json:"submitted_at"`
	Items          []SalesDeliveryItem `gorm:"foreignKey:SalesDeliveryID" json:"items,omitempty"`
	CreatedAt      time.Time           `json:"created_at"`
	UpdatedAt      time.Time           `json:"updated_at"`
	DeletedAt      gorm.DeletedAt      `gorm:"index" json:"-"`
}

type SalesDeliveryItem struct {
	ID                uint            `gorm:"primaryKey" json:"id"`
	SalesDeliveryID   uint            `gorm:"not null;index;uniqueIndex:idx_sdi_delivery_line" json:"sales_delivery_id"`
	SalesDelivery     *SalesDelivery  `gorm:"foreignKey:SalesDeliveryID" json:"sales_delivery,omitempty"`
	LineNo            int             `gorm:"not null;uniqueIndex:idx_sdi_delivery_line" json:"line_no"`
	SourceOrderItemID uint            `gorm:"not null;index" json:"source_order_item_id"`
	SourceOrderItem   *SalesOrderItem `gorm:"foreignKey:SourceOrderItemID" json:"source_order_item,omitempty"`
	ProductID         uint            `gorm:"not null;index" json:"product_id"`
	Product           *Product        `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	Qty               decimal.Decimal `gorm:"type:numeric(18,3);not null" json:"qty"`
	UnitPrice         decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"unit_price"`
	CreatedAt         time.Time       `json:"created_at"`

	RemainingQty decimal.Decimal `gorm:"-" json:"remaining_qty,omitempty"`
}
