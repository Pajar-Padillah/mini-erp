package integration

import (
	"testing"

	"mini-erp/internal/dto"
)

func TestSalesDeliveryService_Submit_InsufficientStockRejected(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "150", "1000")
	sd, err := env.deliveryService.CreateDraft(dto.CreateSalesDeliveryRequest{
		CompanyID:    fx.Company1ID,
		SalesOrderID: so.ID,
		DeliveryDate: "2026-01-02",
		Items: []dto.SalesDeliveryItemInput{
			{SourceOrderItemID: so.Items[0].ID, Qty: mustDecimal("120")},
		},
	})
	if err != nil {
		t.Fatalf("create delivery draft: %v", err)
	}

	before := stockQty(t, env.db, fx.Company1ID, fx.Product1ID)
	if _, err := env.deliveryService.Submit(sd.ID); err == nil {
		t.Fatal("expected submit to be rejected for insufficient stock")
	}
	after := stockQty(t, env.db, fx.Company1ID, fx.Product1ID)
	if !after.Equal(before) {
		t.Fatalf("expected stock unchanged after rejected submit, before=%s after=%s", before, after)
	}
}

func TestSalesDeliveryService_Unsubmit_RestoresStock(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	before := stockQty(t, env.db, fx.Company1ID, fx.Product1ID)

	sd := createAndSubmitDelivery(t, env, fx.Company1ID, so, "6")
	if _, err := env.deliveryService.Unsubmit(sd.ID); err != nil {
		t.Fatalf("unsubmit: %v", err)
	}
	after := stockQty(t, env.db, fx.Company1ID, fx.Product1ID)
	if !after.Equal(before) {
		t.Fatalf("expected stock restored to %s, got %s", before, after)
	}
}
