package model

import (
	"time"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type SalesInvoice struct {
	ID             uint               `gorm:"primaryKey" json:"id"`
	CompanyID      uint               `gorm:"not null;index:idx_si_company_status" json:"company_id"`
	InvoiceNo      string             `gorm:"size:40;not null;uniqueIndex" json:"invoice_no"`
	InvoiceDate    time.Time          `gorm:"type:date;not null" json:"invoice_date"`
	DocumentStatus DocumentStatus     `gorm:"size:20;not null;default:DRAFT;index:idx_si_company_status" json:"document_status"`
	PaymentStatus  PaymentStatus      `gorm:"size:20;not null;default:UNPAID;index" json:"payment_status"`
	TotalAmount    decimal.Decimal    `gorm:"type:numeric(18,2);not null;default:0" json:"total_amount"`
	PaidAmount     decimal.Decimal    `gorm:"type:numeric(18,2);not null;default:0" json:"paid_amount"`
	Notes          string             `gorm:"type:text" json:"notes"`
	SubmittedAt    *time.Time         `json:"submitted_at"`
	Items          []SalesInvoiceItem `gorm:"foreignKey:SalesInvoiceID" json:"items,omitempty"`
	CreatedAt      time.Time          `json:"created_at"`
	UpdatedAt      time.Time          `json:"updated_at"`
	DeletedAt      gorm.DeletedAt     `gorm:"index" json:"-"`
}

func (i *SalesInvoice) OutstandingAmount() decimal.Decimal {
	return i.TotalAmount.Sub(i.PaidAmount)
}

type SalesInvoiceItem struct {
	ID                   uint               `gorm:"primaryKey" json:"id"`
	SalesInvoiceID       uint               `gorm:"not null;index;uniqueIndex:idx_sii_invoice_line" json:"sales_invoice_id"`
	LineNo               int                `gorm:"not null;uniqueIndex:idx_sii_invoice_line" json:"line_no"`
	SourceDeliveryItemID uint               `gorm:"not null;index" json:"source_delivery_item_id"`
	SourceDeliveryItem   *SalesDeliveryItem `gorm:"foreignKey:SourceDeliveryItemID" json:"source_delivery_item,omitempty"`
	ProductID            uint               `gorm:"not null;index" json:"product_id"`
	Product              *Product           `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	Qty                  decimal.Decimal    `gorm:"type:numeric(18,3);not null" json:"qty"`
	UnitPrice            decimal.Decimal    `gorm:"type:numeric(18,2);not null" json:"unit_price"`
	CreatedAt            time.Time          `json:"created_at"`
}
