package integration

import (
	"testing"

	"mini-erp/internal/dto"
	"mini-erp/internal/model"
)

func fullyInvoicedInvoice(t *testing.T, env *testEnv, companyID, productID uint, qty string) *model.SalesInvoice {
	t.Helper()
	so := createSubmittedOrder(t, env, companyID, productID, qty, "1000")
	sd := createAndSubmitDelivery(t, env, companyID, so, qty)
	return createAndSubmitInvoice(t, env, companyID, sd, qty)
}

func TestSalesPaymentService_Submit_PartialPayment_SetsInvoicePartiallyPaid(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	si := fullyInvoicedInvoice(t, env, fx.Company1ID, fx.Product1ID, "10")
	createAndSubmitPayment(t, env, fx.Company1ID, si.ID, "4000")

	reloaded, err := env.invoiceService.Get(si.ID, 0)
	if err != nil {
		t.Fatalf("get invoice: %v", err)
	}
	if reloaded.PaymentStatus != model.PaymentStatusPartiallyPaid {
		t.Fatalf("expected PARTIALLY_PAID, got %s", reloaded.PaymentStatus)
	}
	if reloaded.DocumentStatus != model.DocumentStatusProcessed {
		t.Fatalf("expected document_status PROCESSED, got %s", reloaded.DocumentStatus)
	}
	if !reloaded.PaidAmount.Equal(mustDecimal("4000")) {
		t.Fatalf("expected paid_amount 4000, got %s", reloaded.PaidAmount)
	}
}

func TestSalesPaymentService_Submit_FullPayment_SetsInvoicePaidAndCompleted(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	si := fullyInvoicedInvoice(t, env, fx.Company1ID, fx.Product1ID, "10")
	createAndSubmitPayment(t, env, fx.Company1ID, si.ID, "10000")

	reloaded, err := env.invoiceService.Get(si.ID, 0)
	if err != nil {
		t.Fatalf("get invoice: %v", err)
	}
	if reloaded.PaymentStatus != model.PaymentStatusPaid {
		t.Fatalf("expected PAID, got %s", reloaded.PaymentStatus)
	}
	if reloaded.DocumentStatus != model.DocumentStatusCompleted {
		t.Fatalf("expected document_status COMPLETED, got %s", reloaded.DocumentStatus)
	}
}

func TestSalesPaymentService_Submit_MultiInvoiceAllocation(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	invA := fullyInvoicedInvoice(t, env, fx.Company1ID, fx.Product1ID, "6")
	invB := fullyInvoicedInvoice(t, env, fx.Company1ID, fx.Product2ID, "4")

	sp, err := env.paymentService.CreateDraft(dto.CreateSalesPaymentRequest{
		CompanyID:   fx.Company1ID,
		PaymentDate: "2026-01-04",
		Allocations: []dto.SalesPaymentAllocationInput{
			{SalesInvoiceID: invA.ID, Amount: mustDecimal("6000")},
			{SalesInvoiceID: invB.ID, Amount: mustDecimal("4000")},
		},
	})
	if err != nil {
		t.Fatalf("create payment draft: %v", err)
	}
	if _, err := env.paymentService.Submit(sp.ID); err != nil {
		t.Fatalf("submit payment: %v", err)
	}

	a, _ := env.invoiceService.Get(invA.ID, 0)
	b, _ := env.invoiceService.Get(invB.ID, 0)
	if a.PaymentStatus != model.PaymentStatusPaid || b.PaymentStatus != model.PaymentStatusPaid {
		t.Fatalf("expected both invoices PAID, got %s and %s", a.PaymentStatus, b.PaymentStatus)
	}
}

func TestSalesInvoiceService_MultiplePaymentsAccumulate_ToPaid(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	si := fullyInvoicedInvoice(t, env, fx.Company1ID, fx.Product1ID, "10")
	createAndSubmitPayment(t, env, fx.Company1ID, si.ID, "3000")
	createAndSubmitPayment(t, env, fx.Company1ID, si.ID, "4000")
	createAndSubmitPayment(t, env, fx.Company1ID, si.ID, "3000")

	reloaded, _ := env.invoiceService.Get(si.ID, 0)
	if reloaded.PaymentStatus != model.PaymentStatusPaid {
		t.Fatalf("expected PAID after three payments, got %s", reloaded.PaymentStatus)
	}
	if !reloaded.PaidAmount.Equal(mustDecimal("10000")) {
		t.Fatalf("expected paid_amount 10000, got %s", reloaded.PaidAmount)
	}
}

