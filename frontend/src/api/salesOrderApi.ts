// Sales orders on the mock backend; ports internal/service/sales_order_service.go.
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
  scopeIds,
  touch,
  whereIn,
  writeDb,
  type ListParams,
  type MockDb,
  type SalesOrderItemRow,
} from './mockDb'
import { dec, formatDec, mulDec, roundDec, sumDec, ZERO, type Dec } from './mockDecimal'
import { classifyPull, combineTiers, statusFromTier } from './mockStatusEngine'
import type { ListResponse } from '../types/common'
import type { CreateSalesOrderRequest, SalesOrder, SalesOrderItemInput, UpdateSalesOrderRequest } from '../types/salesOrder'

/** SumSubmittedDeliveryQtyForOrderItem: qty pulled by non-DRAFT deliveries. */
export function deliveredQty(db: MockDb, orderItemId: number): Dec {
  const submitted = new Set(db.salesDeliveries.filter((d) => d.document_status !== 'DRAFT').map((d) => d.id))
  return sumDec(
    db.salesDeliveryItems.filter((i) => i.source_order_item_id === orderItemId && submitted.has(i.sales_delivery_id)).map((i) => dec(i.qty)),
  )
}

/** ExistsDeliveryItemForOrder: any delivery line (draft or not) pulling from the order. */
function hasDeliveryItems(db: MockDb, orderId: number): boolean {
  const itemIds = new Set(db.salesOrderItems.filter((i) => i.sales_order_id === orderId).map((i) => i.id))
  return db.salesDeliveryItems.some((i) => itemIds.has(i.source_order_item_id))
}

export function orderItemsOf(db: MockDb, orderId: number): SalesOrderItemRow[] {
  return db.salesOrderItems.filter((i) => i.sales_order_id === orderId).sort(byId)
}

/** SalesOrderService.RecalculateStatus: ACTIVE / PROCESSED / COMPLETED from delivered quantities. */
export function recalculateOrderStatus(db: MockDb, orderId: number) {
  const so = findOrFail(db.salesOrders, orderId)
  if (!['ACTIVE', 'PROCESSED', 'COMPLETED'].includes(so.document_status)) return
  const tiers = orderItemsOf(db, orderId).map((it) => classifyPull(dec(it.qty_ordered), deliveredQty(db, it.id)))
  const next = statusFromTier(combineTiers(tiers))
  if (next !== so.document_status) {
    so.document_status = next
    touch(so)
  }
}

function getOrder(db: MockDb, id: number, companyId: number): SalesOrder {
  const so = findScoped(db, db.salesOrders, id, companyId)
  return {
    ...so,
    company: db.companies.find((c) => c.id === so.company_id),
    items: orderItemsOf(db, id).map((it) => ({
      ...it,
      product: productOf(db, it.product_id),
      remaining_qty: formatDec(dec(it.qty_ordered) - deliveredQty(db, it.id)),
    })),
  }
}

function bindItems(b: Binding, items: SalesOrderItemInput[] | undefined) {
  b.list('Items', items).forEach((it, i) => b.required(`Items[${i}].ProductID`, it?.product_id))
}

function decodeItems(items: SalesOrderItemInput[]) {
  return items.map((it) => ({ ...it, qty_ordered: decodeDecimal(it.qty_ordered), unit_price: decodeDecimal(it.unit_price) }))
}

function buildOrderItems(inputs: SalesOrderItemInput[]) {
  let total = ZERO
  const items = inputs.map((input, i) => {
    const qty = dec(input.qty_ordered)
    const price = dec(input.unit_price)
    if (qty <= ZERO) throw businessError('qty_ordered must be greater than 0')
    if (price < ZERO) throw businessError('unit_price must not be negative')
    total += mulDec(qty, price)
    return { line_no: i + 1, product_id: input.product_id, qty_ordered: formatDec(roundDec(qty, 3)), unit_price: formatDec(roundDec(price, 2)) }
  })
  return { items, total: formatDec(roundDec(total, 2)) }
}

function insertItems(db: MockDb, orderId: number, items: ReturnType<typeof buildOrderItems>['items']) {
  for (const it of items) {
    // FK on sales_order_items.product_id
    if (!productOf(db, it.product_id)) throw businessError('product not found', 500)
    insert(db, 'salesOrderItems', { sales_order_id: orderId, ...it, created_at: nowIso() })
  }
}

