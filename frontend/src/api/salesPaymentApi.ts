// Sales payments on the mock backend; ports internal/service/sales_payment_service.go.
import { currentCompanyId, mockRequest } from './client'
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
} from './mockDb'
import { dec, formatDec, roundDec, ZERO } from './mockDecimal'
import { applyPaymentDelta } from './salesInvoiceApi'
import type { ListResponse } from '../types/common'
import type { SalesInvoice } from '../types/salesInvoice'
import type {
  CreateSalesPaymentRequest,
  SalesPayment,
  SalesPaymentAllocationInput,
  UpdateSalesPaymentRequest,
} from '../types/salesPayment'

function allocationsOf(db: MockDb, paymentId: number) {
  return db.salesPaymentAllocations.filter((a) => a.sales_payment_id === paymentId).sort(byId)
}

/** FindByID preloads Allocations.SalesInvoice (invoice header only). */
function getPayment(db: MockDb, id: number, companyId: number): SalesPayment {
  const sp = findScoped(db, db.salesPayments, id, companyId)
  return {
    ...sp,
    allocations: allocationsOf(db, id).map((a) => {
      const si = db.salesInvoices.find((i) => i.id === a.sales_invoice_id)
      return { ...a, sales_invoice: si && header<SalesInvoice>(si) }
    }),
  }
}

function bindAllocations(b: Binding, allocations: SalesPaymentAllocationInput[] | undefined) {
  b.list('Allocations', allocations).forEach((a, i) => b.required(`Allocations[${i}].SalesInvoiceID`, a?.sales_invoice_id))
}

/** buildPaymentAllocations; also returns the company that owns the allocated invoices. */
function buildAllocations(db: MockDb, inputs: SalesPaymentAllocationInput[]) {
  let total = ZERO
  const sourceCompanyIds: number[] = []
  const allocations = inputs.map((input, i) => {
    const amount = dec(input.amount)
    if (amount <= ZERO) throw businessError('allocation amount must be greater than 0')
    const invoice = db.salesInvoices.find((si) => si.id === input.sales_invoice_id)
    if (!invoice) throw businessError('invoice not found')
    sourceCompanyIds.push(invoice.company_id)
    if (invoice.document_status !== 'ACTIVE' && invoice.document_status !== 'PROCESSED') {
      throw businessError('invoice must be ACTIVE or PROCESSED to accept payment')
    }
    const outstanding = dec(invoice.total_amount) - dec(invoice.paid_amount)
    if (amount > outstanding) throw businessError('allocation amount exceeds outstanding invoice amount')
    total += amount
    return { line_no: i + 1, sales_invoice_id: input.sales_invoice_id, amount: formatDec(roundDec(amount, 2)) }
  })
  return { allocations, total: formatDec(roundDec(total, 2)), sourceCompanyId: singleSourceCompany(sourceCompanyIds) }
}

function insertAllocations(db: MockDb, paymentId: number, allocations: ReturnType<typeof buildAllocations>['allocations']) {
  for (const a of allocations) insert(db, 'salesPaymentAllocations', { sales_payment_id: paymentId, ...a, created_at: nowIso() })
}

function decodeAllocations(allocations: SalesPaymentAllocationInput[] | undefined) {
  return (allocations ?? []).map((a) => ({ ...a, amount: decodeDecimal(a?.amount) }))
}