func TestSalesPaymentService_Submit_OverpaymentRejected(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	si := fullyInvoicedInvoice(t, env, fx.Company1ID, fx.Product1ID, "10")

	_, err := env.paymentService.CreateDraft(dto.CreateSalesPaymentRequest{
		CompanyID:   fx.Company1ID,
		PaymentDate: "2026-01-04",
		Allocations: []dto.SalesPaymentAllocationInput{
			{SalesInvoiceID: si.ID, Amount: mustDecimal("15000")},
		},
	})
	if err == nil {
		t.Fatal("expected overpayment to be rejected at draft time")
	}

	sp1, err := env.paymentService.CreateDraft(dto.CreateSalesPaymentRequest{
		CompanyID:   fx.Company1ID,
		PaymentDate: "2026-01-04",
		Allocations: []dto.SalesPaymentAllocationInput{{SalesInvoiceID: si.ID, Amount: mustDecimal("8000")}},
	})
	if err != nil {
		t.Fatalf("create sp1: %v", err)
	}
	sp2, err := env.paymentService.CreateDraft(dto.CreateSalesPaymentRequest{
		CompanyID:   fx.Company1ID,
		PaymentDate: "2026-01-04",
		Allocations: []dto.SalesPaymentAllocationInput{{SalesInvoiceID: si.ID, Amount: mustDecimal("8000")}},
	})
	if err != nil {
		t.Fatalf("create sp2: %v", err)
	}
	if _, err := env.paymentService.Submit(sp1.ID); err != nil {
		t.Fatalf("submit sp1: %v", err)
	}
	if _, err := env.paymentService.Submit(sp2.ID); err == nil {
		t.Fatal("expected sp2 submit to be rejected: would overpay the invoice")
	}
}

func TestSalesPaymentService_Unsubmit_RevertsAllocationAndInvoiceStatus(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	si := fullyInvoicedInvoice(t, env, fx.Company1ID, fx.Product1ID, "10")
	sp := createAndSubmitPayment(t, env, fx.Company1ID, si.ID, "10000")

	reloaded, _ := env.invoiceService.Get(si.ID, 0)
	if reloaded.PaymentStatus != model.PaymentStatusPaid {
		t.Fatalf("expected PAID before unsubmit, got %s", reloaded.PaymentStatus)
	}

	if _, err := env.paymentService.Unsubmit(sp.ID); err != nil {
		t.Fatalf("unsubmit payment: %v", err)
	}

	reloaded, _ = env.invoiceService.Get(si.ID, 0)
	if reloaded.PaymentStatus != model.PaymentStatusUnpaid {
		t.Fatalf("expected UNPAID after full unsubmit, got %s", reloaded.PaymentStatus)
	}
	if reloaded.DocumentStatus != model.DocumentStatusActive {
		t.Fatalf("expected document_status ACTIVE after full unsubmit, got %s", reloaded.DocumentStatus)
	}
	if !reloaded.PaidAmount.IsZero() {
		t.Fatalf("expected paid_amount 0, got %s", reloaded.PaidAmount)
	}
}

func TestSalesInvoiceService_PaidToPartiallyPaid_AfterOnePaymentUnsubmitted(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	si := fullyInvoicedInvoice(t, env, fx.Company1ID, fx.Product1ID, "10")
	sp1 := createAndSubmitPayment(t, env, fx.Company1ID, si.ID, "4000")
	createAndSubmitPayment(t, env, fx.Company1ID, si.ID, "6000")

	reloaded, _ := env.invoiceService.Get(si.ID, 0)
	if reloaded.PaymentStatus != model.PaymentStatusPaid {
		t.Fatalf("expected PAID, got %s", reloaded.PaymentStatus)
	}

	if _, err := env.paymentService.Unsubmit(sp1.ID); err != nil {
		t.Fatalf("unsubmit sp1: %v", err)
	}

	reloaded, _ = env.invoiceService.Get(si.ID, 0)
	if reloaded.PaymentStatus != model.PaymentStatusPartiallyPaid {
		t.Fatalf("expected PARTIALLY_PAID after partial unsubmit, got %s", reloaded.PaymentStatus)
	}
	if !reloaded.PaidAmount.Equal(mustDecimal("6000")) {
		t.Fatalf("expected paid_amount 6000, got %s", reloaded.PaidAmount)
	}
}
