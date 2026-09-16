package service

import (
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"mini-erp/internal/apperror"
	"mini-erp/internal/repository"
)

type StockService struct {
	stockRepo *repository.StockRepository
}

func NewStockService(stockRepo *repository.StockRepository) *StockService {
	return &StockService{stockRepo: stockRepo}
}

func (s *StockService) DeductForDelivery(tx *gorm.DB, companyID uint, qtyByProduct map[uint]decimal.Decimal) error {
	productIDs := make([]uint, 0, len(qtyByProduct))
	for pid := range qtyByProduct {
		productIDs = append(productIDs, pid)
	}
	stocks, err := s.stockRepo.LockForUpdate(tx, companyID, productIDs)
	if err != nil {
		return err
	}
	for pid, qty := range qtyByProduct {
		stock, ok := stocks[pid]
		if !ok || stock.QuantityOnHand.LessThan(qty) {
			return apperror.Wrap(apperror.ErrInsufficientStock, "insufficient stock for one or more products")
		}
	}
	for pid, qty := range qtyByProduct {
		if err := s.stockRepo.AdjustQuantity(tx, stocks[pid].ID, qty.Neg()); err != nil {
			return err
		}
	}
	return nil
}

func (s *StockService) RestoreForDelivery(tx *gorm.DB, companyID uint, qtyByProduct map[uint]decimal.Decimal) error {
	productIDs := make([]uint, 0, len(qtyByProduct))
	for pid := range qtyByProduct {
		productIDs = append(productIDs, pid)
	}
	stocks, err := s.stockRepo.LockForUpdate(tx, companyID, productIDs)
	if err != nil {
		return err
	}
	for pid, qty := range qtyByProduct {
		if err := s.stockRepo.AdjustQuantity(tx, stocks[pid].ID, qty); err != nil {
			return err
		}
	}
	return nil
}
