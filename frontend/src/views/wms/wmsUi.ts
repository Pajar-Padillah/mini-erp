// Small display helpers shared by the WMS (Inventory) views.
import { EXPIRY_STATUSES, type ExpiryStatus, type InboundStatus, type OutboundStatus } from '../../stores/wmsStore'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-16" → "16 Oct 2026"; "-" or empty → "-". */
export function fmtDate(ymd?: string | null): string {
  if (!ymd || ymd === '-') return '-'
  const [y, m, d] = ymd.slice(0, 10).split('-')
  if (!y || !m || !d) return ymd
  return `${d} ${MONTHS[Number(m) - 1] ?? m} ${y}`
}

/** ISO timestamp → "16 Oct 2026, 14:05". */
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return `${fmtDate(iso.slice(0, 10))}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const fmtQty = (n: number) => (Number(n) || 0).toLocaleString('id-ID')
export const fmtRp = (n: number) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`

export function expiryColor(st: ExpiryStatus): string {
  return EXPIRY_STATUSES.find((e) => e.key === st)?.color ?? 'gray'
}
export function expiryLabel(st: ExpiryStatus): string {
  return EXPIRY_STATUSES.find((e) => e.key === st)?.label ?? st
}

export const INBOUND_STATUS_COLOR: Record<InboundStatus, string> = {
  'IN TRANSIT': 'amber',
  'PARTIAL PUTAWAY': 'blue',
  'PUTAWAY COMPLETE': 'green',
}
export const OUTBOUND_STATUS_COLOR: Record<OutboundStatus, string> = {
  PENDING: 'gray',
  ALLOCATED: 'blue',
  'PARTIAL PICKED': 'amber',
  'READY TO SHIP': 'blue',
  OUTSTANDING: 'amber',
  DISPATCHED: 'green',
  CLOSED: 'gray',
}
