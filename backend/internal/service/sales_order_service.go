package service

import (
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"mini-erp/internal/apperror"
	"mini-erp/internal/dto"
	"mini-erp/internal/model"
	"mini-erp/internal/repository"
	"mini-erp/internal/service/statusengine"
	"mini-erp/internal/transaction"
)

type SalesOrderService struct {
	tx        *transaction.Manager
	orderRepo *repository.SalesOrderRepository
	numbering *NumberingService
}

func NewSalesOrderService(tx *transaction.Manager, orderRepo *repository.SalesOrderRepository, numbering *NumberingService) *SalesOrderService {
	return &SalesOrderService{tx: tx, orderRepo: orderRepo, numbering: numbering}
}

func buildOrderItems(inputs []dto.SalesOrderItemInput) ([]model.SalesOrderItem, decimal.Decimal, error) {
	items := make([]model.SalesOrderItem, 0, len(inputs))
	total := decimal.Zero
	for i, in := range inputs {
		if in.QtyOrdered.LessThanOrEqual(decimal.Zero) {
			return nil, decimal.Zero, apperror.Wrap(apperror.ErrValidation, "qty_ordered must be greater than 0")
		}
		if in.UnitPrice.LessThan(decimal.Zero) {
			return nil, decimal.Zero, apperror.Wrap(apperror.ErrValidation, "unit_price must not be negative")
		}
		items = append(items, model.SalesOrderItem{
			LineNo:     i + 1,
			ProductID:  in.ProductID,
			QtyOrdered: in.QtyOrdered,
			UnitPrice:  in.UnitPrice,
		})
		total = total.Add(in.QtyOrdered.Mul(in.UnitPrice))
	}
	return items, total, nil
}

