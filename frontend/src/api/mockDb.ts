/**
 * In-browser mock backend.
 *
 * The app ships as a static mockup, so the Go API (backend/) and its Postgres database are
 * reproduced here: tables live in one JSON document in localStorage (MOCK_DB_STORAGE_KEY),
 * seeded from backend/seed/data.go on first load. The *Api modules port the Go services'
 * business rules on top of it (numbering, submit/unsubmit guards, remaining quantities,
 * status cascades, stock movements, payment allocation) and shape responses like the Go
 * repositories' preloads. Every write runs on a copy of the state and is committed only if
 * it finishes without throwing, mirroring the backend's DB transactions.
 *
 * Call resetMockDb() (e.g. from the devtools console via a module import) to start over.
 */
import { ApiError } from './client'
import { buildSeed } from './mockSeed'
import type { Brand, Company, Product, Stock, ListResponse } from '../types/common'
import type { SalesOrder, SalesOrderItem } from '../types/salesOrder'
import type { SalesDelivery, SalesDeliveryItem } from '../types/salesDelivery'
import type { SalesInvoice, SalesInvoiceItem } from '../types/salesInvoice'
import type { SalesPayment, SalesPaymentAllocation } from '../types/salesPayment'

export const MOCK_DB_STORAGE_KEY = 'mini-erp.db.v1'
const DB_VERSION = 1

interface Timestamps {
  created_at: string
  updated_at: string
}

export type DocType = 'SO' | 'DO' | 'INV' | 'PAY'

export type CompanyRow = Company & Timestamps
export type BrandRow = Brand & Timestamps
export type ProductRow = Omit<Product, 'brand'> & Timestamps
export type StockRow = Omit<Stock, 'product'> & { updated_at: string }
export interface DocSequenceRow {
  id: number
  company_id: number
  doc_type: DocType
  last_number: number
}
export type SalesOrderRow = Omit<SalesOrder, 'company' | 'items'> & Timestamps
export type SalesOrderItemRow = Omit<SalesOrderItem, 'product' | 'remaining_qty'> & { created_at: string }
export type SalesDeliveryRow = Omit<SalesDelivery, 'sales_order' | 'items'> & Timestamps
export type SalesDeliveryItemRow = Omit<SalesDeliveryItem, 'sales_delivery' | 'source_order_item' | 'product' | 'remaining_qty'> & {
  created_at: string
}
export type SalesInvoiceRow = Omit<SalesInvoice, 'items'> & Timestamps
export type SalesInvoiceItemRow = Omit<SalesInvoiceItem, 'source_delivery_item' | 'product'> & { created_at: string }
export type SalesPaymentRow = Omit<SalesPayment, 'allocations'> & Timestamps
export type SalesPaymentAllocationRow = Omit<SalesPaymentAllocation, 'sales_invoice'> & { created_at: string }

export interface MockTables {
  companies: CompanyRow[]
  brands: BrandRow[]
  products: ProductRow[]
  stocks: StockRow[]
  documentNumberSequences: DocSequenceRow[]
  salesOrders: SalesOrderRow[]
  salesOrderItems: SalesOrderItemRow[]
  salesDeliveries: SalesDeliveryRow[]
  salesDeliveryItems: SalesDeliveryItemRow[]
  salesInvoices: SalesInvoiceRow[]
  salesInvoiceItems: SalesInvoiceItemRow[]
  salesPayments: SalesPaymentRow[]
  salesPaymentAllocations: SalesPaymentAllocationRow[]
}

export type TableName = keyof MockTables
type RowOf<K extends TableName> = MockTables[K][number]

export interface MockDb extends MockTables {
  version: number
  /** Last id handed out per table, like Postgres serial sequences (ids are never reused). */
  ids: Record<TableName, number>
}

let state: MockDb | null = null

function load(): MockDb {
  try {
    const raw = localStorage.getItem(MOCK_DB_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as MockDb
      if (parsed && parsed.version === DB_VERSION) return parsed
    }
  } catch {
    // unreadable or blocked storage: fall through to a fresh seed
  }
  const seeded = buildSeed()
  persist(seeded)
  return seeded
}

