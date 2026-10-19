import { defineStore } from 'pinia'

// Static mockup approval inbox: documents from every module waiting for the current user's decision.
// Decisions only change local state (nothing is sent to a server).

/** PENDING = no decision yet; it is not shown as an approval status. */
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REVISE' | 'REJECTED'
export type DecidedStatus = Exclude<ApprovalStatus, 'PENDING'>
export type ApprovalDecision = 'approve' | 'revise' | 'reject'

export interface ApprovalLine {
  item: string
  qty: number
  unit: string
  price: number
}

export interface ApprovalEvent {
  at: string
  by: string
  action: string
  note?: string
}

export interface ApprovalRequest {
  id: number
  no: string
  requestDate: string
  division: string
  requestedBy: string
  office: string
  table: string // source transaction, e.g. "Purchase Order"
  party: string
  notes: string
  level: string
  status: ApprovalStatus
  approvalDate: string | null
  updatedAt: string
  lines: ApprovalLine[]
  history: ApprovalEvent[]
}

export const APPROVAL_STATUS_COLOR: Record<DecidedStatus, string> = {
  APPROVED: 'green',
  REVISE: 'blue',
  REJECTED: 'red',
}

export const APPROVAL_STATUS_LABEL: Record<DecidedStatus, string> = {
  APPROVED: 'Approved',
  REVISE: 'Revise',
  REJECTED: 'Rejected',
}

const ME = 'Pajar Padillah'

type Seed = Omit<ApprovalRequest, 'id' | 'status' | 'approvalDate' | 'updatedAt' | 'history' | 'level'> & {
  status?: ApprovalStatus
  decidedAt?: string
}

const SEEDS: Seed[] = [
  {
    no: 'PR-2025-004', requestDate: '2026-10-19T08:42:00', division: 'Finance', requestedBy: 'Sarah Johnson',
    office: 'PT Sant Group Indonesia', table: 'Payment Request', party: 'PT Logistik Cepat', notes: 'October freight invoices, due 25 Oct.',
    lines: [{ item: 'Freight Jakarta – Surabaya', qty: 4, unit: 'trip', price: 3_250_000 }, { item: 'Handling fee', qty: 1, unit: 'lot', price: 850_000 }],
  },
  {
    no: 'PO-2025-018', requestDate: '2026-10-18T14:10:00', division: 'Procurement', requestedBy: 'Michael Chen',
    office: 'PT Sant Group Indonesia', table: 'Purchase Order', party: 'PT Kemasan Prima', notes: 'Packaging restock for Q4 campaign.',
    lines: [{ item: 'Bottle 200ml PET', qty: 5000, unit: 'pcs', price: 1_450 }, { item: 'Pump cap 24/410', qty: 5000, unit: 'pcs', price: 980 }, { item: 'Carton box 24s', qty: 210, unit: 'pcs', price: 6_500 }],
  },
  {
    no: 'PR-2025-006', requestDate: '2026-10-18T09:05:00', division: 'Marketing', requestedBy: 'Emily Davis',
    office: 'CV Crusita Kosmetika', table: 'Payment Request', party: 'Digital Ads Agency', notes: 'Paid social campaign — week 3–4.',
    lines: [{ item: 'Meta ads budget', qty: 1, unit: 'lot', price: 12_500_000 }, { item: 'Agency fee', qty: 1, unit: 'lot', price: 2_500_000 }],
  },
  {
    no: 'SO-SGI-2026-000003', requestDate: '2026-10-17T11:20:00', division: 'Sales', requestedBy: 'Andi Pratama',
    office: 'PT Sant Group Indonesia', table: 'Sales Order', party: 'Toko Kosmetik Sukses Mandiri', notes: 'Special discount 12% above the standard limit.',
    lines: [{ item: 'Aoera Hand & Body Lotion 200ml', qty: 120, unit: 'pcs', price: 39_600 }, { item: 'Aoera Hair & Body Mist 100ml', qty: 80, unit: 'pcs', price: 48_400 }],
  },
  {
    no: 'PRQ-2026-0042', requestDate: '2026-10-16T15:45:00', division: 'Production', requestedBy: 'Budi Santoso',
    office: 'PT Indesso Aroma', table: 'Purchase Request', party: '-', notes: 'Raw material for batch #2026-11.',
    lines: [{ item: 'Glycerin USP', qty: 400, unit: 'kg', price: 28_000 }, { item: 'Fragrance oil — Floral 07', qty: 25, unit: 'kg', price: 410_000 }],
  },
  {
    no: 'EXP-2026-0118', requestDate: '2026-10-15T10:00:00', division: 'Sales', requestedBy: 'Siti Rahma',
    office: 'CV Crusita Kosmetika', table: 'Expense Claim', party: 'Siti Rahma', notes: 'Customer visit Bandung, 13–14 Oct.',
    lines: [{ item: 'Hotel', qty: 1, unit: 'night', price: 650_000 }, { item: 'Fuel & toll', qty: 1, unit: 'lot', price: 420_000 }, { item: 'Meals', qty: 2, unit: 'day', price: 150_000 }],
  },
  {
    no: 'ADJ-2026-0009', requestDate: '2026-10-14T16:30:00', division: 'Warehouse', requestedBy: 'Yusuf Hidayat',
    office: 'PT Sant Group Indonesia', table: 'Stock Adjustment', party: '-', notes: 'Stock opname variance, rack B-03.',
    lines: [{ item: 'Aoera Hair & Body Mist 100ml', qty: -6, unit: 'pcs', price: 22_000 }, { item: 'Aoera Hand & Body Lotion 200ml', qty: 3, unit: 'pcs', price: 18_500 }],
  },
  {
    no: 'PO-2025-016', requestDate: '2026-10-10T13:00:00', division: 'Procurement', requestedBy: 'Michael Chen',
    office: 'PT Indesso Aroma', table: 'Purchase Order', party: 'CV Bahan Kimia Jaya', notes: '',
    lines: [{ item: 'Ethanol 96%', qty: 600, unit: 'L', price: 19_500 }],
    status: 'APPROVED', decidedAt: '2026-10-11T09:12:00',
  },
  {
    no: 'PR-2025-002', requestDate: '2026-10-08T10:30:00', division: 'Finance', requestedBy: 'Dewi Lestari',
    office: 'PT Sant Group Indonesia', table: 'Payment Request', party: 'PLN', notes: 'Electricity September.',
    lines: [{ item: 'Electricity — warehouse', qty: 1, unit: 'month', price: 8_740_000 }],
    status: 'APPROVED', decidedAt: '2026-10-08T15:02:00',
  },
  {
    no: 'PR-2025-001', requestDate: '2026-10-06T09:00:00', division: 'Marketing', requestedBy: 'Emily Davis',
    office: 'CV Crusita Kosmetika', table: 'Payment Request', party: 'Event Organizer Nusantara', notes: 'Booth deposit.',
    lines: [{ item: 'Booth deposit 50%', qty: 1, unit: 'lot', price: 17_500_000 }],
    status: 'REJECTED', decidedAt: '2026-10-07T11:40:00',
  },
  {
    no: 'SO-SGI-2026-000001', requestDate: '2026-10-05T14:15:00', division: 'Sales', requestedBy: 'Andi Pratama',
    office: 'PT Sant Group Indonesia', table: 'Sales Order', party: 'PT Cantik Distribusi Nusantara', notes: 'Credit limit exceeded by Rp 4 jt.',
    lines: [{ item: 'Aoera Hand & Body Lotion 200ml', qty: 150, unit: 'pcs', price: 45_000 }, { item: 'Aoera Hair & Body Mist 100ml', qty: 91, unit: 'pcs', price: 55_000 }],
    status: 'REVISE', decidedAt: '2026-10-06T08:30:00',
  },
]

