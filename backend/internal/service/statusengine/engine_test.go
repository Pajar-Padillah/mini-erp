package statusengine

import (
	"testing"

	"github.com/shopspring/decimal"

	"mini-erp/internal/model"
)

func d(s string) decimal.Decimal {
	v, err := decimal.NewFromString(s)
	if err != nil {
		panic(err)
	}
	return v
}

func TestClassifyPull_ZeroPartialFull(t *testing.T) {
	cases := []struct {
		name          string
		total, pulled decimal.Decimal
		want          Tier
	}{
		{"nothing pulled", d("100"), d("0"), TierZero},
		{"partially pulled", d("100"), d("30"), TierPartial},
		{"exactly fully pulled", d("100"), d("100"), TierFull},
		{"over-pulled clamps to full", d("100"), d("120"), TierFull},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := ClassifyPull(c.total, c.pulled)
			if got != c.want {
				t.Fatalf("ClassifyPull(%s, %s) = %v, want %v", c.total, c.pulled, got, c.want)
			}
		})
	}
}

func TestCombineTiers_MixedLinesYieldsPartial(t *testing.T) {
	cases := []struct {
		name  string
		tiers []Tier
		want  Tier
	}{
		{"all zero", []Tier{TierZero, TierZero}, TierZero},
		{"all full", []Tier{TierFull, TierFull}, TierFull},
		{"one full one zero", []Tier{TierFull, TierZero}, TierPartial},
		{"one partial", []Tier{TierPartial}, TierPartial},
		{"empty", []Tier{}, TierZero},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := CombineTiers(c.tiers)
			if got != c.want {
				t.Fatalf("CombineTiers(%v) = %v, want %v", c.tiers, got, c.want)
			}
		})
	}
}

func TestInvoicePaymentStatusFromTier_MapsIndependentlyOfDocStatus(t *testing.T) {
	if InvoicePaymentStatusFromTier(TierZero) != model.PaymentStatusUnpaid {
		t.Fatal("expected UNPAID for zero tier")
	}
	if InvoicePaymentStatusFromTier(TierPartial) != model.PaymentStatusPartiallyPaid {
		t.Fatal("expected PARTIALLY_PAID for partial tier")
	}
	if InvoicePaymentStatusFromTier(TierFull) != model.PaymentStatusPaid {
		t.Fatal("expected PAID for full tier")
	}
	if InvoiceDocStatusFromTier(TierZero) != model.DocumentStatusActive {
		t.Fatal("expected ACTIVE document_status for zero tier")
	}
	if InvoiceDocStatusFromTier(TierFull) != model.DocumentStatusCompleted {
		t.Fatal("expected COMPLETED document_status for full tier")
	}
}
