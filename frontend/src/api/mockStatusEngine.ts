// Port of internal/service/statusengine/engine.go: how far a document's lines have been pulled
// by downstream documents decides its status.
import { ZERO, type Dec } from './mockDecimal'
import type { DocumentStatus, PaymentStatus } from '../types/common'

export type Tier = 'ZERO' | 'PARTIAL' | 'FULL'

export function classifyPull(total: Dec, pulled: Dec): Tier {
  if (pulled <= ZERO) return 'ZERO'
  if (pulled >= total) return 'FULL'
  return 'PARTIAL'
}

export function combineTiers(tiers: Tier[]): Tier {
  if (tiers.length === 0 || tiers.every((t) => t === 'ZERO')) return 'ZERO'
  if (tiers.every((t) => t === 'FULL')) return 'FULL'
  return 'PARTIAL'
}

/** Order, delivery and invoice document status: ACTIVE -> PROCESSED -> COMPLETED. */
export function statusFromTier(t: Tier): DocumentStatus {
  if (t === 'ZERO') return 'ACTIVE'
  if (t === 'FULL') return 'COMPLETED'
  return 'PROCESSED'
}

export function paymentStatusFromTier(t: Tier): PaymentStatus {
  if (t === 'ZERO') return 'UNPAID'
  if (t === 'FULL') return 'PAID'
  return 'PARTIALLY_PAID'
}
