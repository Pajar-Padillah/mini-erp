// Shared types and helpers for static (mock-data) list pages.

export interface StaticStatusOption {
  label: string
  value: string
  /** Pill color: gray | blue | amber | green | red. Falls back to a default per common status value. */
  color?: 'gray' | 'blue' | 'amber' | 'green' | 'red'
}

export interface StaticColumn {
  prop: string
  label: string
  minWidth?: number
  width?: number
  align?: 'left' | 'right' | 'center'
  /** status → colored by `statuses`, secondary_status → colored by `secondaryStatuses`. */
  type?: 'text' | 'date' | 'money' | 'number' | 'percent' | 'status' | 'secondary_status'
}

export interface StaticStat {
  label: string
  value: string
  hint?: string
}

export interface StaticPageConfig {
  title: string
  /** Primary header button, e.g. "+ New Journal Entry". Omit for read-only pages (reports, ledgers). */
  newLabel?: string
  /** Optional KPI cards shown above the table (dashboards, reports). */
  stats?: StaticStat[]
  /** Row prop holding a YYYY-MM-DD date. When set, the date-range filter is shown (default: this month). */
  dateProp?: string
  /** Row prop holding the status value. When set together with `statuses`, status pills are shown. */
  statusProp?: string
  statuses?: StaticStatusOption[]
  secondaryStatusProp?: string
  secondaryStatusLabel?: string
  secondaryStatuses?: StaticStatusOption[]
  columns: StaticColumn[]
  rows: Record<string, string | number>[]
}

export function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function docNo(prefix: string, seq: number): string {
  const today = new Date()
  return `${prefix}/${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(seq).padStart(4, '0')}`
}

export const DOCUMENT_STATUSES: StaticStatusOption[] = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Processed', value: 'PROCESSED' },
  { label: 'Completed', value: 'COMPLETED' },
]

export const PAYMENT_STATUSES: StaticStatusOption[] = [
  { label: 'Unpaid', value: 'UNPAID' },
  { label: 'Partially Paid', value: 'PARTIALLY_PAID' },
  { label: 'Paid', value: 'PAID' },
]

export const DEFAULT_STATUS_COLORS: Record<string, StaticStatusOption['color']> = {
  DRAFT: 'gray',
  ACTIVE: 'blue',
  PROCESSED: 'amber',
  COMPLETED: 'green',
  SUBMITTED: 'green',
  UNPAID: 'red',
  PARTIALLY_PAID: 'amber',
  PAID: 'green',
}
