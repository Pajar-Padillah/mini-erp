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

type SalesInvoiceService struct {
	tx              *transaction.Manager
	invoiceRepo     *repository.SalesInvoiceRepository
	deliveryRepo    *repository.SalesDeliveryRepository
	numbering       *NumberingService
	deliveryService *SalesDeliveryService
}

func NewSalesInvoiceService(
	tx *transaction.Manager,
	invoiceRepo *repository.SalesInvoiceRepository,
	deliveryRepo *repository.SalesDeliveryRepository,
	numbering *NumberingService,
	deliveryService *SalesDeliveryService,
) *SalesInvoiceService {
	return &SalesInvoiceService{
		tx: tx, invoiceRepo: invoiceRepo, deliveryRepo: deliveryRepo,
		numbering: numbering, deliveryService: deliveryService,
	}
}

// buildInvoiceItems also returns the company that owns the source deliveries.
func (s *SalesInvoiceService) buildInvoiceItems(tx *gorm.DB, inputs []dto.SalesInvoiceItemInput) ([]model.SalesInvoiceItem, decimal.Decimal, uint, error) {
	items := make([]model.SalesInvoiceItem, 0, len(inputs))
	total := decimal.Zero
	sourceCompanyIDs := make([]uint, 0, len(inputs))

	for i, in := range inputs {
		if in.Qty.LessThanOrEqual(decimal.Zero) {
			return nil, decimal.Zero, 0, apperror.Wrap(apperror.ErrValidation, "qty must be greater than 0")
		}
		var deliveryItem model.SalesDeliveryItem
		if err := tx.First(&deliveryItem, in.SourceDeliveryItemID).Error; err != nil {
			return nil, decimal.Zero, 0, apperror.Wrap(apperror.ErrValidation, "source delivery item not found")
		}
		var delivery model.SalesDelivery
		if err := tx.First(&delivery, deliveryItem.SalesDeliveryID).Error; err != nil {
			return nil, decimal.Zero, 0, err
		}
		sourceCompanyIDs = append(sourceCompanyIDs, delivery.CompanyID)
		if delivery.DocumentStatus != model.DocumentStatusActive && delivery.DocumentStatus != model.DocumentStatusProcessed {
			return nil, decimal.Zero, 0, apperror.Wrap(apperror.ErrInvalidStatus, "delivery must be ACTIVE or PROCESSED to invoice against it")
		}

		pulled, err := s.deliveryRepo.SumSubmittedInvoiceQtyForDeliveryItem(tx, deliveryItem.ID)
		if err != nil {
			return nil, decimal.Zero, 0, err
		}
		remaining := deliveryItem.Qty.Sub(pulled)
		if in.Qty.GreaterThan(remaining) {
			return nil, decimal.Zero, 0, apperror.Wrap(apperror.ErrOverInvoice, "invoice qty exceeds remaining delivered quantity")
		}

		items = append(items, model.SalesInvoiceItem{
			LineNo:               i + 1,
			SourceDeliveryItemID: deliveryItem.ID,
			ProductID:            deliveryItem.ProductID,
			Qty:                  in.Qty,
			UnitPrice:            deliveryItem.UnitPrice,
		})
		total = total.Add(in.Qty.Mul(deliveryItem.UnitPrice))
	}
	sourceCompanyID, err := SingleSourceCompany(sourceCompanyIDs)
	if err != nil {
		return nil, decimal.Zero, 0, err
	}
	return items, total, sourceCompanyID, nil
}

