package integration

import (
	"testing"

	"github.com/shopspring/decimal"

	"mini-erp/internal/dto"
	"mini-erp/internal/model"
)

func createSubmittedOrder(t *testing.T, env *testEnv, companyID, productID uint, qty, unitPrice string) *model.SalesOrder {
	t.Helper()
	so, err := env.orderService.CreateDraft(dto.CreateSalesOrderRequest{
		CompanyID:    companyID,
		CustomerName: "Test Customer",
		OrderDate:    "2026-01-01",
		Items: []dto.SalesOrderItemInput{
			{ProductID: productID, QtyOrdered: decimal.RequireFromString(qty), UnitPrice: decimal.RequireFromString(unitPrice)},
		},
	})
	if err != nil {
		t.Fatalf("create order draft: %v", err)
	}
	so, err = env.orderService.Submit(so.ID)
	if err != nil {
		t.Fatalf("submit order: %v", err)
	}
	return so
}

func createAndSubmitDelivery(t *testing.T, env *testEnv, companyID uint, order *model.SalesOrder, qty string) *model.SalesDelivery {
	t.Helper()
	sd, err := env.deliveryService.CreateDraft(dto.CreateSalesDeliveryRequest{
		CompanyID:    companyID,
		SalesOrderID: order.ID,
		DeliveryDate: "2026-01-02",
		Items: []dto.SalesDeliveryItemInput{
			{SourceOrderItemID: order.Items[0].ID, Qty: decimal.RequireFromString(qty)},
		},
	})
	if err != nil {
		t.Fatalf("create delivery draft: %v", err)
	}
	sd, err = env.deliveryService.Submit(sd.ID)
	if err != nil {
		t.Fatalf("submit delivery: %v", err)
	}
	return sd
}

func createAndSubmitInvoice(t *testing.T, env *testEnv, companyID uint, delivery *model.SalesDelivery, qty string) *model.SalesInvoice {
	t.Helper()
	si, err := env.invoiceService.CreateDraft(dto.CreateSalesInvoiceRequest{
		CompanyID:   companyID,
		InvoiceDate: "2026-01-03",
		Items: []dto.SalesInvoiceItemInput{
			{SourceDeliveryItemID: delivery.Items[0].ID, Qty: decimal.RequireFromString(qty)},
		},
	})
	if err != nil {
		t.Fatalf("create invoice draft: %v", err)
	}
	si, err = env.invoiceService.Submit(si.ID)
	if err != nil {
		t.Fatalf("submit invoice: %v", err)
	}
	return si
}

func createAndSubmitPayment(t *testing.T, env *testEnv, companyID uint, invoiceID uint, amount string) *model.SalesPayment {
	t.Helper()
	sp, err := env.paymentService.CreateDraft(dto.CreateSalesPaymentRequest{
		CompanyID:   companyID,
		PaymentDate: "2026-01-04",
		Allocations: []dto.SalesPaymentAllocationInput{
			{SalesInvoiceID: invoiceID, Amount: decimal.RequireFromString(amount)},
		},
	})
	if err != nil {
		t.Fatalf("create payment draft: %v", err)
	}
	sp, err = env.paymentService.Submit(sp.ID)
	if err != nil {
		t.Fatalf("submit payment: %v", err)
	}
	return sp
}
