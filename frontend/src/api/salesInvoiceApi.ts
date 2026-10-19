// Sales invoices on the mock backend; ports internal/service/sales_invoice_service.go.
import { currentCompanyId, mockRequest } from './client'
import { productOf } from './catalogApi'
import {
  assertSameCompany,
  Binding,
  businessError,
  byId,
  decodeDecimal,
  findOrFail,
  findScoped,
  header,
  insert,
  nextDocNumber,
  nowIso,
  paginate,
  parseDate,
  readDb,
  removeWhere,
  resolveDerivedCompany,
  scopeIds,
  singleSourceCompany,
  touch,
  whereIn,
  writeDb,
  type MockDb,
  type SalesInvoiceRow,
} from './mockDb'
import { dec, formatDec, mulDec, roundDec, ZERO, type Dec } from './mockDecimal'
import { classifyPull, paymentStatusFromTier, statusFromTier } from './mockStatusEngine'
import { invoicedQty, recalculateDeliveryStatus } from './salesDeliveryApi'
import type { ListResponse } from '../types/common'
import type { SalesDelivery, SalesDeliveryItem } from '../types/salesDelivery'
import type {
  CreateSalesInvoiceRequest,
  SalesInvoice,
  SalesInvoiceItem,
  SalesInvoiceItemInput,
  UpdateSalesInvoiceRequest,
} from '../types/salesInvoice'

type ListInvoiceParams = { status?: string; payment_status?: string; page?: number; page_size?: number }

/** Items.SourceDeliveryItem.SalesDelivery as preloaded; the transient remaining_qty stays zero there. */
function sourceDeliveryItem(db: MockDb, deliveryItemId: number): SalesDeliveryItem | undefined {
  const it = db.salesDeliveryItems.find((i) => i.id === deliveryItemId)
  if (!it) return undefined
  const sd = db.salesDeliveries.find((d) => d.id === it.sales_delivery_id)
  return { ...it, remaining_qty: '0', sales_delivery: sd && header<SalesDelivery>(sd) }
}

function invoiceItems(db: MockDb, invoiceId: number, withProduct: boolean): SalesInvoiceItem[] {
  return db.salesInvoiceItems
    .filter((i) => i.sales_invoice_id === invoiceId)
    .sort(byId)
    .map((it) => ({
      ...it,
      product: withProduct ? productOf(db, it.product_id) : undefined,
      source_delivery_item: sourceDeliveryItem(db, it.source_delivery_item_id),
    }))
}

function getInvoice(db: MockDb, id: number, companyId: number): SalesInvoice {
  const si = findScoped(db, db.salesInvoices, id, companyId)
  return { ...si, items: invoiceItems(db, id, true) }
}

/** The deliveries an invoice's lines pull from (for status recalculation). */
function sourceDeliveryIds(db: MockDb, invoiceId: number): number[] {
  const ids = db.salesInvoiceItems
    .filter((i) => i.sales_invoice_id === invoiceId)
    .map((i) => findOrFail(db.salesDeliveryItems, i.source_delivery_item_id).sales_delivery_id)
  return [...new Set(ids)]
}

/** SalesInvoiceService.ApplyPaymentDelta: paid_amount, payment_status and document status. */
export function applyPaymentDelta(invoice: SalesInvoiceRow, delta: Dec) {
  let paid = dec(invoice.paid_amount) + delta
  if (paid < ZERO) paid = ZERO
  const total = dec(invoice.total_amount)
  if (paid > total) throw businessError('payment amount exceeds outstanding invoice amount')
  invoice.paid_amount = formatDec(paid)
  const tier = classifyPull(total, paid)
  invoice.payment_status = paymentStatusFromTier(tier)
  if (['ACTIVE', 'PROCESSED', 'COMPLETED'].includes(invoice.document_status)) {
    invoice.document_status = statusFromTier(tier)
  }
  touch(invoice)
}

function bindItems(b: Binding, items: SalesInvoiceItemInput[] | undefined) {
  b.list('Items', items).forEach((it, i) => b.required(`Items[${i}].SourceDeliveryItemID`, it?.source_delivery_item_id))
}

