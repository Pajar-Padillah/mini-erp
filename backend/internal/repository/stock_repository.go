package repository

import (
	"sort"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"mini-erp/internal/model"
)

type StockRepository struct{ db *gorm.DB }

func NewStockRepository(db *gorm.DB) *StockRepository { return &StockRepository{db} }

func (r *StockRepository) List(companyID uint) ([]model.Stock, error) {
	var rows []model.Stock
	q := r.db.Preload("Product.Brand").Order("product_id")
	if companyID != 0 {
		q = ScopeToCompany(q, companyID)
	}
	err := q.Find(&rows).Error
	return rows, err
}

func (r *StockRepository) LockForUpdate(tx *gorm.DB, companyID uint, productIDs []uint) (map[uint]*model.Stock, error) {
	ids := append([]uint(nil), productIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	var rows []model.Stock
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("company_id = ? AND product_id IN ?", companyID, ids).
		Order("product_id").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	byProduct := make(map[uint]*model.Stock, len(rows))
	for i := range rows {
		byProduct[rows[i].ProductID] = &rows[i]
	}
	return byProduct, nil
}

func (r *StockRepository) AdjustQuantity(tx *gorm.DB, stockID uint, delta decimal.Decimal) error {
	return tx.Model(&model.Stock{}).Where("id = ?", stockID).
		Update("quantity_on_hand", gorm.Expr("quantity_on_hand + ?", delta)).Error
}
