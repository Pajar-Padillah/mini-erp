package integration

import (
	"testing"

	"github.com/shopspring/decimal"

	"mini-erp/internal/dto"
	"mini-erp/internal/model"
	"mini-erp/internal/repository"
)

type groupFixture struct {
	fixture
	GroupID uint
}

// seedGroupFixture makes Company1 and Company2 branches of a new group company.
func seedGroupFixture(t *testing.T, env *testEnv) groupFixture {
	t.Helper()
	fx := seedFixture(t, env.db)
	group := model.Company{Code: "T-GROUP", Name: "Test Group"}
	mustCreate(t, env.db, &group)
	if err := env.db.Model(&model.Company{}).Where("id IN ?", []uint{fx.Company1ID, fx.Company2ID}).
		Update("parent_id", group.ID).Error; err != nil {
		t.Fatalf("failed to attach branches: %v", err)
	}
	qty := decimal.RequireFromString("100")
	for _, pid := range []uint{fx.Product1ID, fx.Product2ID} {
		mustCreate(t, env.db, &model.Stock{CompanyID: group.ID, ProductID: pid, QuantityOnHand: qty})
	}
	return groupFixture{fixture: fx, GroupID: group.ID}
}

func listOrderIDs(t *testing.T, env *testEnv, companyID uint) map[uint]bool {
	t.Helper()
	rows, _, err := env.orderService.List(companyID, "", repository.PageRequest{Page: 1, PageSize: 100})
	if err != nil {
		t.Fatalf("list orders: %v", err)
	}
	ids := make(map[uint]bool, len(rows))
	for _, r := range rows {
		ids[r.ID] = true
	}
	return ids
}

func TestCompanyGroup_GroupSeesAllBranchesBranchSeesOnlyItself(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedGroupFixture(t, env)

	groupSO := createSubmittedOrder(t, env, fx.GroupID, fx.Product1ID, "1", "1000")
	branch1SO := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "1", "1000")
	branch2SO := createSubmittedOrder(t, env, fx.Company2ID, fx.Product1ID, "1", "1000")

	group := listOrderIDs(t, env, fx.GroupID)
	if !group[groupSO.ID] || !group[branch1SO.ID] || !group[branch2SO.ID] || len(group) != 3 {
		t.Fatalf("group should see its own and all branch orders, got %v", group)
	}

	branch1 := listOrderIDs(t, env, fx.Company1ID)
	if !branch1[branch1SO.ID] || len(branch1) != 1 {
		t.Fatalf("branch should only see its own orders, got %v", branch1)
	}

	if _, err := env.orderService.Get(branch2SO.ID, fx.GroupID); err != nil {
		t.Fatalf("group should be able to open a branch order: %v", err)
	}
	if _, err := env.orderService.Get(branch2SO.ID, fx.Company1ID); err == nil {
		t.Fatal("branch should not be able to open a sibling branch order")
	}
	if _, err := env.orderService.Get(groupSO.ID, fx.Company1ID); err == nil {
		t.Fatal("branch should not be able to open a group order")
	}
}

func TestCompanyGroup_DeliveryFromBranchOrderStaysInBranch(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedGroupFixture(t, env)

	so := createSubmittedOrder(t, env, fx.Company1ID, fx.Product1ID, "10", "1000")
	branchBefore := stockQty(t, env.db, fx.Company1ID, fx.Product1ID)
	groupBefore := stockQty(t, env.db, fx.GroupID, fx.Product1ID)

	// Created while the group is selected: the delivery follows its source order.
	sd := createAndSubmitDelivery(t, env, fx.GroupID, so, "4")
	if sd.CompanyID != fx.Company1ID {
		t.Fatalf("expected delivery to belong to the order's branch %d, got %d", fx.Company1ID, sd.CompanyID)
	}
	if got := stockQty(t, env.db, fx.Company1ID, fx.Product1ID); !got.Equal(branchBefore.Sub(decimal.RequireFromString("4"))) {
		t.Fatalf("expected branch stock reduced by 4, before=%s after=%s", branchBefore, got)
	}
	if got := stockQty(t, env.db, fx.GroupID, fx.Product1ID); !got.Equal(groupBefore) {
		t.Fatalf("expected group stock untouched, before=%s after=%s", groupBefore, got)
	}
}

func TestCompanyGroup_BranchCannotUseGroupOrSiblingDocuments(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedGroupFixture(t, env)

	for name, ownerID := range map[string]uint{"group": fx.GroupID, "sibling": fx.Company2ID} {
		so := createSubmittedOrder(t, env, ownerID, fx.Product1ID, "5", "1000")
		_, err := env.deliveryService.CreateDraft(dto.CreateSalesDeliveryRequest{
			CompanyID:    fx.Company1ID,
			SalesOrderID: so.ID,
			DeliveryDate: "2026-01-02",
			Items:        []dto.SalesDeliveryItemInput{{SourceOrderItemID: so.Items[0].ID, Qty: mustDecimal("1")}},
		})
		if err == nil {
			t.Fatalf("branch should not deliver against a %s order", name)
		}
	}
}

func TestCompanyGroup_PaymentCannotMixBranches(t *testing.T) {
	env := setupTestEnv(t)
	fx := seedGroupFixture(t, env)

	inv1 := fullyInvoicedInvoice(t, env, fx.Company1ID, fx.Product1ID, "1")
	inv2 := fullyInvoicedInvoice(t, env, fx.Company2ID, fx.Product1ID, "1")

	_, err := env.paymentService.CreateDraft(dto.CreateSalesPaymentRequest{
		CompanyID:     fx.GroupID,
		PaymentDate:   "2026-01-05",
		PaymentMethod: "TRANSFER",
		Allocations: []dto.SalesPaymentAllocationInput{
			{SalesInvoiceID: inv1.ID, Amount: mustDecimal("100")},
			{SalesInvoiceID: inv2.ID, Amount: mustDecimal("100")},
		},
	})
	if err == nil {
		t.Fatal("expected a payment spanning two branches to be rejected")
	}
}
