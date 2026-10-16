package repository

import (
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"mini-erp/internal/model"
)

type SalesPaymentRepository struct{ db *gorm.DB }

func NewSalesPaymentRepository(db *gorm.DB) *SalesPaymentRepository {
	return &SalesPaymentRepository{db}
}

func (r *SalesPaymentRepository) Create(tx *gorm.DB, sp *model.SalesPayment) error {
	return tx.Create(sp).Error
}

func (r *SalesPaymentRepository) Save(tx *gorm.DB, sp *model.SalesPayment) error {
	return tx.Save(sp).Error
}

func (r *SalesPaymentRepository) ReplaceAllocations(tx *gorm.DB, paymentID uint, allocations []model.SalesPaymentAllocation) error {
	if err := tx.Where("sales_payment_id = ?", paymentID).Delete(&model.SalesPaymentAllocation{}).Error; err != nil {
		return err
	}
	if len(allocations) == 0 {
		return nil
	}
	return tx.Create(&allocations).Error
}

func (r *SalesPaymentRepository) FindByID(db *gorm.DB, id uint, companyID uint) (*model.SalesPayment, error) {
	var row model.SalesPayment
	q := db.Preload("Allocations").Preload("Allocations.SalesInvoice")
	if companyID != 0 {
		q = ScopeToCompany(q, companyID)
	}
	if err := q.First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *SalesPaymentRepository) FindByIDForUpdate(tx *gorm.DB, id uint) (*model.SalesPayment, error) {
	var row model.SalesPayment
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&row, id).Error; err != nil {
		return nil, err
	}
	if err := tx.Where("sales_payment_id = ?", id).Find(&row.Allocations).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *SalesPaymentRepository) List(db *gorm.DB, companyID uint, status string, p PageRequest) ([]model.SalesPayment, PageResult, error) {
	page, pageSize, offset := p.Normalized()
	q := ScopeToCompany(db.Model(&model.SalesPayment{}), companyID)
	q = WhereIn(q, "document_status", status)
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, PageResult{}, err
	}
	var rows []model.SalesPayment
	err := q.Order("id DESC").Offset(offset).Limit(pageSize).Find(&rows).Error
	return rows, PageResult{Page: page, PageSize: pageSize, TotalItems: total}, err
}

func (r *SalesPaymentRepository) Delete(tx *gorm.DB, id uint) error {
	if err := tx.Where("sales_payment_id = ?", id).Delete(&model.SalesPaymentAllocation{}).Error; err != nil {
		return err
	}
	return tx.Delete(&model.SalesPayment{}, id).Error
}