export const salesOrderApi = {
  async list(params?: { status?: string; page?: number; page_size?: number }): Promise<ListResponse<SalesOrder>> {
    const companyId = currentCompanyId()
    return mockRequest(() => readDb((db) => listOrders(db, companyId, params)))
  },
  async listPickable(): Promise<SalesOrder[]> {
    const [active, processed] = await Promise.all([
      salesOrderApi.list({ status: 'ACTIVE', page_size: 200 }),
      salesOrderApi.list({ status: 'PROCESSED', page_size: 200 }),
    ])
    return [...active.data, ...processed.data]
  },
  async get(id: number): Promise<SalesOrder> {
    const companyId = currentCompanyId()
    return mockRequest(() => readDb((db) => getOrder(db, id, companyId)))
  },
  async create(req: CreateSalesOrderRequest): Promise<SalesOrder> {
    return mockRequest(() => {
      const b = new Binding('CreateSalesOrderRequest')
      const items = decodeItems(req.items ?? [])
      b.required('CompanyID', req.company_id)
      b.required('CustomerName', req.customer_name)
      b.required('OrderDate', req.order_date)
      bindItems(b, req.items)
      b.check()
      const orderDate = parseDate(req.order_date)
      return writeDb((db) => {
        const built = buildOrderItems(items)
        const now = nowIso()
        const so = insert(db, 'salesOrders', {
          company_id: req.company_id,
          order_no: nextDocNumber(db, req.company_id, 'SO'),
          customer_name: req.customer_name,
          order_date: orderDate,
          document_status: 'DRAFT',
          total_amount: built.total,
          notes: req.notes ?? '',
          created_by: req.created_by ?? '',
          submitted_at: null,
          created_at: now,
          updated_at: now,
        })
        insertItems(db, so.id, built.items)
        return getOrder(db, so.id, 0)
      })
    })
  },
  async update(id: number, req: UpdateSalesOrderRequest): Promise<SalesOrder> {
    return mockRequest(() => {
      const b = new Binding('UpdateSalesOrderRequest')
      const items = decodeItems(req.items ?? [])
      b.required('CustomerName', req.customer_name)
      b.required('OrderDate', req.order_date)
      bindItems(b, req.items)
      b.check()
      const orderDate = parseDate(req.order_date)
      return writeDb((db) => {
        const built = buildOrderItems(items)
        const so = findOrFail(db.salesOrders, id)
        if (so.document_status !== 'DRAFT') throw businessError('only DRAFT orders can be edited')
        if (hasDeliveryItems(db, id)) {
          throw businessError("cannot edit line items: a delivery has already pulled from this order's lines")
        }
        so.customer_name = req.customer_name
        so.order_date = orderDate
        so.notes = req.notes ?? ''
        so.total_amount = built.total
        touch(so)
        removeWhere(db, 'salesOrderItems', (i) => i.sales_order_id === id)
        insertItems(db, id, built.items)
        return getOrder(db, id, 0)
      })
    })
  },
  async submit(id: number): Promise<SalesOrder> {
    return mockRequest(() =>
      writeDb((db) => {
        const so = findOrFail(db.salesOrders, id)
        if (so.document_status !== 'DRAFT') throw businessError('only DRAFT orders can be submitted')
        if (orderItemsOf(db, id).length === 0) throw businessError('order has no items')
        so.document_status = 'ACTIVE'
        so.submitted_at = nowIso()
        touch(so)
        return getOrder(db, id, 0)
      }),
    )
  },
  async unsubmit(id: number): Promise<SalesOrder> {
    return mockRequest(() =>
      writeDb((db) => {
        const so = findOrFail(db.salesOrders, id)
        if (so.document_status !== 'ACTIVE') throw businessError('only ACTIVE orders with no deliveries can be unsubmitted')
        if (hasDeliveryItems(db, id)) throw businessError('order has deliveries referencing its lines and cannot be unsubmitted')
        so.document_status = 'DRAFT'
        so.submitted_at = null
        touch(so)
        return getOrder(db, id, 0)
      }),
    )
  },
  async remove(id: number): Promise<void> {
    return mockRequest(() =>
      writeDb((db) => {
        const so = findOrFail(db.salesOrders, id)
        if (so.document_status !== 'DRAFT') {
          throw businessError('only DRAFT orders can be deleted; unsubmit an ACTIVE order first')
        }
        removeWhere(db, 'salesOrderItems', (i) => i.sales_order_id === id)
        removeWhere(db, 'salesOrders', (o) => o.id === id)
      }),
    )
  },
}

/** The list endpoint preloads nothing, so rows come without items (omitted in the Go JSON). */
function listOrders(db: MockDb, companyId: number, params?: ListParams): ListResponse<SalesOrder> {
  const scope = scopeIds(db, companyId)
  const rows = whereIn(
    db.salesOrders.filter((o) => scope.has(o.company_id)),
    params?.status,
    (o) => o.document_status,
  )
  return paginate(rows, params, (o) => header<SalesOrder>(o))
}
