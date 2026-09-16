package integration

import (
	"testing"

	"mini-erp/internal/dto"
)

func TestMultiCompanyIsolation_CannotDeliverAgainstOtherCompanyOrder(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")

	_, err := env.deliveryService.CreateDraft(dto.CreateSalesDeliveryRequest{
		CompanyID:    fx.Company2ID, // mismatched on purpose
		SalesOrderID: so.ID,
		DeliveryDate: "2026-01-02",
		Items: []dto.SalesDeliveryItemInput{
			{SourceOrderItemID: so.Items[0].ID, Qty: mustDecimal("1")},
		},
	})
	if err == nil {
		t.Fatal("expected delivery creation to be rejected for cross-company order reference")
	}
}

func TestMultiCompanyIsolation_StockNotSharedAcrossCompanies(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	e1Before := stockQty(t, env.db, fx.Company1ID, fx.Product1ID)
	e2Before := stockQty(t, env.db, fx.Company2ID, fx.Product1ID)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	createAndSubmitDelivery(t, env, fx.Company1ID, so, "5")

	e1After := stockQty(t, env.db, fx.Company1ID, fx.Product1ID)
	e2After := stockQty(t, env.db, fx.Company2ID, fx.Product1ID)

	if !e1After.Equal(e1Before.Sub(mustDecimal("5"))) {
		t.Fatalf("expected company 1 stock reduced by 5, before=%s after=%s", e1Before, e1After)
	}
	if !e2After.Equal(e2Before) {
		t.Fatalf("expected company 2 stock untouched, before=%s after=%s", e2Before, e2After)
	}
}

func TestMultiCompanyIsolation_DocumentNumberingIsPerCompany(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	so1 := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "1", "1000")
	so2 := createSubmittedOrder(t, env, fx.Company2ID, fx.Product1ID, "1", "1000")

	if so1.OrderNo == so2.OrderNo {
		t.Fatalf("expected distinct order numbers across companies, got %s for both", so1.OrderNo)
	}
	wantSuffix := "-000001"
	if len(so1.OrderNo) < len(wantSuffix) || so1.OrderNo[len(so1.OrderNo)-len(wantSuffix):] != wantSuffix {
		t.Fatalf("expected so1 to end in %s, got %s", wantSuffix, so1.OrderNo)
	}
	if len(so2.OrderNo) < len(wantSuffix) || so2.OrderNo[len(so2.OrderNo)-len(wantSuffix):] != wantSuffix {
		t.Fatalf("expected so2 to end in %s, got %s", wantSuffix, so2.OrderNo)
	}
}
