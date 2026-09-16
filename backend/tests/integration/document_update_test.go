package integration

import (
	"testing"

	"mini-erp/internal/dto"
)

func TestSalesOrderService_EditAfterFailedDeliveryDeleted_Succeeds(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "150", "1000") // exceeds the 100 units of stock
	sd, err := env.deliveryService.CreateDraft(dto.CreateSalesDeliveryRequest{
		CompanyID:    fx.Company1ID,
		SalesOrderID: so.ID,
		DeliveryDate: "2026-01-02",
		Items: []dto.SalesDeliveryItemInput{
			{SourceOrderItemID: so.Items[0].ID, Qty: mustDecimal("120")},
		},
	})
	if err != nil {
		t.Fatalf("create draft delivery: %v", err)
	}

	if _, err := env.deliveryService.Submit(sd.ID); err == nil {
		t.Fatal("expected submit to fail for insufficient stock")
	}

	if err := env.deliveryService.Delete(sd.ID); err != nil {
		t.Fatalf("delete draft delivery: %v", err)
	}

	if _, err := env.orderService.Unsubmit(so.ID); err != nil {
		t.Fatalf("unsubmit order after deleting the failed delivery: %v", err)
	}

	updated, err := env.orderService.Update(so.ID, dto.UpdateSalesOrderRequest{
		CustomerName: "Test Customer",
		OrderDate:    "2026-01-01",
		Items: []dto.SalesOrderItemInput{
			{ProductID: fx.Product1ID, QtyOrdered: mustDecimal("100"), UnitPrice: mustDecimal("1000")},
		},
	})
	if err != nil {
		t.Fatalf("update order to a stock-safe qty: %v", err)
	}
	if !updated.Items[0].QtyOrdered.Equal(mustDecimal("100")) {
		t.Fatalf("expected qty updated to 100, got %s", updated.Items[0].QtyOrdered)
	}
}

func TestSalesOrderService_Unsubmit_RejectedWhenDraftDeliveryStillReferencesOrder(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	_, err := env.deliveryService.CreateDraft(dto.CreateSalesDeliveryRequest{
		CompanyID:    fx.Company1ID,
		SalesOrderID: so.ID,
		DeliveryDate: "2026-01-02",
		Items: []dto.SalesDeliveryItemInput{
			{SourceOrderItemID: so.Items[0].ID, Qty: mustDecimal("5")},
		},
	})
	if err != nil {
		t.Fatalf("create draft delivery: %v", err)
	}

	if _, err := env.orderService.Unsubmit(so.ID); err == nil {
		t.Fatal("expected unsubmit to be rejected while a draft delivery still references the order's lines")
	}
}

func TestSalesDeliveryService_Update_ReplacesItems(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "20", "1000")
	sd, err := env.deliveryService.CreateDraft(dto.CreateSalesDeliveryRequest{
		CompanyID:    fx.Company1ID,
		SalesOrderID: so.ID,
		DeliveryDate: "2026-01-02",
		Items: []dto.SalesDeliveryItemInput{
			{SourceOrderItemID: so.Items[0].ID, Qty: mustDecimal("5")},
		},
	})
	if err != nil {
		t.Fatalf("create draft delivery: %v", err)
	}

	updated, err := env.deliveryService.Update(sd.ID, dto.UpdateSalesDeliveryRequest{
		DeliveryDate: "2026-01-03",
		Notes:        "revised qty",
		Items: []dto.SalesDeliveryItemInput{
			{SourceOrderItemID: so.Items[0].ID, Qty: mustDecimal("8")},
		},
	})
	if err != nil {
		t.Fatalf("update draft delivery: %v", err)
	}
	if len(updated.Items) != 1 || !updated.Items[0].Qty.Equal(mustDecimal("8")) {
		t.Fatalf("expected qty updated to 8, got %+v", updated.Items)
	}
	if updated.Notes != "revised qty" {
		t.Fatalf("expected notes updated, got %q", updated.Notes)
	}
}