func (s *SalesInvoiceService) CreateDraft(req dto.CreateSalesInvoiceRequest) (*model.SalesInvoice, error) {
	invoiceDate, err := parseDate(req.InvoiceDate)
	if err != nil {
		return nil, err
	}

	var created *model.SalesInvoice
	err = s.tx.WithinTransaction(func(tx *gorm.DB) error {
		items, total, sourceCompanyID, err := s.buildInvoiceItems(tx, req.Items)
		if err != nil {
			return err
		}
		companyID, err := ResolveDerivedCompany(tx, req.CompanyID, sourceCompanyID)
		if err != nil {
			return err
		}

		number, err := s.numbering.Next(tx, companyID, model.DocTypeSalesInvoice)
		if err != nil {
			return err
		}
		si := &model.SalesInvoice{
			CompanyID:      companyID,
			InvoiceNo:      number,
			InvoiceDate:    invoiceDate,
			Notes:          req.Notes,
			DocumentStatus: model.DocumentStatusDraft,
			PaymentStatus:  model.PaymentStatusUnpaid,
			TotalAmount:    total,
			PaidAmount:     decimal.Zero,
		}
		if err := s.invoiceRepo.Create(tx, si); err != nil {
			return err
		}
		for i := range items {
			items[i].SalesInvoiceID = si.ID
		}
		if err := tx.Create(&items).Error; err != nil {
			return err
		}
		created = si
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.invoiceRepo.FindByID(s.tx.DB(), created.ID, 0)
}

func (s *SalesInvoiceService) Update(id uint, req dto.UpdateSalesInvoiceRequest) (*model.SalesInvoice, error) {
	invoiceDate, err := parseDate(req.InvoiceDate)
	if err != nil {
		return nil, err
	}

	err = s.tx.WithinTransaction(func(tx *gorm.DB) error {
		si, err := s.invoiceRepo.FindByIDForUpdate(tx, id)
		if err != nil {
			return err
		}
		if si.DocumentStatus != model.DocumentStatusDraft {
			return apperror.Wrap(apperror.ErrInvalidStatus, "only DRAFT invoices can be edited")
		}

		items, total, sourceCompanyID, err := s.buildInvoiceItems(tx, req.Items)
		if err != nil {
			return err
		}
		if err := AssertSameCompany(si.CompanyID, sourceCompanyID); err != nil {
			return err
		}

		si.InvoiceDate = invoiceDate
		si.Notes = req.Notes
		si.TotalAmount = total
		if err := s.invoiceRepo.Save(tx, si); err != nil {
			return err
		}
		for i := range items {
			items[i].SalesInvoiceID = si.ID
		}
		return s.invoiceRepo.ReplaceItems(tx, si.ID, items)
	})
	if err != nil {
		return nil, err
	}
	return s.invoiceRepo.FindByID(s.tx.DB(), id, 0)
}

func (s *SalesInvoiceService) Get(id uint, companyID uint) (*model.SalesInvoice, error) {
	return s.invoiceRepo.FindByID(s.tx.DB(), id, companyID)
}

func (s *SalesInvoiceService) List(companyID uint, status, paymentStatus string, p repository.PageRequest) ([]model.SalesInvoice, repository.PageResult, error) {
	return s.invoiceRepo.List(s.tx.DB(), companyID, status, paymentStatus, p)
}

func (s *SalesInvoiceService) Submit(id uint) (*model.SalesInvoice, error) {
	err := s.tx.WithinTransaction(func(tx *gorm.DB) error {
		si, err := s.invoiceRepo.FindByIDForUpdate(tx, id)
		if err != nil {
			return err
		}
		if si.DocumentStatus != model.DocumentStatusDraft {
			return apperror.Wrap(apperror.ErrInvalidStatus, "only DRAFT invoices can be submitted")
		}
		if len(si.Items) == 0 {
			return apperror.Wrap(apperror.ErrValidation, "invoice has no items")
		}

		deliveryIDs := map[uint]struct{}{}
		for _, item := range si.Items {
			var deliveryItem model.SalesDeliveryItem
			if err := tx.First(&deliveryItem, item.SourceDeliveryItemID).Error; err != nil {
				return err
			}
			pulled, err := s.deliveryRepo.SumSubmittedInvoiceQtyForDeliveryItem(tx, deliveryItem.ID)
			if err != nil {
				return err
			}
			remaining := deliveryItem.Qty.Sub(pulled)
			if item.Qty.GreaterThan(remaining) {
				return apperror.Wrap(apperror.ErrOverInvoice, "invoice qty exceeds remaining delivered quantity")
			}
			deliveryIDs[deliveryItem.SalesDeliveryID] = struct{}{}
		}

		si.DocumentStatus = model.DocumentStatusActive
		si.SubmittedAt = nowPtr()
		if err := s.invoiceRepo.Save(tx, si); err != nil {
			return err
		}

		for deliveryID := range deliveryIDs {
			if err := s.deliveryService.RecalculateStatus(tx, deliveryID); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.invoiceRepo.FindByID(s.tx.DB(), id, 0)
}

func (s *SalesInvoiceService) Unsubmit(id uint) (*model.SalesInvoice, error) {
	err := s.tx.WithinTransaction(func(tx *gorm.DB) error {
		si, err := s.invoiceRepo.FindByIDForUpdate(tx, id)
		if err != nil {
			return err
		}
		if si.DocumentStatus != model.DocumentStatusActive {
			return apperror.Wrap(apperror.ErrInvalidStatus, "only ACTIVE invoices with no payments can be unsubmitted")
		}
		hasSubmitted, err := s.invoiceRepo.ExistsSubmittedPaymentForInvoice(tx, id)
		if err != nil {
			return err
		}
		if hasSubmitted {
			return apperror.Wrap(apperror.ErrHasSubmittedChildren, "invoice has submitted payments and cannot be unsubmitted")
		}

		deliveryIDs := map[uint]struct{}{}
		for _, item := range si.Items {
			var deliveryItem model.SalesDeliveryItem
			if err := tx.First(&deliveryItem, item.SourceDeliveryItemID).Error; err != nil {
				return err
			}
			deliveryIDs[deliveryItem.SalesDeliveryID] = struct{}{}
		}

		si.DocumentStatus = model.DocumentStatusDraft
		si.SubmittedAt = nil
		if err := s.invoiceRepo.Save(tx, si); err != nil {
			return err
		}

		for deliveryID := range deliveryIDs {
			if err := s.deliveryService.RecalculateStatus(tx, deliveryID); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.invoiceRepo.FindByID(s.tx.DB(), id, 0)
}

func (s *SalesInvoiceService) Delete(id uint) error {
	return s.tx.WithinTransaction(func(tx *gorm.DB) error {
		si, err := s.invoiceRepo.FindByIDForUpdate(tx, id)
		if err != nil {
			return err
		}
		if si.DocumentStatus != model.DocumentStatusDraft {
			return apperror.Wrap(apperror.ErrHasSubmittedChildren, "only DRAFT invoices can be deleted; submitted invoices must be unsubmitted first")
		}
		return s.invoiceRepo.Delete(tx, id)
	})
}

func (s *SalesInvoiceService) ApplyPaymentDelta(tx *gorm.DB, invoice *model.SalesInvoice, delta decimal.Decimal) error {
	newPaid := invoice.PaidAmount.Add(delta)
	if newPaid.LessThan(decimal.Zero) {
		newPaid = decimal.Zero
	}
	if newPaid.GreaterThan(invoice.TotalAmount) {
		return apperror.Wrap(apperror.ErrOverpayment, "payment amount exceeds outstanding invoice amount")
	}
	invoice.PaidAmount = newPaid
	tier := statusengine.ClassifyPull(invoice.TotalAmount, newPaid)
	invoice.PaymentStatus = statusengine.InvoicePaymentStatusFromTier(tier)
	if invoice.DocumentStatus == model.DocumentStatusActive ||
		invoice.DocumentStatus == model.DocumentStatusProcessed ||
		invoice.DocumentStatus == model.DocumentStatusCompleted {
		invoice.DocumentStatus = statusengine.InvoiceDocStatusFromTier(tier)
	}
	return s.invoiceRepo.Save(tx, invoice)
}
