package integration

import (
	"sync"
	"testing"

	"mini-erp/internal/dto"
)

func TestSalesDeliveryService_ConcurrentSubmit_StockRaceRejectsOversell(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db) // stock = 100 for Product1 in Company1

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "200", "1000")

	sdA, err := env.deliveryService.CreateDraft(dto.CreateSalesDeliveryRequest{
		CompanyID:    fx.Company1ID,
		SalesOrderID: so.ID,
		DeliveryDate: "2026-01-02",
		Items: []dto.SalesDeliveryItemInput{
			{SourceOrderItemID: so.Items[0].ID, Qty: mustDecimal("70")},
		},
	})
	if err != nil {
		t.Fatalf("create delivery A: %v", err)
	}
	sdB, err := env.deliveryService.CreateDraft(dto.CreateSalesDeliveryRequest{
		CompanyID:    fx.Company1ID,
		SalesOrderID: so.ID,
		DeliveryDate: "2026-01-02",
		Items: []dto.SalesDeliveryItemInput{
			{SourceOrderItemID: so.Items[0].ID, Qty: mustDecimal("50")},
		},
	})
	if err != nil {
		t.Fatalf("create delivery B: %v", err)
	}

	var wg sync.WaitGroup
	var errA, errB error
	wg.Add(2)
	go func() {
		defer wg.Done()
		_, errA = env.deliveryService.Submit(sdA.ID)
	}()
	go func() {
		defer wg.Done()
		_, errB = env.deliveryService.Submit(sdB.ID)
	}()
	wg.Wait()

	succeeded := 0
	if errA == nil {
		succeeded++
	}
	if errB == nil {
		succeeded++
	}
	if succeeded != 1 {
		t.Fatalf("expected exactly one of the two racing deliveries to succeed, got %d (errA=%v, errB=%v)", succeeded, errA, errB)
	}

	final := stockQty(t, env.db, fx.Company1ID, fx.Product1ID)
	if final.IsNegative() {
		t.Fatalf("stock went negative: %s", final)
	}
	if !(final.Equal(mustDecimal("30")) || final.Equal(mustDecimal("50"))) {
		t.Fatalf("expected final stock 30 (A won) or 50 (B won), got %s", final)
	}
}
