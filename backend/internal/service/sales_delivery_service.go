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

type SalesDeliveryService struct {
	tx           *transaction.Manager
	deliveryRepo *repository.SalesDeliveryRepository
	orderRepo    *repository.SalesOrderRepository
	numbering    *NumberingService
	stockService *StockService
	orderService *SalesOrderService
}

func NewSalesDeliveryService(
	tx *transaction.Manager,
	deliveryRepo *repository.SalesDeliveryRepository,
	orderRepo *repository.SalesOrderRepository,
	numbering *NumberingService,
	stockService *StockService,
	orderService *SalesOrderService,
) *SalesDeliveryService {
	return &SalesDeliveryService{
		tx: tx, deliveryRepo: deliveryRepo, orderRepo: orderRepo,
		numbering: numbering, stockService: stockService, orderService: orderService,
	}
}

func (s *SalesDeliveryService) buildDeliveryItems(tx *gorm.DB, so *model.SalesOrder, inputs []dto.SalesDeliveryItemInput) ([]model.SalesDeliveryItem, error) {
	itemsByID := make(map[uint]model.SalesOrderItem, len(so.Items))
	for _, it := range so.Items {
		itemsByID[it.ID] = it
	}

	items := make([]model.SalesDeliveryItem, 0, len(inputs))
	for i, in := range inputs {
		if in.Qty.LessThanOrEqual(decimal.Zero) {
			return nil, apperror.Wrap(apperror.ErrValidation, "qty must be greater than 0")
		}
		orderItem, ok := itemsByID[in.SourceOrderItemID]
		if !ok {
			return nil, apperror.Wrap(apperror.ErrValidation, "source order item does not belong to this order")
		}
		pulled, err := s.orderRepo.SumSubmittedDeliveryQtyForOrderItem(tx, orderItem.ID)
		if err != nil {
			return nil, err
		}
		remaining := orderItem.QtyOrdered.Sub(pulled)
		if in.Qty.GreaterThan(remaining) {
			return nil, apperror.Wrap(apperror.ErrOverDelivery, "delivery qty exceeds remaining order quantity")
		}
		items = append(items, model.SalesDeliveryItem{
			LineNo:            i + 1,
			SourceOrderItemID: orderItem.ID,
			ProductID:         orderItem.ProductID,
			Qty:               in.Qty,
			UnitPrice:         orderItem.UnitPrice,
		})
	}
	return items, nil
}