func (s *SalesOrderService) CreateDraft(req dto.CreateSalesOrderRequest) (*model.SalesOrder, error) {
	orderDate, err := parseDate(req.OrderDate)
	if err != nil {
		return nil, err
	}
	items, total, err := buildOrderItems(req.Items)
	if err != nil {
		return nil, err
	}

	var created *model.SalesOrder
	err = s.tx.WithinTransaction(func(tx *gorm.DB) error {
		number, err := s.numbering.Next(tx, req.CompanyID, model.DocTypeSalesOrder)
		if err != nil {
			return err
		}
		so := &model.SalesOrder{
			CompanyID:      req.CompanyID,
			OrderNo:        number,
			CustomerName:   req.CustomerName,
			OrderDate:      orderDate,
			DocumentStatus: model.DocumentStatusDraft,
			TotalAmount:    total,
			Notes:          req.Notes,
			CreatedBy:      req.CreatedBy,
		}
		if err := s.orderRepo.Create(tx, so); err != nil {
			return err
		}
		for i := range items {
			items[i].SalesOrderID = so.ID
		}
		if err := s.orderRepo.ReplaceItems(tx, so.ID, items); err != nil {
			return err
		}
		created = so
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.Get(created.ID, 0)
}

func (s *SalesOrderService) Update(id uint, req dto.UpdateSalesOrderRequest) (*model.SalesOrder, error) {
	orderDate, err := parseDate(req.OrderDate)
	if err != nil {
		return nil, err
	}
	items, total, err := buildOrderItems(req.Items)
	if err != nil {
		return nil, err
	}

	err = s.tx.WithinTransaction(func(tx *gorm.DB) error {
		so, err := s.orderRepo.FindByIDForUpdate(tx, id)
		if err != nil {
			return err
		}
		if so.DocumentStatus != model.DocumentStatusDraft {
			return apperror.Wrap(apperror.ErrInvalidStatus, "only DRAFT orders can be edited")
		}
		hasDeliveryItems, err := s.orderRepo.ExistsDeliveryItemForOrder(tx, id)
		if err != nil {
			return err
		}
		if hasDeliveryItems {
			return apperror.Wrap(apperror.ErrHasSubmittedChildren, "cannot edit line items: a delivery has already pulled from this order's lines")
		}
		so.CustomerName = req.CustomerName
		so.OrderDate = orderDate
		so.Notes = req.Notes
		so.TotalAmount = total
		if err := s.orderRepo.Save(tx, so); err != nil {
			return err
		}
		for i := range items {
			items[i].SalesOrderID = so.ID
		}
		return s.orderRepo.ReplaceItems(tx, so.ID, items)
	})
	if err != nil {
		return nil, err
	}
	return s.Get(id, 0)
}

func (s *SalesOrderService) Get(id uint, companyID uint) (*model.SalesOrder, error) {
	so, err := s.orderRepo.FindByID(s.tx.DB(), id, companyID)
	if err != nil {
		return nil, err
	}
	for i := range so.Items {
		pulled, err := s.orderRepo.SumSubmittedDeliveryQtyForOrderItem(s.tx.DB(), so.Items[i].ID)
		if err != nil {
			return nil, err
		}
		so.Items[i].RemainingQty = so.Items[i].QtyOrdered.Sub(pulled)
	}
	return so, nil
}

func (s *SalesOrderService) List(companyID uint, status string, p repository.PageRequest) ([]model.SalesOrder, repository.PageResult, error) {
	return s.orderRepo.List(s.tx.DB(), companyID, status, p)
}

func (s *SalesOrderService) Submit(id uint) (*model.SalesOrder, error) {
	err := s.tx.WithinTransaction(func(tx *gorm.DB) error {
		so, err := s.orderRepo.FindByIDForUpdate(tx, id)
		if err != nil {
			return err
		}
		if so.DocumentStatus != model.DocumentStatusDraft {
			return apperror.Wrap(apperror.ErrInvalidStatus, "only DRAFT orders can be submitted")
		}
		if len(so.Items) == 0 {
			return apperror.Wrap(apperror.ErrValidation, "order has no items")
		}
		now := nowPtr()
		so.DocumentStatus = model.DocumentStatusActive
		so.SubmittedAt = now
		return s.orderRepo.Save(tx, so)
	})
	if err != nil {
		return nil, err
	}
	return s.Get(id, 0)
}

func (s *SalesOrderService) Unsubmit(id uint) (*model.SalesOrder, error) {
	err := s.tx.WithinTransaction(func(tx *gorm.DB) error {
		so, err := s.orderRepo.FindByIDForUpdate(tx, id)
		if err != nil {
			return err
		}
		if so.DocumentStatus != model.DocumentStatusActive {
			return apperror.Wrap(apperror.ErrInvalidStatus, "only ACTIVE orders with no deliveries can be unsubmitted")
		}
		hasDeliveryItems, err := s.orderRepo.ExistsDeliveryItemForOrder(tx, id)
		if err != nil {
			return err
		}
		if hasDeliveryItems {
			return apperror.Wrap(apperror.ErrHasSubmittedChildren, "order has deliveries referencing its lines and cannot be unsubmitted")
		}
		so.DocumentStatus = model.DocumentStatusDraft
		so.SubmittedAt = nil
		return s.orderRepo.Save(tx, so)
	})
	if err != nil {
		return nil, err
	}
	return s.Get(id, 0)
}

func (s *SalesOrderService) Delete(id uint) error {
	return s.tx.WithinTransaction(func(tx *gorm.DB) error {
		so, err := s.orderRepo.FindByIDForUpdate(tx, id)
		if err != nil {
			return err
		}
		if so.DocumentStatus != model.DocumentStatusDraft {
			return apperror.Wrap(apperror.ErrHasSubmittedChildren, "only DRAFT orders can be deleted; unsubmit an ACTIVE order first")
		}
		return s.orderRepo.Delete(tx, id)
	})
}

func (s *SalesOrderService) RecalculateStatus(tx *gorm.DB, orderID uint) error {
	so, err := s.orderRepo.FindByIDForUpdate(tx, orderID)
	if err != nil {
		return err
	}
	if so.DocumentStatus != model.DocumentStatusActive &&
		so.DocumentStatus != model.DocumentStatusProcessed &&
		so.DocumentStatus != model.DocumentStatusCompleted {
		return nil
	}
	tiers := make([]statusengine.Tier, 0, len(so.Items))
	for _, item := range so.Items {
		pulled, err := s.orderRepo.SumSubmittedDeliveryQtyForOrderItem(tx, item.ID)
		if err != nil {
			return err
		}
		tiers = append(tiers, statusengine.ClassifyPull(item.QtyOrdered, pulled))
	}
	newStatus := statusengine.OrderStatusFromTier(statusengine.CombineTiers(tiers))
	if newStatus != so.DocumentStatus {
		so.DocumentStatus = newStatus
		return s.orderRepo.Save(tx, so)
	}
	return nil
}
