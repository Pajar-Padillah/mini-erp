package service

import (
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"mini-erp/internal/apperror"
	"mini-erp/internal/dto"
	"mini-erp/internal/model"
	"mini-erp/internal/repository"
	"mini-erp/internal/transaction"
)

type SalesPaymentService struct {
	tx             *transaction.Manager
	paymentRepo    *repository.SalesPaymentRepository
	invoiceRepo    *repository.SalesInvoiceRepository
	numbering      *NumberingService
	invoiceService *SalesInvoiceService
}

func NewSalesPaymentService(
	tx *transaction.Manager,
	paymentRepo *repository.SalesPaymentRepository,
	invoiceRepo *repository.SalesInvoiceRepository,
	numbering *NumberingService,
	invoiceService *SalesInvoiceService,
) *SalesPaymentService {
	return &SalesPaymentService{
		tx: tx, paymentRepo: paymentRepo, invoiceRepo: invoiceRepo,
		numbering: numbering, invoiceService: invoiceService,
	}
}

func (s *SalesPaymentService) buildPaymentAllocations(tx *gorm.DB, companyID uint, inputs []dto.SalesPaymentAllocationInput) ([]model.SalesPaymentAllocation, decimal.Decimal, error) {
	allocations := make([]model.SalesPaymentAllocation, 0, len(inputs))
	total := decimal.Zero

	for i, in := range inputs {
		if in.Amount.LessThanOrEqual(decimal.Zero) {
			return nil, decimal.Zero, apperror.Wrap(apperror.ErrValidation, "allocation amount must be greater than 0")
		}
		var invoice model.SalesInvoice
		if err := tx.First(&invoice, in.SalesInvoiceID).Error; err != nil {
			return nil, decimal.Zero, apperror.Wrap(apperror.ErrValidation, "invoice not found")
		}
		if err := AssertSameCompany(companyID, invoice.CompanyID); err != nil {
			return nil, decimal.Zero, err
		}
		if invoice.DocumentStatus != model.DocumentStatusActive && invoice.DocumentStatus != model.DocumentStatusProcessed {
			return nil, decimal.Zero, apperror.Wrap(apperror.ErrInvalidStatus, "invoice must be ACTIVE or PROCESSED to accept payment")
		}
		outstanding := invoice.TotalAmount.Sub(invoice.PaidAmount)
		if in.Amount.GreaterThan(outstanding) {
			return nil, decimal.Zero, apperror.Wrap(apperror.ErrOverpayment, "allocation amount exceeds outstanding invoice amount")
		}
		allocations = append(allocations, model.SalesPaymentAllocation{
			LineNo:         i + 1,
			SalesInvoiceID: in.SalesInvoiceID,
			Amount:         in.Amount,
		})
		total = total.Add(in.Amount)
	}
	return allocations, total, nil
}