func (s *SalesDeliveryService) CreateDraft(req dto.CreateSalesDeliveryRequest) (*model.SalesDelivery, error) {
	deliveryDate, err := parseDate(req.DeliveryDate)
	if err != nil {
		return nil, err
	}

	var created *model.SalesDelivery
	err = s.tx.WithinTransaction(func(tx *gorm.DB) error {
		so, err := s.orderRepo.FindByIDForUpdate(tx, req.SalesOrderID)
		if err != nil {
			return err
		}
		companyID, err := ResolveDerivedCompany(tx, req.CompanyID, so.CompanyID)
		if err != nil {
			return err
		}
		if so.DocumentStatus != model.DocumentStatusActive && so.DocumentStatus != model.DocumentStatusProcessed {
			return apperror.Wrap(apperror.ErrInvalidStatus, "order must be ACTIVE or PROCESSED to create a delivery against it")
		}

		items, err := s.buildDeliveryItems(tx, so, req.Items)
		if err != nil {
			return err
		}

		number, err := s.numbering.Next(tx, companyID, model.DocTypeSalesDelivery)
		if err != nil {
			return err
		}
		sd := &model.SalesDelivery{
			CompanyID:      companyID,
			SalesOrderID:   req.SalesOrderID,
			DeliveryNo:     number,
			DeliveryDate:   deliveryDate,
			DocumentStatus: model.DocumentStatusDraft,
			Notes:          req.Notes,
		}
		if err := s.deliveryRepo.Create(tx, sd); err != nil {
			return err
		}
		for i := range items {
			items[i].SalesDeliveryID = sd.ID
		}
		if err := tx.Create(&items).Error; err != nil {
			return err
		}
		created = sd
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.Get(created.ID, 0)
}

func (s *SalesDeliveryService) Update(id uint, req dto.UpdateSalesDeliveryRequest) (*model.SalesDelivery, error) {
	deliveryDate, err := parseDate(req.DeliveryDate)
	if err != nil {
		return nil, err
	}

	err = s.tx.WithinTransaction(func(tx *gorm.DB) error {
		sd, err := s.deliveryRepo.FindByIDForUpdate(tx, id)
		if err != nil {
			return err
		}
		if sd.DocumentStatus != model.DocumentStatusDraft {
			return apperror.Wrap(apperror.ErrInvalidStatus, "only DRAFT deliveries can be edited")
		}
		hasInvoiceItems, err := s.deliveryRepo.ExistsInvoiceItemForDelivery(tx, id)
		if err != nil {
			return err
		}
		if hasInvoiceItems {
			return apperror.Wrap(apperror.ErrHasSubmittedChildren, "cannot edit line items: an invoice has already pulled from this delivery's lines")
		}
		so, err := s.orderRepo.FindByIDForUpdate(tx, sd.SalesOrderID)
		if err != nil {
			return err
		}

		items, err := s.buildDeliveryItems(tx, so, req.Items)
		if err != nil {
			return err
		}

		sd.DeliveryDate = deliveryDate
		sd.Notes = req.Notes
		if err := s.deliveryRepo.Save(tx, sd); err != nil {
			return err
		}
		for i := range items {
			items[i].SalesDeliveryID = sd.ID
		}
		return s.deliveryRepo.ReplaceItems(tx, sd.ID, items)
	})
	if err != nil {
		return nil, err
	}
	return s.Get(id, 0)
}

func (s *SalesDeliveryService) Get(id uint, companyID uint) (*model.SalesDelivery, error) {
	sd, err := s.deliveryRepo.FindByID(s.tx.DB(), id, companyID)
	if err != nil {
		return nil, err
	}
	for i := range sd.Items {
		pulled, err := s.deliveryRepo.SumSubmittedInvoiceQtyForDeliveryItem(s.tx.DB(), sd.Items[i].ID)
		if err != nil {
			return nil, err
		}
		sd.Items[i].RemainingQty = sd.Items[i].Qty.Sub(pulled)
	}
	return sd, nil
}

func (s *SalesDeliveryService) List(companyID, orderID uint, status string, p repository.PageRequest) ([]model.SalesDelivery, repository.PageResult, error) {
	return s.deliveryRepo.List(s.tx.DB(), companyID, orderID, status, p)
}

func (s *SalesDeliveryService) Submit(id uint) (*model.SalesDelivery, error) {
	err := s.tx.WithinTransaction(func(tx *gorm.DB) error {
		sd, err := s.deliveryRepo.FindByIDForUpdate(tx, id)
		if err != nil {
			return err
		}
		if sd.DocumentStatus != model.DocumentStatusDraft {
			return apperror.Wrap(apperror.ErrInvalidStatus, "only DRAFT deliveries can be submitted")
		}
		if len(sd.Items) == 0 {
			return apperror.Wrap(apperror.ErrValidation, "delivery has no items")
		}

		for _, item := range sd.Items {
			var orderItem model.SalesOrderItem
			if err := tx.First(&orderItem, item.SourceOrderItemID).Error; err != nil {
				return err
			}
			pulled, err := s.orderRepo.SumSubmittedDeliveryQtyForOrderItem(tx, orderItem.ID)
			if err != nil {
				return err
			}
			remaining := orderItem.QtyOrdered.Sub(pulled)
			if item.Qty.GreaterThan(remaining) {
				return apperror.Wrap(apperror.ErrOverDelivery, "delivery qty exceeds remaining order quantity")
			}
		}

		qtyByProduct := map[uint]decimal.Decimal{}
		for _, item := range sd.Items {
			qtyByProduct[item.ProductID] = qtyByProduct[item.ProductID].Add(item.Qty)
		}
		if err := s.stockService.DeductForDelivery(tx, sd.CompanyID, qtyByProduct); err != nil {
			return err
		}

		sd.DocumentStatus = model.DocumentStatusActive
		sd.SubmittedAt = nowPtr()
		if err := s.deliveryRepo.Save(tx, sd); err != nil {
			return err
		}

		return s.orderService.RecalculateStatus(tx, sd.SalesOrderID)
	})
	if err != nil {
		return nil, err
	}
	return s.Get(id, 0)
}

func (s *SalesDeliveryService) Unsubmit(id uint) (*model.SalesDelivery, error) {
	err := s.tx.WithinTransaction(func(tx *gorm.DB) error {
		sd, err := s.deliveryRepo.FindByIDForUpdate(tx, id)
		if err != nil {
			return err
		}
		if sd.DocumentStatus != model.DocumentStatusActive {
			return apperror.Wrap(apperror.ErrInvalidStatus, "only ACTIVE deliveries with no invoices can be unsubmitted")
		}
		hasInvoiceItems, err := s.deliveryRepo.ExistsInvoiceItemForDelivery(tx, id)
		if err != nil {
			return err
		}
		if hasInvoiceItems {
			return apperror.Wrap(apperror.ErrHasSubmittedChildren, "delivery has invoices referencing its lines and cannot be unsubmitted")
		}

		qtyByProduct := map[uint]decimal.Decimal{}
		for _, item := range sd.Items {
			qtyByProduct[item.ProductID] = qtyByProduct[item.ProductID].Add(item.Qty)
		}
		if err := s.stockService.RestoreForDelivery(tx, sd.CompanyID, qtyByProduct); err != nil {
			return err
		}

		sd.DocumentStatus = model.DocumentStatusDraft
		sd.SubmittedAt = nil
		if err := s.deliveryRepo.Save(tx, sd); err != nil {
			return err
		}

		return s.orderService.RecalculateStatus(tx, sd.SalesOrderID)
	})
	if err != nil {
		return nil, err
	}
	return s.Get(id, 0)
}

func (s *SalesDeliveryService) Delete(id uint) error {
	return s.tx.WithinTransaction(func(tx *gorm.DB) error {
		sd, err := s.deliveryRepo.FindByIDForUpdate(tx, id)
		if err != nil {
			return err
		}
		if sd.DocumentStatus != model.DocumentStatusDraft {
			return apperror.Wrap(apperror.ErrHasSubmittedChildren, "only DRAFT deliveries can be deleted; submitted deliveries must be unsubmitted first")
		}
		return s.deliveryRepo.Delete(tx, id)
	})
}

func (s *SalesDeliveryService) RecalculateStatus(tx *gorm.DB, deliveryID uint) error {
	sd, err := s.deliveryRepo.FindByIDForUpdate(tx, deliveryID)
	if err != nil {
		return err
	}
	if sd.DocumentStatus != model.DocumentStatusActive &&
		sd.DocumentStatus != model.DocumentStatusProcessed &&
		sd.DocumentStatus != model.DocumentStatusCompleted {
		return nil
	}
	tiers := make([]statusengine.Tier, 0, len(sd.Items))
	for _, item := range sd.Items {
		pulled, err := s.deliveryRepo.SumSubmittedInvoiceQtyForDeliveryItem(tx, item.ID)
		if err != nil {
			return err
		}
		tiers = append(tiers, statusengine.ClassifyPull(item.Qty, pulled))
	}
	newStatus := statusengine.DeliveryStatusFromTier(statusengine.CombineTiers(tiers))
	if newStatus != sd.DocumentStatus {
		sd.DocumentStatus = newStatus
		return s.deliveryRepo.Save(tx, sd)
	}
	return nil
}
