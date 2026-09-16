package integration

import (
	"testing"

	"github.com/shopspring/decimal"

	"mini-erp/internal/dto"
	"mini-erp/internal/model"
)

func TestSalesDeliveryService_Submit_PartialDelivery_SetsOrderProcessed(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	createAndSubmitDelivery(t, env, fx.Company1ID, so, "4")

	reloaded, err := env.orderService.Get(so.ID, 0)
	if err != nil {
		t.Fatalf("get order: %v", err)
	}
	if reloaded.DocumentStatus != model.DocumentStatusProcessed {
		t.Fatalf("expected order PROCESSED, got %s", reloaded.DocumentStatus)
	}
}

func TestSalesDeliveryService_Submit_FullDelivery_SetsOrderCompleted(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	createAndSubmitDelivery(t, env, fx.Company1ID, so, "10")

	reloaded, err := env.orderService.Get(so.ID, 0)
	if err != nil {
		t.Fatalf("get order: %v", err)
	}
	if reloaded.DocumentStatus != model.DocumentStatusCompleted {
		t.Fatalf("expected order COMPLETED, got %s", reloaded.DocumentStatus)
	}
}

func TestSalesDeliveryService_Submit_PopulatesFullRemainingQty(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	sd := createAndSubmitDelivery(t, env, fx.Company1ID, so, "6")

	if !sd.Items[0].RemainingQty.Equal(mustDecimal("6")) {
		t.Fatalf("expected remaining_qty 6 on freshly submitted delivery, got %s", sd.Items[0].RemainingQty)
	}
}

func TestSalesDeliveryService_Submit_OverDeliveryRejected(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	_, err := env.deliveryService.CreateDraft(dto.CreateSalesDeliveryRequest{
		CompanyID:    fx.Company1ID,
		SalesOrderID: so.ID,
		DeliveryDate: "2026-01-02",
		Items: []dto.SalesDeliveryItemInput{
			{SourceOrderItemID: so.Items[0].ID, Qty: mustDecimal("15")},
		},
	})
	if err == nil {
		t.Fatal("expected over-delivery to be rejected")
	}
}

func TestSalesDeliveryService_Unsubmit_RejectedWhenInvoiceSubmitted(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	sd := createAndSubmitDelivery(t, env, fx.Company1ID, so, "5")
	createAndSubmitInvoice(t, env, fx.Company1ID, sd, "2")

	if _, err := env.deliveryService.Unsubmit(sd.ID); err == nil {
		t.Fatal("expected unsubmit to be rejected while a submitted invoice exists")
	}
}

func TestSalesDeliveryService_Unsubmit_RestoresStockAndRevertsOrder(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	before := stockQty(t, env.db, fx.Company1ID, fx.Product1ID)

	sd := createAndSubmitDelivery(t, env, fx.Company1ID, so, "4")
	afterDeduct := stockQty(t, env.db, fx.Company1ID, fx.Product1ID)
	if !afterDeduct.Equal(before.Sub(mustDecimal("4"))) {
		t.Fatalf("expected stock reduced by 4, before=%s after=%s", before, afterDeduct)
	}

	if _, err := env.deliveryService.Unsubmit(sd.ID); err != nil {
		t.Fatalf("unsubmit delivery: %v", err)
	}
	afterRestore := stockQty(t, env.db, fx.Company1ID, fx.Product1ID)
	if !afterRestore.Equal(before) {
		t.Fatalf("expected stock restored to %s, got %s", before, afterRestore)
	}

	order, err := env.orderService.Get(so.ID, 0)
	if err != nil {
		t.Fatalf("get order: %v", err)
	}
	if order.DocumentStatus != model.DocumentStatusActive {
		t.Fatalf("expected order to revert to ACTIVE, got %s", order.DocumentStatus)
	}
}

func TestSalesDeliveryService_ParentStatus_ProcessedToActive_WhenAllDeliveriesUnsubmitted(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	sd1 := createAndSubmitDelivery(t, env, fx.Company1ID, so, "3")
	sd2 := createAndSubmitDelivery(t, env, fx.Company1ID, so, "7")

	reloaded, _ := env.orderService.Get(so.ID, 0)
	if reloaded.DocumentStatus != model.DocumentStatusCompleted {
		t.Fatalf("expected COMPLETED after both deliveries, got %s", reloaded.DocumentStatus)
	}

	if _, err := env.deliveryService.Unsubmit(sd2.ID); err != nil {
		t.Fatalf("unsubmit sd2: %v", err)
	}
	reloaded, _ = env.orderService.Get(so.ID, 0)
	if reloaded.DocumentStatus != model.DocumentStatusProcessed {
		t.Fatalf("expected PROCESSED after partial unsubmit, got %s", reloaded.DocumentStatus)
	}

	if _, err := env.deliveryService.Unsubmit(sd1.ID); err != nil {
		t.Fatalf("unsubmit sd1: %v", err)
	}
	reloaded, _ = env.orderService.Get(so.ID, 0)
	if reloaded.DocumentStatus != model.DocumentStatusActive {
		t.Fatalf("expected ACTIVE after all deliveries unsubmitted, got %s", reloaded.DocumentStatus)
	}
}

func mustDecimal(s string) decimal.Decimal {
	return decimal.RequireFromString(s)
}