func (s *SalesPaymentService) CreateDraft(req dto.CreateSalesPaymentRequest) (*model.SalesPayment, error) {
	paymentDate, err := parseDate(req.PaymentDate)
	if err != nil {
		return nil, err
	}

	var created *model.SalesPayment
	err = s.tx.WithinTransaction(func(tx *gorm.DB) error {
		allocations, total, err := s.buildPaymentAllocations(tx, req.CompanyID, req.Allocations)
		if err != nil {
			return err
		}

		number, err := s.numbering.Next(tx, req.CompanyID, model.DocTypeSalesPayment)
		if err != nil {
			return err
		}
		sp := &model.SalesPayment{
			CompanyID:      req.CompanyID,
			PaymentNo:      number,
			PaymentDate:    paymentDate,
			PaymentMethod:  req.PaymentMethod,
			Notes:          req.Notes,
			DocumentStatus: model.DocumentStatusDraft,
			TotalAmount:    total,
		}
		if err := s.paymentRepo.Create(tx, sp); err != nil {
			return err
		}
		for i := range allocations {
			allocations[i].SalesPaymentID = sp.ID
		}
		if err := tx.Create(&allocations).Error; err != nil {
			return err
		}
		created = sp
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.paymentRepo.FindByID(s.tx.DB(), created.ID, 0)
}

func (s *SalesPaymentService) Update(id uint, req dto.UpdateSalesPaymentRequest) (*model.SalesPayment, error) {
	paymentDate, err := parseDate(req.PaymentDate)
	if err != nil {
		return nil, err
	}

	err = s.tx.WithinTransaction(func(tx *gorm.DB) error {
		sp, err := s.paymentRepo.FindByIDForUpdate(tx, id)
		if err != nil {
			return err
		}
		if sp.DocumentStatus != model.DocumentStatusDraft {
			return apperror.Wrap(apperror.ErrInvalidStatus, "only DRAFT payments can be edited")
		}

		allocations, total, err := s.buildPaymentAllocations(tx, sp.CompanyID, req.Allocations)
		if err != nil {
			return err
		}

		sp.PaymentDate = paymentDate
		sp.PaymentMethod = req.PaymentMethod
		sp.Notes = req.Notes
		sp.TotalAmount = total
		if err := s.paymentRepo.Save(tx, sp); err != nil {
			return err
		}
		for i := range allocations {
			allocations[i].SalesPaymentID = sp.ID
		}
		return s.paymentRepo.ReplaceAllocations(tx, sp.ID, allocations)
	})
	if err != nil {
		return nil, err
	}
	return s.paymentRepo.FindByID(s.tx.DB(), id, 0)
}

func (s *SalesPaymentService) Get(id uint, companyID uint) (*model.SalesPayment, error) {
	return s.paymentRepo.FindByID(s.tx.DB(), id, companyID)
}

func (s *SalesPaymentService) List(companyID uint, status string, p repository.PageRequest) ([]model.SalesPayment, repository.PageResult, error) {
	return s.paymentRepo.List(s.tx.DB(), companyID, status, p)
}

func (s *SalesPaymentService) Submit(id uint) (*model.SalesPayment, error) {
	err := s.tx.WithinTransaction(func(tx *gorm.DB) error {
		sp, err := s.paymentRepo.FindByIDForUpdate(tx, id)
		if err != nil {
			return err
		}
		if sp.DocumentStatus != model.DocumentStatusDraft {
			return apperror.Wrap(apperror.ErrInvalidStatus, "only DRAFT payments can be submitted")
		}
		if len(sp.Allocations) == 0 {
			return apperror.Wrap(apperror.ErrValidation, "payment has no allocations")
		}

		invoiceIDs := make([]uint, 0, len(sp.Allocations))
		for _, a := range sp.Allocations {
			invoiceIDs = append(invoiceIDs, a.SalesInvoiceID)
		}
		invoices, err := s.invoiceRepo.LockManyForUpdate(tx, invoiceIDs)
		if err != nil {
			return err
		}

		for _, a := range sp.Allocations {
			invoice, ok := invoices[a.SalesInvoiceID]
			if !ok {
				return apperror.Wrap(apperror.ErrNotFound, "allocated invoice not found")
			}
			outstanding := invoice.TotalAmount.Sub(invoice.PaidAmount)
			if a.Amount.GreaterThan(outstanding) {
				return apperror.Wrap(apperror.ErrOverpayment, "allocation amount exceeds outstanding invoice amount")
			}
		}

		for _, a := range sp.Allocations {
			invoice := invoices[a.SalesInvoiceID]
			if err := s.invoiceService.ApplyPaymentDelta(tx, invoice, a.Amount); err != nil {
				return err
			}
			invoices[a.SalesInvoiceID] = invoice
		}

		sp.DocumentStatus = model.DocumentStatusSubmitted
		sp.SubmittedAt = nowPtr()
		return s.paymentRepo.Save(tx, sp)
	})
	if err != nil {
		return nil, err
	}
	return s.paymentRepo.FindByID(s.tx.DB(), id, 0)
}

func (s *SalesPaymentService) Unsubmit(id uint) (*model.SalesPayment, error) {
	err := s.tx.WithinTransaction(func(tx *gorm.DB) error {
		sp, err := s.paymentRepo.FindByIDForUpdate(tx, id)
		if err != nil {
			return err
		}
		if sp.DocumentStatus != model.DocumentStatusSubmitted {
			return apperror.Wrap(apperror.ErrInvalidStatus, "only SUBMITTED payments can be unsubmitted")
		}

		invoiceIDs := make([]uint, 0, len(sp.Allocations))
		for _, a := range sp.Allocations {
			invoiceIDs = append(invoiceIDs, a.SalesInvoiceID)
		}
		invoices, err := s.invoiceRepo.LockManyForUpdate(tx, invoiceIDs)
		if err != nil {
			return err
		}

		for _, a := range sp.Allocations {
			invoice := invoices[a.SalesInvoiceID]
			if err := s.invoiceService.ApplyPaymentDelta(tx, invoice, a.Amount.Neg()); err != nil {
				return err
			}
		}

		sp.DocumentStatus = model.DocumentStatusDraft
		sp.SubmittedAt = nil
		return s.paymentRepo.Save(tx, sp)
	})
	if err != nil {
		return nil, err
	}
	return s.paymentRepo.FindByID(s.tx.DB(), id, 0)
}

func (s *SalesPaymentService) Delete(id uint) error {
	return s.tx.WithinTransaction(func(tx *gorm.DB) error {
		sp, err := s.paymentRepo.FindByIDForUpdate(tx, id)
		if err != nil {
			return err
		}
		if sp.DocumentStatus != model.DocumentStatusDraft {
			return apperror.Wrap(apperror.ErrHasSubmittedChildren, "only DRAFT payments can be deleted; submitted payments must be unsubmitted first")
		}
		return s.paymentRepo.Delete(tx, id)
	})
}