/** buildInvoiceItems; also returns the company that owns the source deliveries. */
function buildInvoiceItems(db: MockDb, inputs: SalesInvoiceItemInput[]) {
  let total = ZERO
  const sourceCompanyIds: number[] = []
  const items = inputs.map((input, i) => {
    const qty = dec(input.qty)
    if (qty <= ZERO) throw businessError('qty must be greater than 0')
    const deliveryItem = db.salesDeliveryItems.find((d) => d.id === input.source_delivery_item_id)
    if (!deliveryItem) throw businessError('source delivery item not found')
    const delivery = findOrFail(db.salesDeliveries, deliveryItem.sales_delivery_id)
    sourceCompanyIds.push(delivery.company_id)
    if (delivery.document_status !== 'ACTIVE' && delivery.document_status !== 'PROCESSED') {
      throw businessError('delivery must be ACTIVE or PROCESSED to invoice against it')
    }
    const remaining = dec(deliveryItem.qty) - invoicedQty(db, deliveryItem.id)
    if (qty > remaining) throw businessError('invoice qty exceeds remaining delivered quantity')
    total += mulDec(qty, dec(deliveryItem.unit_price))
    return {
      line_no: i + 1,
      source_delivery_item_id: deliveryItem.id,
      product_id: deliveryItem.product_id,
      qty: formatDec(roundDec(qty, 3)),
      unit_price: deliveryItem.unit_price,
    }
  })
  return { items, total: formatDec(roundDec(total, 2)), sourceCompanyId: singleSourceCompany(sourceCompanyIds) }
}

function insertItems(db: MockDb, invoiceId: number, items: ReturnType<typeof buildInvoiceItems>['items']) {
  for (const it of items) insert(db, 'salesInvoiceItems', { sales_invoice_id: invoiceId, ...it, created_at: nowIso() })
}

