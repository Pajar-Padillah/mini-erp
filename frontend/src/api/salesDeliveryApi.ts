// Sales deliveries on the mock backend; ports internal/service/sales_delivery_service.go and
// stock_service.go (stock is deducted on submit and restored on unsubmit).
import { currentCompanyId, mockRequest } from './client'
import { productOf } from './catalogApi'
import {
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
  touch,
  whereIn,
  writeDb,
  type MockDb,
  type SalesDeliveryItemRow,
  type SalesOrderRow,
} from './mockDb'
import { dec, formatDec, roundDec, sumDec, ZERO, type Dec } from './mockDecimal'
import { classifyPull, combineTiers, statusFromTier } from './mockStatusEngine'
import { deliveredQty, orderItemsOf, recalculateOrderStatus } from './salesOrderApi'
import type { ListResponse } from '../types/common'
import type {
  CreateSalesDeliveryRequest,
  SalesDelivery,
  SalesDeliveryItemInput,
  UpdateSalesDeliveryRequest,
} from '../types/salesDelivery'
import type { SalesOrder } from '../types/salesOrder'

type ListDeliveryParams = { status?: string; sales_order_id?: number; page?: number; page_size?: number }

/** SumSubmittedInvoiceQtyForDeliveryItem: qty pulled by non-DRAFT invoices. */
export function invoicedQty(db: MockDb, deliveryItemId: number): Dec {
  const submitted = new Set(db.salesInvoices.filter((i) => i.document_status !== 'DRAFT').map((i) => i.id))
  return sumDec(
    db.salesInvoiceItems
      .filter((i) => i.source_delivery_item_id === deliveryItemId && submitted.has(i.sales_invoice_id))
      .map((i) => dec(i.qty)),
  )
}

/** ExistsInvoiceItemForDelivery: any invoice line (draft or not) pulling from the delivery. */
function hasInvoiceItems(db: MockDb, deliveryId: number): boolean {
  const itemIds = new Set(db.salesDeliveryItems.filter((i) => i.sales_delivery_id === deliveryId).map((i) => i.id))
  return db.salesInvoiceItems.some((i) => itemIds.has(i.source_delivery_item_id))
}

function deliveryItemsOf(db: MockDb, deliveryId: number): SalesDeliveryItemRow[] {
  return db.salesDeliveryItems.filter((i) => i.sales_delivery_id === deliveryId).sort(byId)
}

/** SalesDeliveryService.RecalculateStatus: ACTIVE / PROCESSED / COMPLETED from invoiced quantities. */
export function recalculateDeliveryStatus(db: MockDb, deliveryId: number) {
  const sd = findOrFail(db.salesDeliveries, deliveryId)
  if (!['ACTIVE', 'PROCESSED', 'COMPLETED'].includes(sd.document_status)) return
  const tiers = deliveryItemsOf(db, deliveryId).map((it) => classifyPull(dec(it.qty), invoicedQty(db, it.id)))
  const next = statusFromTier(combineTiers(tiers))
  if (next !== sd.document_status) {
    sd.document_status = next
    touch(sd)
  }
}

/** The order as preloaded on a delivery (header only). */
function orderHeader(db: MockDb, orderId: number): SalesOrder | undefined {
  const so = db.salesOrders.find((o) => o.id === orderId)
  return so && header<SalesOrder>(so)
}

function getDelivery(db: MockDb, id: number, companyId: number): SalesDelivery {
  const sd = findScoped(db, db.salesDeliveries, id, companyId)
  return {
    ...sd,
    sales_order: orderHeader(db, sd.sales_order_id),
    items: deliveryItemsOf(db, id).map((it) => ({
      ...it,
      product: productOf(db, it.product_id),
      remaining_qty: formatDec(dec(it.qty) - invoicedQty(db, it.id)),
    })),
  }
}

function bindItems(b: Binding, items: SalesDeliveryItemInput[] | undefined) {
  b.list('Items', items).forEach((it, i) => b.required(`Items[${i}].SourceOrderItemID`, it?.source_order_item_id))
}

