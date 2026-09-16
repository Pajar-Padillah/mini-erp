package model

import (
	"time"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type Company struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Code      string         `gorm:"size:20;not null;uniqueIndex" json:"code"`
	Name      string         `gorm:"size:150;not null" json:"name"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

type Brand struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Code      string         `gorm:"size:20;not null;uniqueIndex" json:"code"`
	Name      string         `gorm:"size:150;not null" json:"name"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

type Product struct {
	ID        uint            `gorm:"primaryKey" json:"id"`
	BrandID   uint            `gorm:"not null;index" json:"brand_id"`
	Brand     *Brand          `gorm:"foreignKey:BrandID" json:"brand,omitempty"`
	SKU       string          `gorm:"size:40;not null;uniqueIndex" json:"sku"`
	Name      string          `gorm:"size:200;not null" json:"name"`
	UOM       string          `gorm:"size:20;not null;default:PCS" json:"uom"`
	UnitPrice decimal.Decimal `gorm:"type:numeric(18,2);not null;default:0" json:"unit_price"`
	IsActive  bool            `gorm:"not null;default:true" json:"is_active"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
	DeletedAt gorm.DeletedAt  `gorm:"index" json:"-"`
}

type Stock struct {
	ID             uint            `gorm:"primaryKey" json:"id"`
	CompanyID      uint            `gorm:"not null;uniqueIndex:idx_stock_company_product" json:"company_id"`
	ProductID      uint            `gorm:"not null;uniqueIndex:idx_stock_company_product" json:"product_id"`
	Product        *Product        `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	QuantityOnHand decimal.Decimal `gorm:"type:numeric(18,3);not null;default:0" json:"quantity_on_hand"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

type DocumentNumberSequence struct {
	ID         uint    `gorm:"primaryKey" json:"id"`
	CompanyID  uint    `gorm:"not null;uniqueIndex:idx_docseq_company_type" json:"company_id"`
	DocType    DocType `gorm:"size:10;not null;uniqueIndex:idx_docseq_company_type" json:"doc_type"`
	LastNumber int64   `gorm:"not null;default:0" json:"last_number"`
}