func TestSalesDeliveryService_Update_RejectedWhenNotDraft(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "20", "1000")
	sd := createAndSubmitDelivery(t, env, fx.Company1ID, so, "5")

	_, err := env.deliveryService.Update(sd.ID, dto.UpdateSalesDeliveryRequest{
		DeliveryDate: "2026-01-03",
		Items: []dto.SalesDeliveryItemInput{
			{SourceOrderItemID: so.Items[0].ID, Qty: mustDecimal("1")},
		},
	})
	if err == nil {
		t.Fatal("expected update to be rejected for a non-DRAFT delivery")
	}
}

func TestSalesDeliveryService_Update_OverDeliveryStillRejected(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	sd, err := env.deliveryService.CreateDraft(dto.CreateSalesDeliveryRequest{
		CompanyID:    fx.Company1ID,
		SalesOrderID: so.ID,
		DeliveryDate: "2026-01-02",
		Items: []dto.SalesDeliveryItemInput{
			{SourceOrderItemID: so.Items[0].ID, Qty: mustDecimal("5")},
		},
	})
	if err != nil {
		t.Fatalf("create draft delivery: %v", err)
	}

	_, err = env.deliveryService.Update(sd.ID, dto.UpdateSalesDeliveryRequest{
		DeliveryDate: "2026-01-02",
		Items: []dto.SalesDeliveryItemInput{
			{SourceOrderItemID: so.Items[0].ID, Qty: mustDecimal("15")},
		},
	})
	if err == nil {
		t.Fatal("expected over-delivery to be rejected on update as well as create")
	}
}

func TestSalesDeliveryService_EditAfterDraftInvoiceDeleted_Succeeds(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	sd := createAndSubmitDelivery(t, env, fx.Company1ID, so, "10")

	si, err := env.invoiceService.CreateDraft(dto.CreateSalesInvoiceRequest{
		CompanyID:   fx.Company1ID,
		InvoiceDate: "2026-01-03",
		Items: []dto.SalesInvoiceItemInput{
			{SourceDeliveryItemID: sd.Items[0].ID, Qty: mustDecimal("4")},
		},
	})
	if err != nil {
		t.Fatalf("create draft invoice: %v", err)
	}

	if err := env.invoiceService.Delete(si.ID); err != nil {
		t.Fatalf("delete draft invoice: %v", err)
	}

	if _, err := env.deliveryService.Unsubmit(sd.ID); err != nil {
		t.Fatalf("unsubmit delivery after deleting the draft invoice: %v", err)
	}

	updated, err := env.deliveryService.Update(sd.ID, dto.UpdateSalesDeliveryRequest{
		DeliveryDate: "2026-01-02",
		Items: []dto.SalesDeliveryItemInput{
			{SourceOrderItemID: so.Items[0].ID, Qty: mustDecimal("7")},
		},
	})
	if err != nil {
		t.Fatalf("update delivery after deleting the draft invoice: %v", err)
	}
	if !updated.Items[0].Qty.Equal(mustDecimal("7")) {
		t.Fatalf("expected qty updated to 7, got %s", updated.Items[0].Qty)
	}
}

func TestSalesInvoiceService_Update_ReplacesItemsAndRecalculatesTotal(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	sd := createAndSubmitDelivery(t, env, fx.Company1ID, so, "10")
	si, err := env.invoiceService.CreateDraft(dto.CreateSalesInvoiceRequest{
		CompanyID:   fx.Company1ID,
		InvoiceDate: "2026-01-03",
		Items: []dto.SalesInvoiceItemInput{
			{SourceDeliveryItemID: sd.Items[0].ID, Qty: mustDecimal("4")},
		},
	})
	if err != nil {
		t.Fatalf("create draft invoice: %v", err)
	}

	updated, err := env.invoiceService.Update(si.ID, dto.UpdateSalesInvoiceRequest{
		InvoiceDate: "2026-01-04",
		Items: []dto.SalesInvoiceItemInput{
			{SourceDeliveryItemID: sd.Items[0].ID, Qty: mustDecimal("7")},
		},
	})
	if err != nil {
		t.Fatalf("update draft invoice: %v", err)
	}
	if !updated.TotalAmount.Equal(mustDecimal("7000")) {
		t.Fatalf("expected recalculated total 7000, got %s", updated.TotalAmount)
	}
}

