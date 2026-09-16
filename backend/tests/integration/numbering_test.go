package integration

import (
	"fmt"
	"sync"
	"testing"

	"mini-erp/internal/dto"
)

func TestNumberingService_ConcurrentCreate_NoDuplicateNumbers(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedFixture(t, env.db)

	const n = 20
	numbers := make([]string, n)
	errs := make([]error, n)

	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			so, err := env.orderService.CreateDraft(dto.CreateSalesOrderRequest{
				CompanyID:    fx.Company1ID,
				CustomerName: fmt.Sprintf("Customer %d", i),
				OrderDate:    "2026-01-01",
				Items: []dto.SalesOrderItemInput{
					{ProductID: fx.Product1ID, QtyOrdered: mustDecimal("1"), UnitPrice: mustDecimal("1000")},
				},
			})
			if err != nil {
				errs[i] = err
				return
			}
			numbers[i] = so.OrderNo
		}(i)
	}
	wg.Wait()

	seen := make(map[string]bool, n)
	for i, err := range errs {
		if err != nil {
			t.Fatalf("goroutine %d failed to create order: %v", i, err)
		}
		if seen[numbers[i]] {
			t.Fatalf("duplicate order number generated concurrently: %s", numbers[i])
		}
		seen[numbers[i]] = true
	}
	if len(seen) != n {
		t.Fatalf("expected %d unique order numbers, got %d", n, len(seen))
	}
}
