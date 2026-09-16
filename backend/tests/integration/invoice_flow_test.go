package integration

import (
	"testing"

	"mini-erp/internal/dto"
	"mini-erp/internal/model"
)

func TestSalesInvoiceService_Submit_PartialInvoice_SetsDeliveryProcessed(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	sd := createAndSubmitDelivery(t, env, fx.Company1ID, so, "10")
	createAndSubmitInvoice(t, env, fx.Company1ID, sd, "4")

	reloaded, err := env.deliveryService.Get(sd.ID, 0)
	if err != nil {
		t.Fatalf("get delivery: %v", err)
	}
	if reloaded.DocumentStatus != model.DocumentStatusProcessed {
		t.Fatalf("expected delivery PROCESSED, got %s", reloaded.DocumentStatus)
	}
}

func TestSalesInvoiceService_Submit_FullInvoice_SetsDeliveryCompleted(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	sd := createAndSubmitDelivery(t, env, fx.Company1ID, so, "10")
	createAndSubmitInvoice(t, env, fx.Company1ID, sd, "10")

	reloaded, err := env.deliveryService.Get(sd.ID, 0)
	if err != nil {
		t.Fatalf("get delivery: %v", err)
	}
	if reloaded.DocumentStatus != model.DocumentStatusCompleted {
		t.Fatalf("expected delivery COMPLETED, got %s", reloaded.DocumentStatus)
	}
}

func TestSalesInvoiceService_Submit_OverInvoiceRejected(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	sd := createAndSubmitDelivery(t, env, fx.Company1ID, so, "5")

	_, err := env.invoiceService.CreateDraft(dto.CreateSalesInvoiceRequest{
		CompanyID:   fx.Company1ID,
		InvoiceDate: "2026-01-03",
		Items: []dto.SalesInvoiceItemInput{
			{SourceDeliveryItemID: sd.Items[0].ID, Qty: mustDecimal("9")},
		},
	})
	if err == nil {
		t.Fatal("expected over-invoice to be rejected")
	}
}

func TestSalesInvoiceService_Unsubmit_RejectedWhenPaymentSubmitted(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	sd := createAndSubmitDelivery(t, env, fx.Company1ID, so, "10")
	si := createAndSubmitInvoice(t, env, fx.Company1ID, sd, "10")
	createAndSubmitPayment(t, env, fx.Company1ID, si.ID, "1000")

	if _, err := env.invoiceService.Unsubmit(si.ID); err == nil {
		t.Fatal("expected unsubmit to be rejected while a submitted payment exists")
	}
}

func TestSalesInvoiceService_MultiDeliveryPull_AggregatesAcrossDeliveries(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	sd1 := createAndSubmitDelivery(t, env, fx.Company1ID, so, "6")
	sd2 := createAndSubmitDelivery(t, env, fx.Company1ID, so, "4")

	si, err := env.invoiceService.CreateDraft(dto.CreateSalesInvoiceRequest{
		CompanyID:   fx.Company1ID,
		InvoiceDate: "2026-01-03",
		Items: []dto.SalesInvoiceItemInput{
			{SourceDeliveryItemID: sd1.Items[0].ID, Qty: mustDecimal("6")},
			{SourceDeliveryItemID: sd2.Items[0].ID, Qty: mustDecimal("4")},
		},
	})
	if err != nil {
		t.Fatalf("create invoice draft pulling from two deliveries: %v", err)
	}
	si, err = env.invoiceService.Submit(si.ID)
	if err != nil {
		t.Fatalf("submit invoice: %v", err)
	}
	if !si.TotalAmount.Equal(mustDecimal("10000")) {
		t.Fatalf("expected total 10000 (10 units * 1000), got %s", si.TotalAmount)
	}

	d1, _ := env.deliveryService.Get(sd1.ID, 0)
	d2, _ := env.deliveryService.Get(sd2.ID, 0)
	if d1.DocumentStatus != model.DocumentStatusCompleted || d2.DocumentStatus != model.DocumentStatusCompleted {
		t.Fatalf("expected both source deliveries COMPLETED, got %s and %s", d1.DocumentStatus, d2.DocumentStatus)
	}
}