function buildDeliveryItems(db: MockDb, so: SalesOrderRow, inputs: SalesDeliveryItemInput[]) {
  const orderItems = new Map(orderItemsOf(db, so.id).map((it) => [it.id, it]))
  return inputs.map((input, i) => {
    const qty = dec(input.qty)
    if (qty <= ZERO) throw businessError('qty must be greater than 0')
    const orderItem = orderItems.get(input.source_order_item_id)
    if (!orderItem) throw businessError('source order item does not belong to this order')
    const remaining = dec(orderItem.qty_ordered) - deliveredQty(db, orderItem.id)
    if (qty > remaining) throw businessError('delivery qty exceeds remaining order quantity')
    return {
      line_no: i + 1,
      source_order_item_id: orderItem.id,
      product_id: orderItem.product_id,
      qty: formatDec(roundDec(qty, 3)),
      unit_price: orderItem.unit_price,
    }
  })
}

function insertItems(db: MockDb, deliveryId: number, items: ReturnType<typeof buildDeliveryItems>) {
  for (const it of items) insert(db, 'salesDeliveryItems', { sales_delivery_id: deliveryId, ...it, created_at: nowIso() })
}

function qtyByProduct(items: SalesDeliveryItemRow[]): Map<number, Dec> {
  const out = new Map<number, Dec>()
  for (const it of items) out.set(it.product_id, (out.get(it.product_id) ?? ZERO) + dec(it.qty))
  return out
}

/** StockService.DeductForDelivery: all-or-nothing, fails when any product is short. */
function deductStock(db: MockDb, companyId: number, qty: Map<number, Dec>) {
  const stocks = db.stocks.filter((s) => s.company_id === companyId)
  for (const [productId, q] of qty) {
    const stock = stocks.find((s) => s.product_id === productId)
    if (!stock || dec(stock.quantity_on_hand) < q) throw businessError('insufficient stock for one or more products')
  }
  for (const [productId, q] of qty) adjustStock(stocks.find((s) => s.product_id === productId)!, -q)
}

/** StockService.RestoreForDelivery */
function restoreStock(db: MockDb, companyId: number, qty: Map<number, Dec>) {
  for (const [productId, q] of qty) {
    const stock = db.stocks.find((s) => s.company_id === companyId && s.product_id === productId)
    if (!stock) throw businessError('internal server error', 500)
    adjustStock(stock, q)
  }
}

function adjustStock(stock: MockDb['stocks'][number], delta: Dec) {
  stock.quantity_on_hand = formatDec(dec(stock.quantity_on_hand) + delta)
  stock.updated_at = nowIso()
}

