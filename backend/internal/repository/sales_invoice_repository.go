package repository

import (
	"sort"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"mini-erp/internal/model"
)

type SalesInvoiceRepository struct{ db *gorm.DB }

func NewSalesInvoiceRepository(db *gorm.DB) *SalesInvoiceRepository {
	return &SalesInvoiceRepository{db}
}

func (r *SalesInvoiceRepository) Create(tx *gorm.DB, si *model.SalesInvoice) error {
	return tx.Create(si).Error
}

func (r *SalesInvoiceRepository) Save(tx *gorm.DB, si *model.SalesInvoice) error {
	return tx.Save(si).Error
}

func (r *SalesInvoiceRepository) ReplaceItems(tx *gorm.DB, invoiceID uint, items []model.SalesInvoiceItem) error {
	if err := tx.Where("sales_invoice_id = ?", invoiceID).Delete(&model.SalesInvoiceItem{}).Error; err != nil {
		return err
	}
	if len(items) == 0 {
		return nil
	}
	return tx.Create(&items).Error
}

func (r *SalesInvoiceRepository) FindByID(db *gorm.DB, id uint, companyID uint) (*model.SalesInvoice, error) {
	var row model.SalesInvoice
	q := db.Preload("Items").Preload("Items.Product").Preload("Items.SourceDeliveryItem").Preload("Items.SourceDeliveryItem.SalesDelivery")
	if companyID != 0 {
		q = ScopeToCompany(q, companyID)
	}
	if err := q.First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *SalesInvoiceRepository) FindByIDForUpdate(tx *gorm.DB, id uint) (*model.SalesInvoice, error) {
	var row model.SalesInvoice
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&row, id).Error; err != nil {
		return nil, err
	}
	if err := tx.Where("sales_invoice_id = ?", id).Find(&row.Items).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *SalesInvoiceRepository) LockManyForUpdate(tx *gorm.DB, ids []uint) (map[uint]*model.SalesInvoice, error) {
	sorted := append([]uint(nil), ids...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })

	var rows []model.SalesInvoice
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id IN ?", sorted).
		Order("id").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	byID := make(map[uint]*model.SalesInvoice, len(rows))
	for i := range rows {
		byID[rows[i].ID] = &rows[i]
	}
	return byID, nil
}

func (r *SalesInvoiceRepository) List(db *gorm.DB, companyID uint, status, paymentStatus string, p PageRequest) ([]model.SalesInvoice, PageResult, error) {
	page, pageSize, offset := p.Normalized()
	q := ScopeToCompany(db.Model(&model.SalesInvoice{}), companyID)
	if status != "" {
		q = q.Where("document_status = ?", status)
	}
	if paymentStatus != "" {
		q = q.Where("payment_status = ?", paymentStatus)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, PageResult{}, err
	}
	var rows []model.SalesInvoice
	err := q.Preload("Items.SourceDeliveryItem.SalesDelivery").
		Order("id DESC").Offset(offset).Limit(pageSize).Find(&rows).Error
	return rows, PageResult{Page: page, PageSize: pageSize, TotalItems: total}, err
}

func (r *SalesInvoiceRepository) Delete(tx *gorm.DB, id uint) error {
	if err := tx.Where("sales_invoice_id = ?", id).Delete(&model.SalesInvoiceItem{}).Error; err != nil {
		return err
	}
	return tx.Delete(&model.SalesInvoice{}, id).Error
}

func (r *SalesInvoiceRepository) ExistsSubmittedPaymentForInvoice(db *gorm.DB, invoiceID uint) (bool, error) {
	var count int64
	err := db.Table("sales_payment_allocations spa").
		Joins("JOIN sales_payments sp ON sp.id = spa.sales_payment_id").
		Where("spa.sales_invoice_id = ? AND sp.document_status = ? AND sp.deleted_at IS NULL", invoiceID, model.DocumentStatusSubmitted).
		Count(&count).Error
	return count > 0, err
}
