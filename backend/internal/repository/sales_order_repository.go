package repository

import (
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"mini-erp/internal/model"
)

type SalesOrderRepository struct{ db *gorm.DB }

func NewSalesOrderRepository(db *gorm.DB) *SalesOrderRepository { return &SalesOrderRepository{db} }

func (r *SalesOrderRepository) Create(tx *gorm.DB, so *model.SalesOrder) error {
	return tx.Create(so).Error
}

func (r *SalesOrderRepository) Save(tx *gorm.DB, so *model.SalesOrder) error {
	return tx.Save(so).Error
}

func (r *SalesOrderRepository) ReplaceItems(tx *gorm.DB, orderID uint, items []model.SalesOrderItem) error {
	if err := tx.Where("sales_order_id = ?", orderID).Delete(&model.SalesOrderItem{}).Error; err != nil {
		return err
	}
	if len(items) == 0 {
		return nil
	}
	return tx.Create(&items).Error
}

func (r *SalesOrderRepository) FindByID(db *gorm.DB, id uint, companyID uint) (*model.SalesOrder, error) {
	var row model.SalesOrder
	q := db.Preload("Items").Preload("Items.Product").Preload("Company")
	if companyID != 0 {
		q = ScopeToCompany(q, companyID)
	}
	if err := q.First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *SalesOrderRepository) FindByIDForUpdate(tx *gorm.DB, id uint) (*model.SalesOrder, error) {
	var row model.SalesOrder
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&row, id).Error; err != nil {
		return nil, err
	}
	if err := tx.Preload("Product").Where("sales_order_id = ?", id).Find(&row.Items).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *SalesOrderRepository) List(db *gorm.DB, companyID uint, status string, p PageRequest) ([]model.SalesOrder, PageResult, error) {
	page, pageSize, offset := p.Normalized()
	q := ScopeToCompany(db.Model(&model.SalesOrder{}), companyID)
	if status != "" {
		q = q.Where("document_status = ?", status)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, PageResult{}, err
	}
	var rows []model.SalesOrder
	err := q.Order("id DESC").Offset(offset).Limit(pageSize).Find(&rows).Error
	return rows, PageResult{Page: page, PageSize: pageSize, TotalItems: total}, err
}

func (r *SalesOrderRepository) Delete(tx *gorm.DB, id uint) error {
	if err := tx.Where("sales_order_id = ?", id).Delete(&model.SalesOrderItem{}).Error; err != nil {
		return err
	}
	return tx.Delete(&model.SalesOrder{}, id).Error
}

func (r *SalesOrderRepository) SumSubmittedDeliveryQtyForOrderItem(db *gorm.DB, orderItemID uint) (decimal.Decimal, error) {
	var sum decimal.NullDecimal
	err := db.Table("sales_delivery_items sdi").
		Joins("JOIN sales_deliveries sd ON sd.id = sdi.sales_delivery_id").
		Where("sdi.source_order_item_id = ? AND sd.document_status != ? AND sd.deleted_at IS NULL", orderItemID, model.DocumentStatusDraft).
		Select("COALESCE(SUM(sdi.qty), 0)").
		Scan(&sum).Error
	if err != nil {
		return decimal.Zero, err
	}
	if !sum.Valid {
		return decimal.Zero, nil
	}
	return sum.Decimal, nil
}

func (r *SalesOrderRepository) ExistsDeliveryItemForOrder(db *gorm.DB, orderID uint) (bool, error) {
	var count int64
	err := db.Table("sales_delivery_items sdi").
		Joins("JOIN sales_order_items soi ON soi.id = sdi.source_order_item_id").
		Where("soi.sales_order_id = ?", orderID).
		Count(&count).Error
	return count > 0, err
}