export const salesDeliveryApi = {
  async list(params?: ListDeliveryParams): Promise<ListResponse<SalesDelivery>> {
    const companyId = currentCompanyId()
    return mockRequest(() => readDb((db) => listDeliveries(db, companyId, params)))
  },
  async listPickable(): Promise<SalesDelivery[]> {
    const [active, processed] = await Promise.all([
      salesDeliveryApi.list({ status: 'ACTIVE', page_size: 200 }),
      salesDeliveryApi.list({ status: 'PROCESSED', page_size: 200 }),
    ])
    return [...active.data, ...processed.data]
  },
  async get(id: number): Promise<SalesDelivery> {
    const companyId = currentCompanyId()
    return mockRequest(() => readDb((db) => getDelivery(db, id, companyId)))
  },
  async create(req: CreateSalesDeliveryRequest): Promise<SalesDelivery> {
    return mockRequest(() => {
      const items = (req.items ?? []).map((it) => ({ ...it, qty: decodeDecimal(it?.qty) }))
      const b = new Binding('CreateSalesDeliveryRequest')
      b.required('CompanyID', req.company_id)
      b.required('SalesOrderID', req.sales_order_id)
      b.required('DeliveryDate', req.delivery_date)
      bindItems(b, req.items)
      b.check()
      const deliveryDate = parseDate(req.delivery_date)
      return writeDb((db) => {
        const so = findOrFail(db.salesOrders, req.sales_order_id)
        const companyId = resolveDerivedCompany(db, req.company_id, so.company_id)
        if (so.document_status !== 'ACTIVE' && so.document_status !== 'PROCESSED') {
          throw businessError('order must be ACTIVE or PROCESSED to create a delivery against it')
        }
        const built = buildDeliveryItems(db, so, items)
        const now = nowIso()
        const sd = insert(db, 'salesDeliveries', {
          company_id: companyId,
          sales_order_id: req.sales_order_id,
          delivery_no: nextDocNumber(db, companyId, 'DO'),
          delivery_date: deliveryDate,
          document_status: 'DRAFT',
          notes: req.notes ?? '',
          submitted_at: null,
          created_at: now,
          updated_at: now,
        })
        insertItems(db, sd.id, built)
        return getDelivery(db, sd.id, 0)
      })
    })
  },
  async update(id: number, req: UpdateSalesDeliveryRequest): Promise<SalesDelivery> {
    return mockRequest(() => {
      const items = (req.items ?? []).map((it) => ({ ...it, qty: decodeDecimal(it?.qty) }))
      const b = new Binding('UpdateSalesDeliveryRequest')
      b.required('DeliveryDate', req.delivery_date)
      bindItems(b, req.items)
      b.check()
      const deliveryDate = parseDate(req.delivery_date)
      return writeDb((db) => {
        const sd = findOrFail(db.salesDeliveries, id)
        if (sd.document_status !== 'DRAFT') throw businessError('only DRAFT deliveries can be edited')
        if (hasInvoiceItems(db, id)) {
          throw businessError("cannot edit line items: an invoice has already pulled from this delivery's lines")
        }
        const so = findOrFail(db.salesOrders, sd.sales_order_id)
        const built = buildDeliveryItems(db, so, items)
        sd.delivery_date = deliveryDate
        sd.notes = req.notes ?? ''
        touch(sd)
        removeWhere(db, 'salesDeliveryItems', (i) => i.sales_delivery_id === id)
        insertItems(db, id, built)
        return getDelivery(db, id, 0)
      })
    })
  },
  async submit(id: number): Promise<SalesDelivery> {
    return mockRequest(() =>
      writeDb((db) => {
        const sd = findOrFail(db.salesDeliveries, id)
        if (sd.document_status !== 'DRAFT') throw businessError('only DRAFT deliveries can be submitted')
        const items = deliveryItemsOf(db, id)
        if (items.length === 0) throw businessError('delivery has no items')
        for (const item of items) {
          const orderItem = findOrFail(db.salesOrderItems, item.source_order_item_id)
          const remaining = dec(orderItem.qty_ordered) - deliveredQty(db, orderItem.id)
          if (dec(item.qty) > remaining) throw businessError('delivery qty exceeds remaining order quantity')
        }
        deductStock(db, sd.company_id, qtyByProduct(items))
        sd.document_status = 'ACTIVE'
        sd.submitted_at = nowIso()
        touch(sd)
        recalculateOrderStatus(db, sd.sales_order_id)
        return getDelivery(db, id, 0)
      }),
    )
  },
  async unsubmit(id: number): Promise<SalesDelivery> {
    return mockRequest(() =>
      writeDb((db) => {
        const sd = findOrFail(db.salesDeliveries, id)
        if (sd.document_status !== 'ACTIVE') throw businessError('only ACTIVE deliveries with no invoices can be unsubmitted')
        if (hasInvoiceItems(db, id)) throw businessError('delivery has invoices referencing its lines and cannot be unsubmitted')
        restoreStock(db, sd.company_id, qtyByProduct(deliveryItemsOf(db, id)))
        sd.document_status = 'DRAFT'
        sd.submitted_at = null
        touch(sd)
        recalculateOrderStatus(db, sd.sales_order_id)
        return getDelivery(db, id, 0)
      }),
    )
  },
  async remove(id: number): Promise<void> {
    return mockRequest(() =>
      writeDb((db) => {
        const sd = findOrFail(db.salesDeliveries, id)
        if (sd.document_status !== 'DRAFT') {
          throw businessError('only DRAFT deliveries can be deleted; submitted deliveries must be unsubmitted first')
        }
        removeWhere(db, 'salesDeliveryItems', (i) => i.sales_delivery_id === id)
        removeWhere(db, 'salesDeliveries', (d) => d.id === id)
      }),
    )
  },
}

/** The list endpoint preloads only the order header; items are omitted. */
function listDeliveries(db: MockDb, companyId: number, params?: ListDeliveryParams): ListResponse<SalesDelivery> {
  const scope = scopeIds(db, companyId)
  const orderId = Math.trunc(Number(params?.sales_order_id) || 0)
  const rows = whereIn(
    db.salesDeliveries.filter((d) => scope.has(d.company_id) && (orderId <= 0 || d.sales_order_id === orderId)),
    params?.status,
    (d) => d.document_status,
  )
  return paginate(rows, params, (d) => header<SalesDelivery>({ ...d, sales_order: orderHeader(db, d.sales_order_id) }))
}