export const salesPaymentApi = {
  async list(params?: { status?: string; page?: number; page_size?: number }): Promise<ListResponse<SalesPayment>> {
    const companyId = currentCompanyId()
    return mockRequest(() =>
      readDb((db) => {
        const scope = scopeIds(db, companyId)
        const rows = whereIn(
          db.salesPayments.filter((p) => scope.has(p.company_id)),
          params?.status,
          (p) => p.document_status,
        )
        // No preloads on the list endpoint: allocations are omitted.
        return paginate(rows, params, (p) => header<SalesPayment>(p))
      }),
    )
  },
  async get(id: number): Promise<SalesPayment> {
    const companyId = currentCompanyId()
    return mockRequest(() => readDb((db) => getPayment(db, id, companyId)))
  },
  async create(req: CreateSalesPaymentRequest): Promise<SalesPayment> {
    return mockRequest(() => {
      const allocations = decodeAllocations(req.allocations)
      const b = new Binding('CreateSalesPaymentRequest')
      b.required('CompanyID', req.company_id)
      b.required('PaymentDate', req.payment_date)
      bindAllocations(b, req.allocations)
      b.check()
      const paymentDate = parseDate(req.payment_date)
      return writeDb((db) => {
        const built = buildAllocations(db, allocations)
        const companyId = resolveDerivedCompany(db, req.company_id, built.sourceCompanyId)
        const now = nowIso()
        const sp = insert(db, 'salesPayments', {
          company_id: companyId,
          payment_no: nextDocNumber(db, companyId, 'PAY'),
          payment_date: paymentDate,
          payment_method: req.payment_method ?? '',
          document_status: 'DRAFT',
          total_amount: built.total,
          notes: req.notes ?? '',
          submitted_at: null,
          created_at: now,
          updated_at: now,
        })
        insertAllocations(db, sp.id, built.allocations)
        return getPayment(db, sp.id, 0)
      })
    })
  },
  async update(id: number, req: UpdateSalesPaymentRequest): Promise<SalesPayment> {
    return mockRequest(() => {
      const allocations = decodeAllocations(req.allocations)
      const b = new Binding('UpdateSalesPaymentRequest')
      b.required('PaymentDate', req.payment_date)
      bindAllocations(b, req.allocations)
      b.check()
      const paymentDate = parseDate(req.payment_date)
      return writeDb((db) => {
        const sp = findOrFail(db.salesPayments, id)
        if (sp.document_status !== 'DRAFT') throw businessError('only DRAFT payments can be edited')
        const built = buildAllocations(db, allocations)
        assertSameCompany(sp.company_id, built.sourceCompanyId)
        sp.payment_date = paymentDate
        sp.payment_method = req.payment_method ?? ''
        sp.notes = req.notes ?? ''
        sp.total_amount = built.total
        touch(sp)
        removeWhere(db, 'salesPaymentAllocations', (a) => a.sales_payment_id === id)
        insertAllocations(db, id, built.allocations)
        return getPayment(db, id, 0)
      })
    })
  },
  async submit(id: number): Promise<SalesPayment> {
    return mockRequest(() =>
      writeDb((db) => {
        const sp = findOrFail(db.salesPayments, id)
        if (sp.document_status !== 'DRAFT') throw businessError('only DRAFT payments can be submitted')
        const allocations = allocationsOf(db, id)
        if (allocations.length === 0) throw businessError('payment has no allocations')
        for (const a of allocations) {
          const invoice = db.salesInvoices.find((si) => si.id === a.sales_invoice_id)
          if (!invoice) throw businessError('allocated invoice not found', 404)
          if (dec(a.amount) > dec(invoice.total_amount) - dec(invoice.paid_amount)) {
            throw businessError('allocation amount exceeds outstanding invoice amount')
          }
        }
        for (const a of allocations) applyPaymentDelta(findOrFail(db.salesInvoices, a.sales_invoice_id), dec(a.amount))
        sp.document_status = 'SUBMITTED'
        sp.submitted_at = nowIso()
        touch(sp)
        return getPayment(db, id, 0)
      }),
    )
  },
  async unsubmit(id: number): Promise<SalesPayment> {
    return mockRequest(() =>
      writeDb((db) => {
        const sp = findOrFail(db.salesPayments, id)
        if (sp.document_status !== 'SUBMITTED') throw businessError('only SUBMITTED payments can be unsubmitted')
        for (const a of allocationsOf(db, id)) {
          const invoice = db.salesInvoices.find((si) => si.id === a.sales_invoice_id)
          if (!invoice) throw businessError('internal server error', 500)
          applyPaymentDelta(invoice, -dec(a.amount))
        }
        sp.document_status = 'DRAFT'
        sp.submitted_at = null
        touch(sp)
        return getPayment(db, id, 0)
      }),
    )
  },
  async remove(id: number): Promise<void> {
    return mockRequest(() =>
      writeDb((db) => {
        const sp = findOrFail(db.salesPayments, id)
        if (sp.document_status !== 'DRAFT') {
          throw businessError('only DRAFT payments can be deleted; submitted payments must be unsubmitted first')
        }
        removeWhere(db, 'salesPaymentAllocations', (a) => a.sales_payment_id === id)
        removeWhere(db, 'salesPayments', (p) => p.id === id)
      }),
    )
  },
}