function persist(db: MockDb) {
  try {
    localStorage.setItem(MOCK_DB_STORAGE_KEY, JSON.stringify(db))
  } catch {
    // storage full or unavailable: keep working in memory
  }
}

function current(): MockDb {
  if (!state) state = load()
  return state
}

export function readDb<T>(fn: (db: MockDb) => T): T {
  return fn(current())
}

/** Runs `fn` against a copy of the state and commits it only when no error is thrown. */
export function writeDb<T>(fn: (db: MockDb) => T): T {
  const draft = structuredClone(current())
  const result = fn(draft)
  state = draft
  persist(draft)
  return result
}

/** Drops all mock data and re-seeds it. */
export function resetMockDb(): void {
  state = buildSeed()
  persist(state)
}

export function emptyDb(): MockDb {
  const tables: MockTables = {
    companies: [],
    brands: [],
    products: [],
    stocks: [],
    documentNumberSequences: [],
    salesOrders: [],
    salesOrderItems: [],
    salesDeliveries: [],
    salesDeliveryItems: [],
    salesInvoices: [],
    salesInvoiceItems: [],
    salesPayments: [],
    salesPaymentAllocations: [],
  }
  const ids = Object.fromEntries(Object.keys(tables).map((k) => [k, 0])) as Record<TableName, number>
  return { version: DB_VERSION, ...tables, ids }
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function insert<K extends TableName>(db: MockDb, table: K, row: Omit<RowOf<K>, 'id'>): RowOf<K> {
  const id = ++db.ids[table]
  const created = { id, ...row } as RowOf<K>
  ;(db[table] as RowOf<K>[]).push(created)
  return created
}

export function removeWhere<K extends TableName>(db: MockDb, table: K, pred: (row: RowOf<K>) => boolean) {
  db[table] = (db[table] as RowOf<K>[]).filter((r) => !pred(r)) as MockDb[K]
}

export function touch(row: { updated_at: string }) {
  row.updated_at = nowIso()
}

// ---- errors (status codes follow internal/apperror + gin binding) ----

/** gorm.ErrRecordNotFound as rendered by the Go error handler. */
export function notFound(): ApiError {
  return new ApiError(404, 'record not found')
}

/** An apperror.Business error (422 for every business sentinel except ErrNotFound). */
export function businessError(message: string, status = 422): ApiError {
  return new ApiError(status, message)
}

export function findOrFail<T extends { id: number }>(rows: T[], id: number): T {
  const row = rows.find((r) => r.id === id)
  if (!row) throw notFound()
  return row
}

// ---- request binding (gin ShouldBindJSON + validator "required"/"min" tags) ----

export class Binding {
  readonly errors: string[] = []
  readonly struct: string

  constructor(struct: string) {
    this.struct = struct
  }

  private fail(path: string, field: string, tag: string) {
    this.errors.push(`Key: '${this.struct}.${path}' Error:Field validation for '${field}' failed on the '${tag}' tag`)
  }

  required(path: string, value: unknown) {
    if (value === undefined || value === null || value === '' || value === 0) this.fail(path, lastSegment(path), 'required')
  }

  /** `binding:"required,min=1,dive"` on a slice; returns the slice when it can be walked. */
  list<T>(path: string, value: T[] | undefined | null): T[] {
    if (!Array.isArray(value)) {
      this.fail(path, path, 'required')
      return []
    }
    if (value.length < 1) this.fail(path, path, 'min')
    return value
  }

  check() {
    if (this.errors.length) throw new ApiError(400, this.errors.join('\n'))
  }
}

function lastSegment(path: string): string {
  return path.split('.').pop() ?? path
}

/** Validates a decimal JSON field the way shopspring's UnmarshalJSON would. */
export function decodeDecimal(value: unknown): string {
  if (value === undefined || value === null) return '0'
  if (typeof value === 'number') return String(value)
  const s = String(value)
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s.trim())) {
    throw new ApiError(400, `error decoding string '${s}': can't convert ${s} to decimal`)
  }
  return s
}

