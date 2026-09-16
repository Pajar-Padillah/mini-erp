package statusengine

import (
	"github.com/shopspring/decimal"

	"mini-erp/internal/model"
)

type Tier int

const (
	TierZero Tier = iota
	TierPartial
	TierFull
)

func ClassifyPull(total, pulled decimal.Decimal) Tier {
	switch {
	case pulled.LessThanOrEqual(decimal.Zero):
		return TierZero
	case pulled.GreaterThanOrEqual(total):
		return TierFull
	default:
		return TierPartial
	}
}

func CombineTiers(tiers []Tier) Tier {
	if len(tiers) == 0 {
		return TierZero
	}
	allZero, allFull := true, true
	for _, t := range tiers {
		if t != TierZero {
			allZero = false
		}
		if t != TierFull {
			allFull = false
		}
	}
	switch {
	case allZero:
		return TierZero
	case allFull:
		return TierFull
	default:
		return TierPartial
	}
}

func OrderStatusFromTier(t Tier) model.DocumentStatus {
	return fromTier(t)
}

func DeliveryStatusFromTier(t Tier) model.DocumentStatus {
	return fromTier(t)
}

func InvoiceDocStatusFromTier(t Tier) model.DocumentStatus {
	return fromTier(t)
}

func InvoicePaymentStatusFromTier(t Tier) model.PaymentStatus {
	switch t {
	case TierZero:
		return model.PaymentStatusUnpaid
	case TierFull:
		return model.PaymentStatusPaid
	default:
		return model.PaymentStatusPartiallyPaid
	}
}

func fromTier(t Tier) model.DocumentStatus {
	switch t {
	case TierZero:
		return model.DocumentStatusActive
	case TierFull:
		return model.DocumentStatusCompleted
	default:
		return model.DocumentStatusProcessed
	}
}
