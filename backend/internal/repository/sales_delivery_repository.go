package repository

import (
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"mini-erp/internal/model"
)

type SalesDeliveryRepository struct{ db *gorm.DB }

func NewSalesDeliveryRepository(db *gorm.DB) *SalesDeliveryRepository {
	return &SalesDeliveryRepository{db}
}

func (r *SalesDeliveryRepository) Create(tx *gorm.DB, sd *model.SalesDelivery) error {
	return tx.Create(sd).Error
}

func (r *SalesDeliveryRepository) Save(tx *gorm.DB, sd *model.SalesDelivery) error {
	return tx.Save(sd).Error
}

func (r *SalesDeliveryRepository) ReplaceItems(tx *gorm.DB, deliveryID uint, items []model.SalesDeliveryItem) error {
	if err := tx.Where("sales_delivery_id = ?", deliveryID).Delete(&model.SalesDeliveryItem{}).Error; err != nil {
		return err
	}
	if len(items) == 0 {
		return nil
	}
	return tx.Create(&items).Error
}

func (r *SalesDeliveryRepository) FindByID(db *gorm.DB, id uint, companyID uint) (*model.SalesDelivery, error) {
	var row model.SalesDelivery
	q := db.Preload("Items").Preload("Items.Product").Preload("SalesOrder")
	if companyID != 0 {
		q = ScopeToCompany(q, companyID)
	}
	if err := q.First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *SalesDeliveryRepository) FindByIDForUpdate(tx *gorm.DB, id uint) (*model.SalesDelivery, error) {
	var row model.SalesDelivery
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&row, id).Error; err != nil {
		return nil, err
	}
	if err := tx.Where("sales_delivery_id = ?", id).Find(&row.Items).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *SalesDeliveryRepository) List(db *gorm.DB, companyID uint, orderID uint, status string, p PageRequest) ([]model.SalesDelivery, PageResult, error) {
	page, pageSize, offset := p.Normalized()
	q := ScopeToCompany(db.Model(&model.SalesDelivery{}).Preload("SalesOrder"), companyID)
	if orderID != 0 {
		q = q.Where("sales_order_id = ?", orderID)
	}
	q = WhereIn(q, "document_status", status)
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, PageResult{}, err
	}
	var rows []model.SalesDelivery
	err := q.Order("id DESC").Offset(offset).Limit(pageSize).Find(&rows).Error
	return rows, PageResult{Page: page, PageSize: pageSize, TotalItems: total}, err
}

func (r *SalesDeliveryRepository) Delete(tx *gorm.DB, id uint) error {
	if err := tx.Where("sales_delivery_id = ?", id).Delete(&model.SalesDeliveryItem{}).Error; err != nil {
		return err
	}
	return tx.Delete(&model.SalesDelivery{}, id).Error
}

func (r *SalesDeliveryRepository) SumSubmittedInvoiceQtyForDeliveryItem(db *gorm.DB, deliveryItemID uint) (decimal.Decimal, error) {
	var sum decimal.NullDecimal
	err := db.Table("sales_invoice_items sii").
		Joins("JOIN sales_invoices si ON si.id = sii.sales_invoice_id").
		Where("sii.source_delivery_item_id = ? AND si.document_status != ? AND si.deleted_at IS NULL", deliveryItemID, model.DocumentStatusDraft).
		Select("COALESCE(SUM(sii.qty), 0)").
		Scan(&sum).Error
	if err != nil {
		return decimal.Zero, err
	}
	if !sum.Valid {
		return decimal.Zero, nil
	}
	return sum.Decimal, nil
}

func (r *SalesDeliveryRepository) ExistsInvoiceItemForDelivery(db *gorm.DB, deliveryID uint) (bool, error) {
	var count int64
	err := db.Table("sales_invoice_items sii").
		Joins("JOIN sales_delivery_items sdi ON sdi.id = sii.source_delivery_item_id").
		Where("sdi.sales_delivery_id = ?", deliveryID).
		Count(&count).Error
	return count > 0, err
}