func TestSalesInvoiceService_Update_RejectedWhenNotDraft(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	sd := createAndSubmitDelivery(t, env, fx.Company1ID, so, "10")
	si := createAndSubmitInvoice(t, env, fx.Company1ID, sd, "4")

	_, err := env.invoiceService.Update(si.ID, dto.UpdateSalesInvoiceRequest{
		InvoiceDate: "2026-01-04",
		Items: []dto.SalesInvoiceItemInput{
			{SourceDeliveryItemID: sd.Items[0].ID, Qty: mustDecimal("1")},
		},
	})
	if err == nil {
		t.Fatal("expected update to be rejected for a non-DRAFT invoice")
	}
}

func TestSalesPaymentService_Update_ReplacesAllocationsAndRecalculatesTotal(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	sd := createAndSubmitDelivery(t, env, fx.Company1ID, so, "10")
	si := createAndSubmitInvoice(t, env, fx.Company1ID, sd, "10") // total 10000

	sp, err := env.paymentService.CreateDraft(dto.CreateSalesPaymentRequest{
		CompanyID:     fx.Company1ID,
		PaymentDate:   "2026-01-04",
		PaymentMethod: "CASH",
		Allocations: []dto.SalesPaymentAllocationInput{
			{SalesInvoiceID: si.ID, Amount: mustDecimal("3000")},
		},
	})
	if err != nil {
		t.Fatalf("create draft payment: %v", err)
	}

	updated, err := env.paymentService.Update(sp.ID, dto.UpdateSalesPaymentRequest{
		PaymentDate:   "2026-01-05",
		PaymentMethod: "TRANSFER",
		Allocations: []dto.SalesPaymentAllocationInput{
			{SalesInvoiceID: si.ID, Amount: mustDecimal("6000")},
		},
	})
	if err != nil {
		t.Fatalf("update draft payment: %v", err)
	}
	if !updated.TotalAmount.Equal(mustDecimal("6000")) {
		t.Fatalf("expected recalculated total 6000, got %s", updated.TotalAmount)
	}
	if updated.PaymentMethod != "TRANSFER" {
		t.Fatalf("expected payment method updated, got %s", updated.PaymentMethod)
	}

	if _, err := env.paymentService.Submit(updated.ID); err != nil {
		t.Fatalf("submit edited payment: %v", err)
	}
	invoice, _ := env.invoiceService.Get(si.ID, 0)
	if !invoice.PaidAmount.Equal(mustDecimal("6000")) {
		t.Fatalf("expected invoice paid_amount 6000 after submitting edited payment, got %s", invoice.PaidAmount)
	}
}

func TestSalesPaymentService_Update_RejectedWhenNotDraft(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	sd := createAndSubmitDelivery(t, env, fx.Company1ID, so, "10")
	si := createAndSubmitInvoice(t, env, fx.Company1ID, sd, "10")
	sp := createAndSubmitPayment(t, env, fx.Company1ID, si.ID, "5000")

	_, err := env.paymentService.Update(sp.ID, dto.UpdateSalesPaymentRequest{
		PaymentDate: "2026-01-05",
		Allocations: []dto.SalesPaymentAllocationInput{
			{SalesInvoiceID: si.ID, Amount: mustDecimal("1000")},
		},
	})
	if err == nil {
		t.Fatal("expected update to be rejected for a SUBMITTED payment")
	}
}

func TestSalesPaymentService_Update_OverpaymentStillRejected(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	sd := createAndSubmitDelivery(t, env, fx.Company1ID, so, "10")
	si := createAndSubmitInvoice(t, env, fx.Company1ID, sd, "10") // total 10000

	sp, err := env.paymentService.CreateDraft(dto.CreateSalesPaymentRequest{
		CompanyID:   fx.Company1ID,
		PaymentDate: "2026-01-04",
		Allocations: []dto.SalesPaymentAllocationInput{
			{SalesInvoiceID: si.ID, Amount: mustDecimal("3000")},
		},
	})
	if err != nil {
		t.Fatalf("create draft payment: %v", err)
	}

	_, err = env.paymentService.Update(sp.ID, dto.UpdateSalesPaymentRequest{
		PaymentDate: "2026-01-04",
		Allocations: []dto.SalesPaymentAllocationInput{
			{SalesInvoiceID: si.ID, Amount: mustDecimal("15000")},
		},
	})
	if err == nil {
		t.Fatal("expected overpayment to still be rejected when editing a draft payment")
	}
}