const DECISION_STATUS: Record<ApprovalDecision, ApprovalStatus> = { approve: 'APPROVED', revise: 'REVISE', reject: 'REJECTED' }
const STATUS_ACTION: Record<ApprovalStatus, string> = {
  PENDING: 'Submitted for approval',
  APPROVED: 'Approved',
  REVISE: 'Sent back for revision',
  REJECTED: 'Rejected',
}

function build(seed: Seed, index: number): ApprovalRequest {
  const status = seed.status ?? 'PENDING'
  const history: ApprovalEvent[] = [{ at: seed.requestDate, by: seed.requestedBy, action: STATUS_ACTION.PENDING }]
  if (seed.decidedAt) history.push({ at: seed.decidedAt, by: ME, action: STATUS_ACTION[status] })
  return {
    ...seed,
    id: index + 1,
    level: 'Level 1 · Head of ' + seed.division,
    status,
    approvalDate: seed.decidedAt ?? null,
    updatedAt: seed.decidedAt ?? seed.requestDate,
    history,
  }
}

/** Status of the underlying document: approval makes it ACTIVE, revise returns it to DRAFT. */
export type ApprovalDocStatus = 'SUBMITTED' | 'ACTIVE' | 'DRAFT' | 'REJECTED'
const DOC_STATUS: Record<ApprovalStatus, ApprovalDocStatus> = {
  PENDING: 'SUBMITTED',
  APPROVED: 'ACTIVE',
  REVISE: 'DRAFT',
  REJECTED: 'REJECTED',
}
export const DOC_STATUS_COLOR: Record<ApprovalDocStatus, string> = {
  SUBMITTED: 'amber',
  ACTIVE: 'blue',
  DRAFT: 'gray',
  REJECTED: 'red',
}
export const documentStatus = (r: ApprovalRequest) => DOC_STATUS[r.status]

/** Display label for a transaction table: "purchase_orders" → "Purchase Order" (readable names pass through). */
export function tableLabel(table: string): string {
  if (!table.includes('_') && table !== table.toLowerCase()) return table
  return table
    .split('_')
    .map((w, i, all) => (i === all.length - 1 ? w.replace(/ies$/, 'y').replace(/s$/, '') : w))
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export const lineTotal = (l: ApprovalLine) => l.qty * l.price
export const requestTotal = (r: ApprovalRequest) => r.lines.reduce((s, l) => s + lineTotal(l), 0)

export const useApprovalStore = defineStore('approvals', {
  state: () => ({ requests: SEEDS.map(build) }),
  getters: {
    pending: (state) => state.requests.filter((r) => r.status === 'PENDING').sort((a, b) => b.requestDate.localeCompare(a.requestDate)),
  },
  actions: {
    get(id: number) {
      return this.requests.find((r) => r.id === id)
    },
    decide(id: number, decision: ApprovalDecision, note?: string) {
      const r = this.get(id)
      if (!r || r.status !== 'PENDING') return
      const now = new Date().toISOString().slice(0, 19)
      r.status = DECISION_STATUS[decision]
      r.approvalDate = now
      r.updatedAt = now
      r.history.push({ at: now, by: ME, action: STATUS_ACTION[r.status], note: note || undefined })
    },
  },
})
