// Static mockup content for the row actions (approval, audit trail, related docs, journal).
// Everything is generated deterministically from the document number, so the same
// document always shows the same history.

// 'edit' is opt-in: the menu only emits it, so pass it only from lists that handle the `edit` event.
// 'comments' opens the document's comments side panel.
export type DocAction = 'edit' | 'comments' | 'approval' | 'cancel-approval' | 'audit' | 'related' | 'journal'

export interface DocRef {
  no: string
  type: string
  status?: string
  amount?: number
  date?: string
  party?: string
  /** Comments / attachments key (docCollabStore `docKey`); defaults to docKey(type, no). */
  collabKey?: string
}

export const ALL_DOC_ACTIONS: DocAction[] = ['comments', 'approval', 'cancel-approval', 'audit', 'related', 'journal']

const PEOPLE = ['Rina Dewi', 'Andi Pratama', 'Budi Santoso', 'Siti Rahma', 'Yusuf Hidayat', 'Dewi Lestari']

function hash(text: string): number {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

function pick<T>(list: T[], seed: number, offset = 0): T {
  return list[(seed + offset) % list.length]
}

function baseDate(doc: DocRef): Date {
  const d = doc.date ? new Date(`${doc.date.slice(0, 10)}T09:00:00`) : new Date()
  return Number.isNaN(d.getTime()) ? new Date() : d
}

function at(doc: DocRef, minutes: number): string {
  const d = new Date(baseDate(doc).getTime() + minutes * 60_000)
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const DONE_STATUSES = ['ACTIVE', 'PROCESSED', 'COMPLETED', 'SUBMITTED', 'POSTED', 'APPROVED', 'PAID', 'CLOSED', 'SETTLED', 'SUCCESS', 'FILED']
const FULLY_DONE = ['PROCESSED', 'COMPLETED', 'POSTED', 'PAID', 'CLOSED', 'SETTLED', 'SUCCESS', 'FILED']

/** True when the document has gone through approval (so it can be shown or cancelled). */
export function isSubmitted(doc: DocRef): boolean {
  return !!doc.status && DONE_STATUSES.includes(doc.status.toUpperCase())
}

export interface ApprovalStep {
  level: string
  approver: string
  role: string
  state: 'approved' | 'pending' | 'waiting' | 'draft'
  at?: string
  note?: string
}

export function approvalSteps(doc: DocRef): ApprovalStep[] {
  const seed = hash(doc.no)
  const status = (doc.status ?? '').toUpperCase()
  const submitted = isSubmitted(doc)
  const fully = FULLY_DONE.includes(status)
  const creator = pick(PEOPLE, seed)
  return [
    { level: 'Submitted', approver: creator, role: 'Requester', state: submitted ? 'approved' : 'draft', at: submitted ? at(doc, 15) : undefined, note: submitted ? 'Submitted for approval' : 'Still a draft' },
    { level: 'Level 1', approver: pick(PEOPLE, seed, 2), role: 'Department Head', state: submitted ? 'approved' : 'waiting', at: submitted ? at(doc, 95) : undefined, note: submitted ? 'Looks good, approved.' : undefined },
    { level: 'Level 2', approver: 'Fajar Nugroho', role: 'Chief Operating Officer', state: fully ? 'approved' : submitted ? 'pending' : 'waiting', at: fully ? at(doc, 240) : undefined, note: fully ? 'Approved' : submitted ? 'Waiting for approval' : undefined },
  ]
}

export interface AuditEvent {
  action: string
  by: string
  at: string
  detail?: string
  tone: 'create' | 'update' | 'submit' | 'approve' | 'print'
}

export function auditTrail(doc: DocRef): AuditEvent[] {
  const seed = hash(doc.no)
  const creator = pick(PEOPLE, seed)
  const events: AuditEvent[] = [
    { action: 'Created', by: creator, at: at(doc, 0), detail: `${doc.type} ${doc.no} created as draft`, tone: 'create' },
    { action: 'Updated', by: creator, at: at(doc, 8), detail: seed % 2 ? 'Notes changed' : 'Quantity changed on line 1', tone: 'update' },
  ]
  if (isSubmitted(doc)) {
    events.push({ action: 'Submitted', by: creator, at: at(doc, 15), detail: 'Status DRAFT → ACTIVE', tone: 'submit' })
    events.push({ action: 'Approved (Level 1)', by: pick(PEOPLE, seed, 2), at: at(doc, 95), tone: 'approve' })
  }
  if (FULLY_DONE.includes((doc.status ?? '').toUpperCase())) {
    events.push({ action: 'Approved (Level 2)', by: 'Fajar Nugroho', at: at(doc, 240), tone: 'approve' })
    events.push({ action: 'Printed', by: pick(PEOPLE, seed, 4), at: at(doc, 300), detail: 'PDF exported', tone: 'print' })
  }
  return events.reverse()
}

export interface RelatedDoc {
  type: string
  no: string
  status: string
  to: string
  current?: boolean
}

// Document flows: each type maps to its chain (route per type), so the current
// document is shown in context with what comes before and after it.
const FLOWS: { type: string; prefix: string; to: string }[][] = [
  [
    { type: 'Sales Quote', prefix: 'SQ', to: '/sales-quotes' },
    { type: 'Sales Order', prefix: 'SO', to: '/sales-orders' },
    { type: 'Sales Delivery', prefix: 'DO', to: '/sales-deliveries' },
    { type: 'Sales Invoice', prefix: 'INV', to: '/sales-invoices' },
    { type: 'Sales Payment', prefix: 'PAY', to: '/sales-payments' },
  ],
  [
    { type: 'Purchase Request', prefix: 'PR', to: '/purchase-requests' },
    { type: 'Purchase Order', prefix: 'PO', to: '/purchase-orders' },
    { type: 'Purchase Invoice', prefix: 'PI', to: '/purchase-invoices' },
    { type: 'Purchase Payment', prefix: 'PP', to: '/purchase-payments' },
    { type: 'Purchase Return', prefix: 'PRT', to: '/purchase-returns' },
  ],
]

function singular(type: string) {
  return type.replace(/ies$/, 'y').replace(/s$/, '')
}

export function relatedDocs(doc: DocRef): RelatedDoc[] {
  const type = singular(doc.type)
  const flow = FLOWS.find((f) => f.some((s) => s.type === type))
  const seed = hash(doc.no)
  const suffix = String(1 + (seed % 60)).padStart(4, '0')
  if (!flow) {
    return [
      { type, no: doc.no, status: doc.status ?? '-', to: '', current: true },
      { type: 'Journal Entry', no: `JE/SGI/${suffix}`, status: 'POSTED', to: '/accounting/journal-entries' },
      { type: 'Attachment', no: `${doc.no.replace(/\W+/g, '-')}.pdf`, status: '-', to: '' },
    ]
  }
  const index = flow.findIndex((s) => s.type === type)
  const progressed = isSubmitted(doc) ? flow.length : index + 1
  return flow.slice(0, Math.max(progressed, index + 1)).map((s, i) => ({
    type: s.type,
    no: i === index ? doc.no : `${s.prefix}/CRS/${suffix}`,
    status: i === index ? doc.status ?? '-' : i < index ? 'COMPLETED' : 'ACTIVE',
    to: s.to,
    current: i === index,
  }))
}

export interface JournalLine {
  account: string
  description: string
  debit: number
  credit: number
}

/** Returns the GL lines this document posts, or null when it doesn't post to the ledger. */
export function journalLines(doc: DocRef): JournalLine[] | null {
  const type = singular(doc.type).toLowerCase()
  const amount = Math.round(doc.amount ?? 1_000_000 + (hash(doc.no) % 50) * 250_000)
  const net = Math.round(amount / 1.11)
  const vat = amount - net
  const line = (account: string, description: string, debit: number, credit: number) => ({ account, description, debit, credit })

  if (/(order|quote|request|requisition)/.test(type) && !/production/.test(type)) return null
  if (type.includes('sales invoice')) {
    return [line('1-1300 Accounts Receivable', `Invoice ${doc.no}`, amount, 0), line('4-1000 Sales Revenue', 'Revenue', 0, net), line('2-1200 VAT Out', 'PPN 11%', 0, vat)]
  }
  if (type.includes('sales payment') || type.includes('cash receipt')) {
    return [line('1-1200 Bank BCA', `Receipt ${doc.no}`, amount, 0), line('1-1300 Accounts Receivable', 'Settle invoice', 0, amount)]
  }
  if (type.includes('sales delivery')) {
    const cost = Math.round(amount * 0.58)
    return [line('5-1000 Cost of Goods Sold', `Delivery ${doc.no}`, cost, 0), line('1-1400 Inventory', 'Stock out', 0, cost)]
  }
  if (type.includes('purchase invoice')) {
    return [line('1-1400 Inventory', `Bill ${doc.no}`, net, 0), line('1-1500 VAT In', 'PPN 11%', vat, 0), line('2-1100 Accounts Payable', 'Supplier payable', 0, amount)]
  }
  if (type.includes('purchase payment') || type.includes('disbursement')) {
    return [line('2-1100 Accounts Payable', `Payment ${doc.no}`, amount, 0), line('1-1200 Bank BCA', 'Bank out', 0, amount)]
  }
  if (type.includes('return')) {
    return [line('2-1100 Accounts Payable', `Return ${doc.no}`, amount, 0), line('1-1400 Inventory', 'Stock returned', 0, net), line('1-1500 VAT In', 'PPN reversal', 0, vat)]
  }
  // Other documents only post when they carry a value (e.g. reimbursements, settlements).
  if (doc.amount == null) return null
  return [line('6-9000 General Expense', `${doc.type} ${doc.no}`, amount, 0), line('2-1900 Accrued Liabilities', 'Accrual', 0, amount)]
}

export const ACTION_LABELS: Record<DocAction, string> = {
  edit: 'Edit',
  comments: 'Comments',
  approval: 'Show Approval',
  'cancel-approval': 'Cancel Approval',
  audit: 'Show Audit Trail',
  related: 'Show Related Doc',
  journal: 'Show Journal',
}