/** service.parseDate: strict YYYY-MM-DD, stored as midnight UTC like a Postgres DATE column. */
export function parseDate(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    if (d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])) {
      return `${s}T00:00:00Z`
    }
  }
  throw businessError('invalid date, expected YYYY-MM-DD: ' + s)
}

// ---- company scoping (X-Company-ID + repository.ScopeToCompany) ----

/** The selected company plus its branches; empty when no company is selected (id 0). */
export function scopeIds(db: MockDb, companyId: number): Set<number> {
  return new Set(db.companies.filter((c) => c.id === companyId || c.parent_id === companyId).map((c) => c.id))
}

/** FindByID with an optional company scope (0 = unscoped, as the services' internal reloads use). */
export function findScoped<T extends { id: number; company_id: number }>(db: MockDb, rows: T[], id: number, companyId: number): T {
  const row = findOrFail(rows, id)
  if (companyId !== 0 && !scopeIds(db, companyId).has(row.company_id)) throw notFound()
  return row
}

/** service.ResolveDerivedCompany */
export function resolveDerivedCompany(db: MockDb, selectedCompanyId: number, sourceCompanyId: number): number {
  if (sourceCompanyId === 0 || sourceCompanyId === selectedCompanyId) return selectedCompanyId
  const source = findOrFail(db.companies, sourceCompanyId)
  if (source.parent_id != null && source.parent_id === selectedCompanyId) return sourceCompanyId
  throw businessError('referenced document belongs to a different company')
}

/** service.SingleSourceCompany */
export function singleSourceCompany(companyIds: number[]): number {
  if (companyIds.length === 0) return 0
  if (companyIds.some((id) => id !== companyIds[0])) {
    throw businessError('all referenced documents must belong to the same company')
  }
  return companyIds[0]
}

/** service.AssertSameCompany */
export function assertSameCompany(childCompanyId: number, parentCompanyId: number) {
  if (childCompanyId !== parentCompanyId) throw businessError('referenced document belongs to a different company')
}

// ---- numbering (repository.DocumentNumberRepository.Next) ----

/** Next number per company and doc type: `{DOC}-{COMPANY_CODE}-{YEAR}-{000001}`. */
export function nextDocNumber(db: MockDb, companyId: number, docType: DocType): string {
  const company = findOrFail(db.companies, companyId)
  let seq = db.documentNumberSequences.find((s) => s.company_id === companyId && s.doc_type === docType)
  if (!seq) seq = insert(db, 'documentNumberSequences', { company_id: companyId, doc_type: docType, last_number: 0 })
  seq.last_number++
  return `${docType}-${company.code}-${new Date().getFullYear()}-${String(seq.last_number).padStart(6, '0')}`
}

// ---- listing (handler query params + repository paging) ----

export interface ListParams {
  status?: string
  page?: number
  page_size?: number
}

/** repository.WhereIn: comma-separated values; empty means no filter. */
export function whereIn<T>(rows: T[], csv: string | undefined, pick: (row: T) => string): T[] {
  const values = (csv ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  if (values.length === 0) return rows
  return rows.filter((r) => values.includes(pick(r)))
}

/** Orders by id DESC and applies PageRequest.Normalized (page >= 1, page_size 1..200, default 20). */
export function paginate<T extends { id: number }, R>(rows: T[], params: ListParams | undefined, present: (row: T) => R): ListResponse<R> {
  const rawPage = Math.trunc(Number(params?.page) || 0)
  const rawSize = Math.trunc(Number(params?.page_size) || 0)
  const page = rawPage < 1 ? 1 : rawPage
  const pageSize = rawSize < 1 || rawSize > 200 ? 20 : rawSize
  const sorted = [...rows].sort((a, b) => b.id - a.id)
  const slice = sorted.slice((page - 1) * pageSize, page * pageSize)
  return { data: slice.map(present), meta: { page, page_size: pageSize, total_items: rows.length } }
}

export function byId<T extends { id: number }>(a: T, b: T): number {
  return a.id - b.id
}

/**
 * A row without its child collections: Go omits relations it did not preload (omitempty),
 * while the TS types declare `items` / `allocations` as always present.
 */
export function header<T>(row: object): T {
  return { ...row } as T
}
