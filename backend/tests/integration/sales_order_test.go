package integration

import (
	"testing"

	"mini-erp/internal/dto"
	"mini-erp/internal/model"
)

func TestSalesOrderService_Submit_DraftToActive(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	if so.DocumentStatus != model.DocumentStatusActive {
		t.Fatalf("expected ACTIVE, got %s", so.DocumentStatus)
	}
	if so.SubmittedAt == nil {
		t.Fatal("expected submitted_at to be set")
	}
}

func TestSalesOrderService_Delete_RejectedWhenPartiallyDelivered(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	createAndSubmitDelivery(t, env, fx.Company1ID, so, "3")

	if err := env.orderService.Delete(so.ID); err == nil {
		t.Fatal("expected delete to be rejected for a partially delivered order")
	}
}

func TestSalesOrderService_UnsubmitThenDelete_CancelsAnUndeliveredOrder(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	if _, err := env.orderService.Unsubmit(so.ID); err != nil {
		t.Fatalf("expected unsubmit to succeed before any delivery: %v", err)
	}
	if err := env.orderService.Delete(so.ID); err != nil {
		t.Fatalf("expected delete to succeed once back in DRAFT: %v", err)
	}
}

func TestSalesOrderService_Unsubmit_RejectedWhenDeliverySubmitted(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	createAndSubmitDelivery(t, env, fx.Company1ID, so, "3")

	if _, err := env.orderService.Unsubmit(so.ID); err == nil {
		t.Fatal("expected unsubmit to be rejected while a submitted delivery exists")
	}
}

func TestSalesOrderService_CreateDraft_PopulatesFullRemainingQty(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so, err := env.orderService.CreateDraft(dto.CreateSalesOrderRequest{
		CompanyID:    fx.Company1ID,
		CustomerName: "Test Customer",
		OrderDate:    "2026-01-01",
		Items: []dto.SalesOrderItemInput{
			{ProductID: fx.Product1ID, QtyOrdered: mustDecimal("10"), UnitPrice: mustDecimal("1000")},
		},
	})
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}

	if !so.Items[0].RemainingQty.Equal(mustDecimal("10")) {
		t.Fatalf("expected remaining_qty 10 on freshly created draft, got %s", so.Items[0].RemainingQty)
	}
}

func TestSalesOrderService_Update_ReplacesItemsAndRecalculatesTotal(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so, err := env.orderService.CreateDraft(dto.CreateSalesOrderRequest{
		CompanyID:    fx.Company1ID,
		CustomerName: "Original Customer",
		OrderDate:    "2026-01-01",
		Items: []dto.SalesOrderItemInput{
			{ProductID: fx.Product1ID, QtyOrdered: mustDecimal("5"), UnitPrice: mustDecimal("1000")},
		},
	})
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}

	updated, err := env.orderService.Update(so.ID, dto.UpdateSalesOrderRequest{
		CustomerName: "Edited Customer",
		OrderDate:    "2026-01-02",
		Notes:        "edited",
		Items: []dto.SalesOrderItemInput{
			{ProductID: fx.Product2ID, QtyOrdered: mustDecimal("9"), UnitPrice: mustDecimal("2000")},
		},
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.CustomerName != "Edited Customer" {
		t.Fatalf("expected customer name to be updated, got %s", updated.CustomerName)
	}
	if !updated.TotalAmount.Equal(mustDecimal("18000")) {
		t.Fatalf("expected recalculated total 18000, got %s", updated.TotalAmount)
	}
	if len(updated.Items) != 1 || updated.Items[0].ProductID != fx.Product2ID {
		t.Fatalf("expected items replaced with the new line, got %+v", updated.Items)
	}
	if !updated.Items[0].RemainingQty.Equal(mustDecimal("9")) {
		t.Fatalf("expected remaining_qty 9 after update, got %s", updated.Items[0].RemainingQty)
	}
}

func TestSalesOrderService_Update_RejectedWhenNotDraft(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")

	_, err := env.orderService.Update(so.ID, dto.UpdateSalesOrderRequest{
		CustomerName: "Should Not Apply",
		OrderDate:    "2026-01-02",
		Items: []dto.SalesOrderItemInput{
			{ProductID: fx.Product1ID, QtyOrdered: mustDecimal("1"), UnitPrice: mustDecimal("1000")},
		},
	})
	if err == nil {
		t.Fatal("expected update to be rejected for a non-DRAFT order")
	}
}

func TestSalesOrderService_Unsubmit_AllowedWhenNoDeliveries(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	reverted, err := env.orderService.Unsubmit(so.ID)
	if err != nil {
		t.Fatalf("expected unsubmit to succeed with no deliveries: %v", err)
	}
	if reverted.DocumentStatus != model.DocumentStatusDraft {
		t.Fatalf("expected DRAFT, got %s", reverted.DocumentStatus)
	}
}