export const salesInvoiceApi = {
  async list(params?: ListInvoiceParams): Promise<ListResponse<SalesInvoice>> {
    const companyId = currentCompanyId()
    return mockRequest(() => readDb((db) => listInvoices(db, companyId, params)))
  },
  async listPickable(): Promise<SalesInvoice[]> {
    const [active, processed] = await Promise.all([
      salesInvoiceApi.list({ status: 'ACTIVE', page_size: 200 }),
      salesInvoiceApi.list({ status: 'PROCESSED', page_size: 200 }),
    ])
    return [...active.data, ...processed.data]
  },
  async get(id: number): Promise<SalesInvoice> {
    const companyId = currentCompanyId()
    return mockRequest(() => readDb((db) => getInvoice(db, id, companyId)))
  },
  async create(req: CreateSalesInvoiceRequest): Promise<SalesInvoice> {
    return mockRequest(() => {
      const items = (req.items ?? []).map((it) => ({ ...it, qty: decodeDecimal(it?.qty) }))
      const b = new Binding('CreateSalesInvoiceRequest')
      b.required('CompanyID', req.company_id)
      b.required('InvoiceDate', req.invoice_date)
      bindItems(b, req.items)
      b.check()
      const invoiceDate = parseDate(req.invoice_date)
      return writeDb((db) => {
        const built = buildInvoiceItems(db, items)
        const companyId = resolveDerivedCompany(db, req.company_id, built.sourceCompanyId)
        const now = nowIso()
        const si = insert(db, 'salesInvoices', {
          company_id: companyId,
          invoice_no: nextDocNumber(db, companyId, 'INV'),
          invoice_date: invoiceDate,
          document_status: 'DRAFT',
          payment_status: 'UNPAID',
          total_amount: built.total,
          paid_amount: '0',
          notes: req.notes ?? '',
          submitted_at: null,
          created_at: now,
          updated_at: now,
        })
        insertItems(db, si.id, built.items)
        return getInvoice(db, si.id, 0)
      })
    })
  },
  async update(id: number, req: UpdateSalesInvoiceRequest): Promise<SalesInvoice> {
    return mockRequest(() => {
      const items = (req.items ?? []).map((it) => ({ ...it, qty: decodeDecimal(it?.qty) }))
      const b = new Binding('UpdateSalesInvoiceRequest')
      b.required('InvoiceDate', req.invoice_date)
      bindItems(b, req.items)
      b.check()
      const invoiceDate = parseDate(req.invoice_date)
      return writeDb((db) => {
        const si = findOrFail(db.salesInvoices, id)
        if (si.document_status !== 'DRAFT') throw businessError('only DRAFT invoices can be edited')
        const built = buildInvoiceItems(db, items)
        assertSameCompany(si.company_id, built.sourceCompanyId)
        si.invoice_date = invoiceDate
        si.notes = req.notes ?? ''
        si.total_amount = built.total
        touch(si)
        removeWhere(db, 'salesInvoiceItems', (i) => i.sales_invoice_id === id)
        insertItems(db, id, built.items)
        return getInvoice(db, id, 0)
      })
    })
  },
  async submit(id: number): Promise<SalesInvoice> {
    return mockRequest(() =>
      writeDb((db) => {
        const si = findOrFail(db.salesInvoices, id)
        if (si.document_status !== 'DRAFT') throw businessError('only DRAFT invoices can be submitted')
        const items = db.salesInvoiceItems.filter((i) => i.sales_invoice_id === id)
        if (items.length === 0) throw businessError('invoice has no items')
        for (const item of items) {
          const deliveryItem = findOrFail(db.salesDeliveryItems, item.source_delivery_item_id)
          const remaining = dec(deliveryItem.qty) - invoicedQty(db, deliveryItem.id)
          if (dec(item.qty) > remaining) throw businessError('invoice qty exceeds remaining delivered quantity')
        }
        si.document_status = 'ACTIVE'
        si.submitted_at = nowIso()
        touch(si)
        for (const deliveryId of sourceDeliveryIds(db, id)) recalculateDeliveryStatus(db, deliveryId)
        return getInvoice(db, id, 0)
      }),
    )
  },
  async unsubmit(id: number): Promise<SalesInvoice> {
    return mockRequest(() =>
      writeDb((db) => {
        const si = findOrFail(db.salesInvoices, id)
        if (si.document_status !== 'ACTIVE') throw businessError('only ACTIVE invoices with no payments can be unsubmitted')
        const submittedPayments = new Set(db.salesPayments.filter((p) => p.document_status === 'SUBMITTED').map((p) => p.id))
        if (db.salesPaymentAllocations.some((a) => a.sales_invoice_id === id && submittedPayments.has(a.sales_payment_id))) {
          throw businessError('invoice has submitted payments and cannot be unsubmitted')
        }
        const deliveryIds = sourceDeliveryIds(db, id)
        si.document_status = 'DRAFT'
        si.submitted_at = null
        touch(si)
        for (const deliveryId of deliveryIds) recalculateDeliveryStatus(db, deliveryId)
        return getInvoice(db, id, 0)
      }),
    )
  },
  async remove(id: number): Promise<void> {
    return mockRequest(() =>
      writeDb((db) => {
        const si = findOrFail(db.salesInvoices, id)
        if (si.document_status !== 'DRAFT') {
          throw businessError('only DRAFT invoices can be deleted; submitted invoices must be unsubmitted first')
        }
        removeWhere(db, 'salesInvoiceItems', (i) => i.sales_invoice_id === id)
        removeWhere(db, 'salesInvoices', (i) => i.id === id)
      }),
    )
  },
}

/** The list endpoint preloads Items.SourceDeliveryItem.SalesDelivery (no products). */
function listInvoices(db: MockDb, companyId: number, params?: ListInvoiceParams): ListResponse<SalesInvoice> {
  const scope = scopeIds(db, companyId)
  let rows = db.salesInvoices.filter((i) => scope.has(i.company_id))
  rows = whereIn(rows, params?.status, (i) => i.document_status)
  rows = whereIn(rows, params?.payment_status, (i) => i.payment_status)
  return paginate(rows, params, (si) => ({ ...si, items: invoiceItems(db, si.id, false) }))
}
