package model

import (
	"time"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type SalesPayment struct {
	ID             uint                     `gorm:"primaryKey" json:"id"`
	CompanyID      uint                     `gorm:"not null;index:idx_sp_company_status" json:"company_id"`
	PaymentNo      string                   `gorm:"size:40;not null;uniqueIndex" json:"payment_no"`
	PaymentDate    time.Time                `gorm:"type:date;not null" json:"payment_date"`
	PaymentMethod  string                   `gorm:"size:30" json:"payment_method"`
	DocumentStatus DocumentStatus           `gorm:"size:20;not null;default:DRAFT;index:idx_sp_company_status" json:"document_status"`
	TotalAmount    decimal.Decimal          `gorm:"type:numeric(18,2);not null;default:0" json:"total_amount"`
	Notes          string                   `gorm:"type:text" json:"notes"`
	SubmittedAt    *time.Time               `json:"submitted_at"`
	Allocations    []SalesPaymentAllocation `gorm:"foreignKey:SalesPaymentID" json:"allocations,omitempty"`
	CreatedAt      time.Time                `json:"created_at"`
	UpdatedAt      time.Time                `json:"updated_at"`
	DeletedAt      gorm.DeletedAt           `gorm:"index" json:"-"`
}

type SalesPaymentAllocation struct {
	ID             uint            `gorm:"primaryKey" json:"id"`
	SalesPaymentID uint            `gorm:"not null;index;uniqueIndex:idx_spa_payment_line" json:"sales_payment_id"`
	LineNo         int             `gorm:"not null;uniqueIndex:idx_spa_payment_line" json:"line_no"`
	SalesInvoiceID uint            `gorm:"not null;index" json:"sales_invoice_id"`
	SalesInvoice   *SalesInvoice   `gorm:"foreignKey:SalesInvoiceID" json:"sales_invoice,omitempty"`
	Amount         decimal.Decimal `gorm:"type:numeric(18,2);not null" json:"amount"`
	CreatedAt      time.Time       `json:"created_at"`
}
