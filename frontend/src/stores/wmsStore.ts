// Warehouse Management (WMS) – fully functional in the browser (no backend yet).
// Ported from the standalone "Sant Group WMS" prototype: bins hold several SKU/batch lots,
// inbound goes to the transit bin until put away, outbound is picked FEFO, every stock
// movement is written to the batch ledger, and bins under a running cycle count are frozen.
// State persists in localStorage.
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAuthStore } from './authStore'

const STORAGE_KEY = 'mini-erp.wms.v1'
export const TRANSIT_BIN = 'TR-01'
export const TRANSIT_ZONE = 'Zone Transit'

// ---------------------------------------------------------------- types
export interface Zone { id: string; name: string; prefix: string }
export interface Category { id: string; name: string; prefix: string; zone: string }
export interface Sku {
  sku: string
  name: string
  category: string
  unit: string
  price: number // purchase price per unit
  sellPrice: number
  hasBatch: boolean
  hasExpiry: boolean
  inactive?: boolean
}
export interface Lot { sku: string; batch: string; exp: string; qty: number }
export interface Bin { id: number; zone: string; rack: string; bin: string; capacity: number; lots: Lot[] }
export interface Contact { id: string; name: string; type: 'SUPPLIER' | 'CUSTOMER'; term?: 'BELI PUTUS' | 'KONSINYASI' }
export interface DocLog { ts: string; by: string; action: string; note?: string }

export interface Putaway { bin: string; qty: number; at: string; by: string }
export interface InboundItem { sku: string; qty: number; batch: string; exp: string; putaways: Putaway[] }
export interface Inbound {
  id: number
  no: string // delivery note (surat jalan) number
  poRef: string
  date: string
  supplier: string
  source?: 'SUPPLIER' | 'TRANSFER'
  items: InboundItem[]
  createdBy: string
  completedAt?: string
  logs: DocLog[]
}

export interface Alloc { bin: string; batch: string; exp: string; qty: number }
export type OutboundItemStatus = 'PENDING' | 'ALLOCATED' | 'PICKED' | 'SHIPPED'
export interface OutboundItem {
  sku: string
  qty: number
  status: OutboundItemStatus
  allocations: Alloc[]
  pickedQty: number
  shippedQty: number
  shippedAllocs: Alloc[]
}
export interface Shipment { no: number; ts: string; by: string; lines: (Alloc & { sku: string })[] }
export interface Outbound {
  id: number
  no: string // DO number
  poCust: string
  date: string
  customer: string
  term: string
  note: string
  items: OutboundItem[]
  dispatched: boolean
  closedShort?: boolean
  shipments: Shipment[]
  createdBy: string
  logs: DocLog[]
}

export interface Transfer {
  no: string
  date: string
  srcBin: string
  tgtBin: string
  sku: string
  batch: string
  exp: string
  qty: number
  toTransit: boolean
  inboundNo?: string
  createdBy: string
  createdAt: string
  logs: DocLog[]
}

export interface AdjustmentLine { sku: string; bin: string; batch: string; exp: string; qty: number }
export interface Adjustment {
  no: string
  date: string
  reason: string
  note: string
  lines: AdjustmentLine[]
  createdBy: string
  createdAt: string
  logs: DocLog[]
}

export interface CycleCountLine {
  bin: string
  zone: string
  rack: string
  sku: string | null // null = empty bin, verified as empty
  batch: string
  exp: string
  sysQty: number
  countQty: number | null
  adjusted: boolean
}
export interface CycleCount {
  id: number
  code: string
  date: string
  zones: string[]
  racks: string[]
  bins: string[]
  status: 'IN PROGRESS' | 'DONE'
  lines: CycleCountLine[]
  createdBy: string
  createdAt: string
  finishedAt: string | null
  logs: DocLog[]
}

export type LedgerType =
  | 'OPENING'
  | 'INBOUND RECEIVING'
  | 'INBOUND PUTAWAY'
  | 'INBOUND CANCELLED'
  | 'OUTBOUND PICK'
  | 'DISPATCH'
  | 'TRANSFER'
  | 'STOCK ADJUSTMENT'
  | 'CYCLE COUNT ADJ'
export interface LedgerEntry {
  id: number
  ts: string
  type: LedgerType
  sku: string
  batch: string
  exp: string
  qty: number // + in, - out, 0 = move between bins
  fromBin: string | null
  toBin: string | null
  ref: string
  note: string
}

export interface Result<T = undefined> { ok: boolean; msg: string; data?: T }
const ok = <T>(msg = '', data?: T): Result<T> => ({ ok: true, msg, data })
const fail = <T = undefined>(msg: string): Result<T> => ({ ok: false, msg })

// ---------------------------------------------------------------- pure helpers
export const normLot = (v?: string | null) => (v === undefined || v === null || v === '' ? '-' : v)
export const lotKey = (bin: string, batch: string, exp: string) => `${bin}|${normLot(batch)}|${normLot(exp)}`

export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return todayISO(d)
}

export type ExpiryStatus = 'EXPIRED' | '<3M' | '<6M' | '<12M' | '<18M' | 'GOOD'
export const EXPIRY_STATUSES: { key: ExpiryStatus; label: string; color: 'red' | 'amber' | 'blue' | 'gray' | 'green' }[] = [
  { key: 'EXPIRED', label: 'Expired', color: 'red' },
  { key: '<3M', label: '< 3 months', color: 'red' },
  { key: '<6M', label: '< 6 months', color: 'amber' },
  { key: '<12M', label: '< 12 months', color: 'blue' },
  { key: '<18M', label: '< 18 months', color: 'gray' },
  { key: 'GOOD', label: 'Good', color: 'green' },
]
/** Expiry bucket of a lot: days left until its expiry date. */
export function expiryStatus(exp: string, hasExpiry = true): ExpiryStatus {
  if (!hasExpiry || !exp || exp === '-') return 'GOOD'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(exp)
  d.setHours(0, 0, 0, 0)
  const days = Math.floor((d.getTime() - today.getTime()) / 86_400_000)
  if (days <= 0) return 'EXPIRED'
  if (days <= 90) return '<3M'
  if (days <= 180) return '<6M'
  if (days <= 360) return '<12M'
  if (days <= 540) return '<18M'
  return 'GOOD'
}
export function daysToExpiry(exp: string): number | null {
  if (!exp || exp === '-') return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((new Date(exp).getTime() - today.getTime()) / 86_400_000)
}

export const binQty = (b: Bin) => b.lots.reduce((a, l) => a + (l.qty || 0), 0)
export const binAvailCap = (b: Bin) => Math.max(0, b.capacity - binQty(b))
export const binFillPct = (b: Bin) => (b.capacity > 0 ? Math.min(100, Math.round((binQty(b) / b.capacity) * 100)) : 0)
export type BinStatus = 'available' | 'nearfull' | 'full'
export function binStatus(b: Bin): BinStatus {
  const pct = binFillPct(b)
  return pct >= 100 ? 'full' : pct >= 80 ? 'nearfull' : 'available'
}
export const BIN_STATUS_LABEL: Record<BinStatus, string> = { available: 'Available', nearfull: 'Nearly full', full: 'Full' }
export const binSkuCount = (b: Bin) => new Set(b.lots.filter((l) => l.qty > 0).map((l) => l.sku)).size

export function findLot(b: Bin, sku: string, batch: string, exp: string): Lot | undefined {
  return b.lots.find((l) => l.sku === sku && normLot(l.batch) === normLot(batch) && normLot(l.exp) === normLot(exp))
}
function addLot(b: Bin, sku: string, batch: string, exp: string, qty: number) {
  const lot = findLot(b, sku, batch, exp)
  if (lot) lot.qty += qty
  else b.lots.push({ sku, batch: normLot(batch), exp: normLot(exp), qty })
}
function removeLot(b: Bin, sku: string, batch: string, exp: string, qty: number): number {
  const lot = findLot(b, sku, batch, exp)
  if (!lot) return 0
  const take = Math.min(lot.qty, qty)
  lot.qty -= take
  if (lot.qty <= 0) b.lots = b.lots.filter((l) => l !== lot)
  return take
}

export const itemPutawayDone = (it: InboundItem) => it.putaways.reduce((a, p) => a + p.qty, 0)
export const itemPutawayRemaining = (it: InboundItem) => Math.max(0, it.qty - itemPutawayDone(it))
export type InboundStatus = 'IN TRANSIT' | 'PARTIAL PUTAWAY' | 'PUTAWAY COMPLETE'
export function inboundStatus(doc: Inbound): InboundStatus {
  const total = doc.items.reduce((a, i) => a + i.qty, 0)
  const done = doc.items.reduce((a, i) => a + itemPutawayDone(i), 0)
  if (total === 0 || done === 0) return 'IN TRANSIT'
  return done < total ? 'PARTIAL PUTAWAY' : 'PUTAWAY COMPLETE'
}
export function inboundProgress(doc: Inbound) {
  const totalQty = doc.items.reduce((a, i) => a + i.qty, 0)
  const doneQty = doc.items.reduce((a, i) => a + itemPutawayDone(i), 0)
  return { totalQty, doneQty, remainingQty: totalQty - doneQty, pct: totalQty ? Math.round((doneQty / totalQty) * 100) : 0 }
}

export const itemOutstanding = (it: OutboundItem) => Math.max(0, it.qty - it.shippedQty)
export const itemFulfilled = (doc: Outbound, it: OutboundItem) => it.shippedQty + (doc.dispatched ? 0 : it.status === 'PICKED' ? it.pickedQty : 0)
export type OutboundStatus = 'PENDING' | 'ALLOCATED' | 'PARTIAL PICKED' | 'READY TO SHIP' | 'OUTSTANDING' | 'DISPATCHED' | 'CLOSED'
export function outboundReady(doc: Outbound): boolean {
  if (doc.dispatched || doc.items.some((i) => i.status === 'ALLOCATED')) return false
  return doc.items.some((i) => i.status === 'PICKED' && i.pickedQty > 0)
}
export function outboundStatus(doc: Outbound): OutboundStatus {
  if (doc.dispatched) return doc.closedShort ? 'CLOSED' : 'DISPATCHED'
  if (outboundReady(doc)) return 'READY TO SHIP'
  if (doc.shipments.length && !doc.items.some((i) => i.status === 'ALLOCATED' || i.status === 'PICKED')) return 'OUTSTANDING'
  if (doc.items.some((i) => i.status === 'PICKED')) return 'PARTIAL PICKED'
  if (doc.items.some((i) => i.status === 'ALLOCATED')) return 'ALLOCATED'
  return 'PENDING'
}
export function outboundProgress(doc: Outbound) {
  const totalQty = doc.items.reduce((a, i) => a + i.qty, 0)
  const doneQty = doc.items.reduce((a, i) => a + Math.min(i.qty, itemFulfilled(doc, i)), 0)
  const shippedQty = doc.items.reduce((a, i) => a + i.shippedQty, 0)
  return { totalQty, doneQty, shippedQty, outstanding: Math.max(0, totalQty - shippedQty), pct: totalQty ? Math.round((doneQty / totalQty) * 100) : 0 }
}

export function ccProgress(cc: CycleCount) {
  const total = cc.lines.length
  const matched = cc.lines.filter((l) => l.countQty !== null && l.countQty === l.sysQty).length
  const counted = cc.lines.filter((l) => l.countQty !== null).length
  return { total, matched, counted, pct: total ? Math.round((matched / total) * 100) : 0 }
}

// ---------------------------------------------------------------- demo data
function seedState() {
  const zones: Zone[] = [
    { id: TRANSIT_ZONE, name: 'Transit (Inbound Receiving)', prefix: 'TR' },
    { id: 'Zone A', name: 'Zone A – Raw Material (temperature controlled)', prefix: 'A1' },
    { id: 'Zone B', name: 'Zone B – Packaging & Labels', prefix: 'B1' },
    { id: 'Zone C', name: 'Zone C – Finished Goods', prefix: 'C1' },
  ]
  const categories: Category[] = [
    { id: 'RAW', name: 'Perfume Raw Material', prefix: 'RAW-', zone: 'Zone A' },
    { id: 'PKG', name: 'Packaging (bottle, pump, box)', prefix: 'PKG-', zone: 'Zone B' },
    { id: 'LBL', name: 'Labels & Stickers', prefix: 'LBL-', zone: 'Zone B' },
    { id: 'FG', name: 'Finished Goods (Perfume)', prefix: 'FG-', zone: 'Zone C' },
  ]
  const s = (sku: string, name: string, category: string, unit: string, price: number, sellPrice: number, hasBatch: boolean, hasExpiry: boolean): Sku => ({ sku, name, category, unit, price, sellPrice, hasBatch, hasExpiry })
  const skus: Sku[] = [
    s('RAW-01', 'Fragrance Oil Crusita Imagine (1 Kg)', 'RAW', 'Kg', 850000, 0, true, true),
    s('RAW-02', 'Ethanol 96% Perfumery Grade (Drum 25 L)', 'RAW', 'Drum', 1250000, 0, true, true),
    s('RAW-03', 'Dipropylene Glycol / DPG (Jerrycan 20 Kg)', 'RAW', 'Jerrycan', 650000, 0, true, true),
    s('RAW-04', 'Fragrance Oil Aoera Bloom (1 Kg)', 'RAW', 'Kg', 920000, 0, true, true),
    s('PKG-01', 'Glass Bottle 50 ml Crusita (Clear)', 'PKG', 'Pcs', 4500, 0, true, false),
    s('PKG-02', 'Pump Sprayer 15 mm Gold + Collar', 'PKG', 'Pcs', 1800, 0, true, false),
    s('PKG-03', 'Gift Box Aoera 100 ml', 'PKG', 'Pcs', 3200, 0, false, false),
    s('LBL-01', 'Bottle Label Crusita Imagine (Roll 1,000)', 'LBL', 'Roll', 95000, 0, false, false),
    s('FG-01', 'Crusita Imagine EDP 50 ml', 'FG', 'Pcs', 185000, 265000, true, true),
    s('FG-02', 'Aoera Bloom EDP 100 ml', 'FG', 'Pcs', 245000, 349000, true, true),
    s('FG-03', 'YORS Studio Noir EDP 50 ml', 'FG', 'Pcs', 210000, 299000, true, true),
    s('FG-04', 'Kyfee Bali 83 EDP 35 ml', 'FG', 'Pcs', 165000, 229000, true, true),
  ]
  const lot = (sku: string, batch: string, exp: string, qty: number): Lot => ({ sku, batch, exp, qty })
  const bins: Bin[] = [
    { id: 0, zone: TRANSIT_ZONE, rack: 'TR', bin: TRANSIT_BIN, capacity: 5000, lots: [] },
    { id: 1, zone: 'Zone A', rack: 'R1', bin: 'A1-R1-B1', capacity: 300, lots: [lot('RAW-01', 'FO-2603-11', addDays(45), 120), lot('RAW-01', 'FO-2607-02', addDays(250), 40), lot('RAW-04', 'FO-2605-08', addDays(70), 25)] },
    { id: 2, zone: 'Zone A', rack: 'R1', bin: 'A1-R1-B2', capacity: 40, lots: [lot('RAW-02', 'ETH-2604-01', addDays(200), 40)] },
    { id: 3, zone: 'Zone A', rack: 'R2', bin: 'A1-R2-B1', capacity: 150, lots: [lot('RAW-01', 'FO-2609-01', addDays(120), 30)] },
    { id: 4, zone: 'Zone A', rack: 'R2', bin: 'A1-R2-B2', capacity: 60, lots: [lot('RAW-03', 'DPG-2606-03', addDays(35), 12)] },
    { id: 5, zone: 'Zone B', rack: 'R1', bin: 'B1-R1-B1', capacity: 5000, lots: [lot('PKG-01', 'GLS-2608', '-', 3200), lot('PKG-02', 'PMP-2607', '-', 1500)] },
    { id: 6, zone: 'Zone B', rack: 'R1', bin: 'B1-R1-B2', capacity: 3000, lots: [lot('PKG-03', '-', '-', 800), lot('LBL-01', '-', '-', 12)] },
    { id: 7, zone: 'Zone B', rack: 'R2', bin: 'B1-R2-B1', capacity: 3000, lots: [] },
    { id: 8, zone: 'Zone C', rack: 'R1', bin: 'C1-R1-B1', capacity: 600, lots: [lot('FG-01', 'PRD-2609-01', addDays(1050), 480), lot('FG-03', 'PRD-2608-07', addDays(1000), 90)] },
    { id: 9, zone: 'Zone C', rack: 'R1', bin: 'C1-R1-B2', capacity: 600, lots: [lot('FG-02', 'PRD-2607-03', addDays(20), 220), lot('FG-04', 'PRD-2609-05', addDays(1060), 150)] },
    { id: 10, zone: 'Zone C', rack: 'R2', bin: 'C1-R2-B1', capacity: 600, lots: [] },
  ]
  const contacts: Contact[] = [
    { id: 'S-INDESSO', name: 'PT Indesso Aroma', type: 'SUPPLIER' },
    { id: 'S-IGAR', name: 'PT Igar Jaya', type: 'SUPPLIER' },
    { id: 'S-BAJA', name: 'PT Baja Perkasa', type: 'SUPPLIER' },
    { id: 'S-PLASTINDO', name: 'PT Plastindo Utama', type: 'SUPPLIER' },
    { id: 'S-KEMASAN', name: 'CV Kemasan Prima', type: 'SUPPLIER' },
    { id: 'C-CANTIK', name: 'PT Cantik Distribusi Nusantara', type: 'CUSTOMER', term: 'BELI PUTUS' },
    { id: 'C-SUKSES', name: 'Toko Kosmetik Sukses Mandiri', type: 'CUSTOMER', term: 'BELI PUTUS' },
    { id: 'C-MITRA', name: 'PT Mitra Retail Nusantara', type: 'CUSTOMER', term: 'KONSINYASI' },
    { id: 'C-CRUSITA-OS', name: 'Crusita Official Store', type: 'CUSTOMER', term: 'BELI PUTUS' },
    { id: 'C-ALFA', name: 'Alfamart DC Cikarang', type: 'CUSTOMER', term: 'KONSINYASI' },
  ]
  const now = new Date().toISOString()
  const inbound: Inbound[] = [
    {
      id: 1, no: 'SJ-2026-0001', poRef: 'PO/AOR/0035', date: addDays(-2), supplier: 'PT Indesso Aroma', createdBy: 'System', logs: [{ ts: now, by: 'System', action: 'Created – goods received in Transit' }],
      items: [
        { sku: 'RAW-01', qty: 50, batch: 'FO-2609-12', exp: addDays(110), putaways: [] },
        { sku: 'RAW-02', qty: 10, batch: 'ETH-2609-04', exp: addDays(150), putaways: [] },
        { sku: 'RAW-04', qty: 20, batch: 'FO-2609-15', exp: addDays(130), putaways: [] },
      ],
    },
    {
      id: 2, no: 'SJ-2026-0002', poRef: '', date: addDays(-1), supplier: 'PT Igar Jaya', createdBy: 'System', logs: [{ ts: now, by: 'System', action: 'Created – goods received in Transit' }],
      items: [{ sku: 'PKG-03', qty: 500, batch: '-', exp: '-', putaways: [] }],
    },
  ]
  const oi = (sku: string, qty: number): OutboundItem => ({ sku, qty, status: 'PENDING', allocations: [], pickedQty: 0, shippedQty: 0, shippedAllocs: [] })
  const outbound: Outbound[] = [
    { id: 1, no: 'DO-2026-0001', poCust: 'PO-CANTIK-118', date: addDays(-1), customer: 'Crusita Official Store', term: 'BELI PUTUS', note: '', items: [oi('FG-01', 160), oi('FG-03', 10)], dispatched: false, shipments: [], createdBy: 'System', logs: [] },
    { id: 2, no: 'DO-2026-0002', poCust: 'PO-ALFA-552', date: todayISO(), customer: 'Alfamart DC Cikarang', term: 'KONSINYASI', note: '', items: [oi('FG-04', 5)], dispatched: false, shipments: [], createdBy: 'System', logs: [] },
  ]
  // Demo movements over the last week, so the ledger and dashboards are not empty.
  const demo: [number, LedgerType, string, string, number, string | null, string | null, string][] = [
    [6, 'INBOUND PUTAWAY', 'RAW-01', 'FO-2603-11', 120, TRANSIT_BIN, 'A1-R1-B1', 'SJ-DEMO-01'],
    [6, 'INBOUND PUTAWAY', 'RAW-02', 'ETH-2604-01', 40, TRANSIT_BIN, 'A1-R1-B2', 'SJ-DEMO-01'],
    [5, 'INBOUND PUTAWAY', 'FG-01', 'PRD-2609-01', 520, TRANSIT_BIN, 'C1-R1-B1', 'SJ-DEMO-02'],
    [5, 'OUTBOUND PICK', 'FG-02', 'PRD-2607-03', -60, 'C1-R1-B2', null, 'DO-DEMO-01'],
    [4, 'OUTBOUND PICK', 'FG-01', 'PRD-2609-01', -40, 'C1-R1-B1', null, 'DO-DEMO-02'],
    [3, 'INBOUND PUTAWAY', 'RAW-04', 'FO-2605-08', 25, TRANSIT_BIN, 'A1-R1-B1', 'SJ-DEMO-04'],
    [3, 'OUTBOUND PICK', 'FG-03', 'PRD-2608-07', -30, 'C1-R1-B1', null, 'DO-DEMO-03'],
    [2, 'INBOUND PUTAWAY', 'PKG-01', 'GLS-2608', 3200, TRANSIT_BIN, 'B1-R1-B1', 'SJ-DEMO-05'],
    [2, 'OUTBOUND PICK', 'FG-04', 'PRD-2609-05', -50, 'C1-R1-B2', null, 'DO-DEMO-04'],
    [1, 'OUTBOUND PICK', 'FG-02', 'PRD-2607-03', -20, 'C1-R1-B2', null, 'DO-DEMO-05'],
    [0, 'OUTBOUND PICK', 'FG-01', 'PRD-2609-01', -25, 'C1-R1-B1', null, 'DO-DEMO-06'],
  ]
  const ledger: LedgerEntry[] = demo.map(([days, type, sku, batch, qty, fromBin, toBin, ref], i) => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    d.setHours(9 + (i % 8), 15, 0, 0)
    const lotExp = bins.flatMap((b) => b.lots).find((l) => l.sku === sku && l.batch === batch)?.exp ?? '-'
    return { id: i + 1, ts: d.toISOString(), type, sku, batch, exp: lotExp, qty, fromBin, toBin, ref, note: 'Demo data' }
  })
  // Goods of the open inbound documents are physically in transit.
  inbound.forEach((doc) => doc.items.forEach((it) => ledger.push({ id: ledger.length + 1, ts: new Date(doc.date + 'T08:00:00').toISOString(), type: 'INBOUND RECEIVING', sku: it.sku, batch: it.batch, exp: it.exp, qty: it.qty, fromBin: null, toBin: TRANSIT_BIN, ref: doc.no, note: `Supplier: ${doc.supplier}` })))

  return {
    zones,
    categories,
    skus,
    bins,
    contacts,
    inbound,
    outbound,
    transfers: [] as Transfer[],
    adjustments: [] as Adjustment[],
    cycleCounts: [] as CycleCount[],
    ledger,
  }
}
type WmsData = ReturnType<typeof seedState>

function loadState(): WmsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as WmsData
      if (parsed && Array.isArray(parsed.bins) && Array.isArray(parsed.skus)) return parsed
    }
  } catch {
    // ignore storage failures
  }
  return seedState()
}

// ---------------------------------------------------------------- store
export const useWmsStore = defineStore('wms', () => {
  const initial = loadState()
  const zones = ref(initial.zones)
  const categories = ref(initial.categories)
  const skus = ref(initial.skus)
  const bins = ref(initial.bins)
  const contacts = ref(initial.contacts)
  const inbound = ref(initial.inbound)
  const outbound = ref(initial.outbound)
  const transfers = ref(initial.transfers)
  const adjustments = ref(initial.adjustments)
  const cycleCounts = ref(initial.cycleCounts)
  const ledger = ref(initial.ledger)

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          zones: zones.value, categories: categories.value, skus: skus.value, bins: bins.value, contacts: contacts.value,
          inbound: inbound.value, outbound: outbound.value, transfers: transfers.value, adjustments: adjustments.value,
          cycleCounts: cycleCounts.value, ledger: ledger.value,
        }),
      )
    } catch {
      // ignore storage failures
    }
  }
  let persistTimer: number | undefined
  watch([zones, categories, skus, bins, contacts, inbound, outbound, transfers, adjustments, cycleCounts, ledger], () => {
    window.clearTimeout(persistTimer)
    persistTimer = window.setTimeout(persist, 150)
  }, { deep: true })

  const who = () => useAuthStore().user?.name ?? 'User'
  const log = (doc: { logs: DocLog[] }, action: string, note = '') => doc.logs.push({ ts: new Date().toISOString(), by: who(), action, note })

  // ---------- lookups
  const sku = (code: string) => skus.value.find((s) => s.sku === code)
  const skuName = (code: string) => sku(code)?.name ?? code
  const skuUnit = (code: string) => sku(code)?.unit ?? 'Unit'
  const bin = (code: string) => bins.value.find((b) => b.bin === code)
  const zone = (id: string) => zones.value.find((z) => z.id === id)
  const category = (id: string) => categories.value.find((c) => c.id === id)
  const storageBins = computed(() => bins.value.filter((b) => b.zone !== TRANSIT_ZONE))
  const transitBin = () => {
    let b = bin(TRANSIT_BIN)
    if (!b) {
      b = { id: 0, zone: TRANSIT_ZONE, rack: 'TR', bin: TRANSIT_BIN, capacity: 5000, lots: [] }
      bins.value.unshift(b)
    }
    return b
  }

  /** Every lot across bins, flattened with its bin's location. */
  function stockLots(pred?: (l: Lot & { bin: string; zone: string; rack: string }) => boolean) {
    const out: (Lot & { bin: string; zone: string; rack: string })[] = []
    bins.value.forEach((b) => b.lots.forEach((l) => {
      if (l.qty <= 0) return
      const rec = { ...l, batch: normLot(l.batch), exp: normLot(l.exp), bin: b.bin, zone: b.zone, rack: b.rack }
      if (!pred || pred(rec)) out.push(rec)
    }))
    return out
  }

  function logMove(type: LedgerType, s: string, batch: string, exp: string, qty: number, fromBin: string | null, toBin: string | null, ref: string, note = '') {
    const id = ledger.value.length ? Math.max(...ledger.value.map((e) => e.id)) + 1 : 1
    ledger.value.push({ id, ts: new Date().toISOString(), type, sku: s, batch: normLot(batch), exp: normLot(exp), qty, fromBin, toBin, ref, note })
  }

  /** The transit bin always holds exactly what open inbound documents still have to put away. */
  function syncTransit() {
    const b = transitBin()
    b.lots = []
    inbound.value.forEach((doc) => doc.items.forEach((it) => {
      const rem = itemPutawayRemaining(it)
      if (rem > 0) addLot(b, it.sku, it.batch, it.exp, rem)
    }))
    const q = binQty(b)
    if (q > b.capacity) b.capacity = Math.ceil(q / 1000) * 1000
  }

  // ---------- frozen bins (running cycle counts)
  const frozenBins = computed(() => {
    const m = new Map<string, string>()
    cycleCounts.value.filter((c) => c.status === 'IN PROGRESS').forEach((c) => c.lines.forEach((l) => { if (!m.has(l.bin)) m.set(l.bin, c.code) }))
    return m
  })
  const isFrozen = (code: string) => frozenBins.value.has(code)
  const frozenBy = (code: string) => frozenBins.value.get(code) ?? null

  // ---------- reservations (allocated, not yet picked)
  function reservedOnLot(binCode: string, batch: string, exp: string, exceptItem?: OutboundItem): number {
    const key = lotKey(binCode, batch, exp)
    let r = 0
    outbound.value.forEach((doc) => {
      if (doc.dispatched) return
      doc.items.forEach((it) => {
        if (it.status !== 'ALLOCATED' || it === exceptItem) return
        it.allocations.forEach((a) => { if (lotKey(a.bin, a.batch, a.exp) === key) r += a.qty })
      })
    })
    return r
  }
  /** Stock on shelves (excludes transit) minus reservations. */
  function availableQty(code: string): number {
    return stockLots((l) => l.sku === code && l.zone !== TRANSIT_ZONE).reduce((a, l) => a + Math.max(0, l.qty - reservedOnLot(l.bin, l.batch, l.exp)), 0)
  }
  function skuMetrics(code: string) {
    const onHand = stockLots((l) => l.sku === code && l.zone !== TRANSIT_ZONE).reduce((a, l) => a + l.qty, 0)
    const transit = stockLots((l) => l.sku === code && l.zone === TRANSIT_ZONE).reduce((a, l) => a + l.qty, 0)
    let allocated = 0
    outbound.value.forEach((doc) => { if (!doc.dispatched) doc.items.forEach((it) => { if (it.sku === code && it.status === 'ALLOCATED') it.allocations.forEach((a) => { allocated += a.qty }) }) })
    const s = sku(code)
    return { onHand, transit, allocated, available: onHand - allocated, value: onHand * (s?.price ?? 0) }
  }

  // ---------- master data
  function nextSkuCode(catId: string): string {
    const cat = category(catId)
    const prefix = cat?.prefix ?? `${catId}-`
    const used = new Set(skus.value.filter((s) => s.sku.startsWith(prefix)).map((s) => parseInt(s.sku.slice(prefix.length), 10)).filter((n) => !Number.isNaN(n)))
    let n = 1
    while (used.has(n)) n++
    return `${prefix}${String(n).padStart(2, '0')}`
  }
  function saveSku(data: Sku, originalCode?: string): Result {
    if (!data.name.trim() || !data.unit.trim()) return fail('Name and unit are required.')
    if (!(data.price > 0)) return fail('Purchase price must be greater than 0.')
    const code = data.sku.trim().toUpperCase()
    if (!code) return fail('SKU code is required.')
    if (code !== originalCode && sku(code)) return fail(`SKU ${code} already exists.`)
    if (originalCode) {
      const s = sku(originalCode)
      if (!s) return fail('SKU not found.')
      const used = ledger.value.some((e) => e.sku === originalCode) || bins.value.some((b) => b.lots.some((l) => l.sku === originalCode))
      if (code !== originalCode && used) return fail(`SKU ${originalCode} already has stock history, so its code cannot change.`)
      Object.assign(s, { ...data, sku: code })
      return ok(`SKU ${code} updated.`)
    }
    skus.value.push({ ...data, sku: code })
    return ok(`SKU ${code} created.`)
  }

  function saveBin(data: { zone: string; rack: string; code: string; capacity: number }, originalCode?: string): Result<string> {
    if (!data.rack.trim() || !data.code.trim()) return fail('Rack and bin code are required.')
    if (!(data.capacity > 0)) return fail('Capacity must be greater than 0.')
    if (originalCode) {
      const b = bin(originalCode)
      if (!b) return fail('Bin not found.')
      if (data.capacity < binQty(b)) return fail(`Capacity cannot be lower than the current stock (${binQty(b)}).`)
      b.capacity = data.capacity
      b.zone = data.zone
      return ok(`Bin ${b.bin} updated.`)
    }
    const prefix = zone(data.zone)?.prefix ?? 'Z1'
    const full = `${prefix}-${data.rack.trim().toUpperCase()}-${data.code.trim().toUpperCase()}`
    if (bin(full)) return fail(`Bin ${full} already exists.`)
    const id = bins.value.length ? Math.max(...bins.value.map((b) => b.id)) + 1 : 1
    bins.value.push({ id, zone: data.zone, rack: data.rack.trim().toUpperCase(), bin: full, capacity: data.capacity, lots: [] })
    return ok(`Bin ${full} added to ${data.zone}.`, full)
  }
  function deleteBin(code: string): Result {
    if (code === TRANSIT_BIN) return fail('The transit bin cannot be deleted.')
    const b = bin(code)
    if (!b) return fail('Bin not found.')
    if (binQty(b) > 0) return fail(`Bin ${code} still holds ${binQty(b)} units.`)
    if (isFrozen(code)) return fail(`Bin ${code} is part of cycle count ${frozenBy(code)}.`)
    if (outbound.value.some((d) => !d.dispatched && d.items.some((i) => i.allocations.some((a) => a.bin === code)))) return fail(`Bin ${code} is allocated to an outbound order.`)
    bins.value = bins.value.filter((x) => x.bin !== code)
    return ok(`Bin ${code} deleted.`)
  }
  function saveZone(data: Zone, originalId?: string): Result {
    if (!data.id.trim() || !data.name.trim() || !data.prefix.trim()) return fail('Zone code, name and bin prefix are required.')
    const prefix = data.prefix.trim().toUpperCase()
    if (zones.value.some((z) => z.id !== originalId && z.prefix === prefix)) return fail(`Prefix ${prefix} is used by another zone.`)
    if (originalId) {
      const z = zone(originalId)
      if (!z) return fail('Zone not found.')
      z.name = data.name.trim()
      z.prefix = prefix
      return ok(`Zone ${z.id} updated.`)
    }
    if (zone(data.id.trim())) return fail(`Zone ${data.id} already exists.`)
    zones.value.push({ id: data.id.trim(), name: data.name.trim(), prefix })
    return ok(`Zone ${data.id} added.`)
  }

  function deleteZone(id: string): Result {
    if (id === TRANSIT_ZONE) return fail('The transit zone cannot be deleted.')
    if (bins.value.some((b) => b.zone === id)) return fail(`Zone ${id} still has bins.`)
    if (categories.value.some((c) => c.zone === id)) return fail(`Zone ${id} is the target zone of a category.`)
    zones.value = zones.value.filter((z) => z.id !== id)
    return ok(`Zone ${id} deleted.`)
  }
  function deleteSku(code: string): Result {
    const used = ledger.value.some((e) => e.sku === code) || bins.value.some((b) => b.lots.some((l) => l.sku === code))
      || inbound.value.some((d) => d.items.some((i) => i.sku === code)) || outbound.value.some((d) => d.items.some((i) => i.sku === code))
    if (used) return fail(`SKU ${code} has stock or documents, so it cannot be deleted. Set it inactive instead.`)
    skus.value = skus.value.filter((s) => s.sku !== code)
    return ok(`SKU ${code} deleted.`)
  }
  function saveCategory(data: Category, originalId?: string): Result {
    const id = data.id.trim().toUpperCase()
    if (!id || !data.name.trim() || !data.prefix.trim()) return fail('Category code, name and SKU prefix are required.')
    if (!zone(data.zone)) return fail('Choose a target zone.')
    if (originalId) {
      const c = category(originalId)
      if (!c) return fail('Category not found.')
      Object.assign(c, { name: data.name.trim(), prefix: data.prefix.trim().toUpperCase(), zone: data.zone })
      return ok(`Category ${c.id} updated.`)
    }
    if (category(id)) return fail(`Category ${id} already exists.`)
    categories.value.push({ id, name: data.name.trim(), prefix: data.prefix.trim().toUpperCase(), zone: data.zone })
    return ok(`Category ${id} added.`)
  }
  function deleteCategory(id: string): Result {
    if (skus.value.some((s) => s.category === id)) return fail(`Category ${id} is still used by SKUs.`)
    categories.value = categories.value.filter((c) => c.id !== id)
    return ok(`Category ${id} deleted.`)
  }
  function saveContact(data: Omit<Contact, 'id'>, originalId?: string): Result<string> {
    const name = data.name.trim()
    if (!name) return fail('Name is required.')
    const term = data.type === 'CUSTOMER' ? data.term ?? 'BELI PUTUS' : undefined
    if (contacts.value.some((c) => c.id !== originalId && c.type === data.type && c.name.toLowerCase() === name.toLowerCase())) return fail(`${name} already exists.`)
    if (originalId) {
      const c = contacts.value.find((x) => x.id === originalId)
      if (!c) return fail('Contact not found.')
      const old = c.name
      Object.assign(c, { name, type: data.type, term })
      // keep document references in sync with the renamed contact
      if (old !== name) {
        inbound.value.forEach((d) => { if (d.supplier === old) d.supplier = name })
        outbound.value.forEach((d) => { if (d.customer === old) d.customer = name })
      }
      return ok(`${name} updated.`, c.id)
    }
    const id = `C${Date.now().toString(36)}`
    contacts.value.push({ id, name, type: data.type, term })
    return ok(`${name} added.`, id)
  }
  function deleteContact(id: string): Result {
    const c = contacts.value.find((x) => x.id === id)
    if (!c) return fail('Contact not found.')
    const used = c.type === 'SUPPLIER' ? inbound.value.some((d) => d.supplier === c.name) : outbound.value.some((d) => d.customer === c.name)
    if (used) return fail(`${c.name} is used by documents, so it cannot be deleted.`)
    contacts.value = contacts.value.filter((x) => x.id !== id)
    return ok(`${c.name} deleted.`)
  }

  // ---------- inbound & putaway
  function nextDocNo(prefix: string, existing: string[]): string {
    const pre = `${prefix}-${todayISO().replace(/-/g, '')}-`
    const used = new Set(existing)
    let k = 1
    let no = ''
    do { no = pre + String(k++).padStart(3, '0') } while (used.has(no))
    return no
  }
  function createInbound(p: { no: string; poRef: string; supplier: string; items: { sku: string; qty: number; batch: string; exp: string }[] }): Result<Inbound> {
    const no = p.no.trim().toUpperCase()
    if (!no) return fail('Delivery note number is required.')
    if (inbound.value.some((d) => d.no === no)) return fail(`Delivery note ${no} already exists.`)
    if (!p.supplier) return fail('Choose a supplier.')
    if (!p.items.length) return fail('Add at least one item.')
    const seen = new Set<string>()
    for (const it of p.items) {
      const s = sku(it.sku)
      if (!s) return fail('Every line needs a product.')
      if (s.inactive) return fail(`SKU ${s.sku} is inactive.`)
      if (!(it.qty > 0)) return fail(`Qty for ${s.sku} must be greater than 0.`)
      if (s.hasBatch && !it.batch.trim()) return fail(`Batch is required for ${s.sku}.`)
      if (s.hasExpiry && !it.exp) return fail(`Expiry date is required for ${s.sku}.`)
      if (s.hasExpiry && expiryStatus(it.exp) === 'EXPIRED') return fail(`${s.sku}: expiry date has already passed – goods cannot be received.`)
      const key = `${it.sku}|${normLot(it.batch)}|${normLot(it.exp)}`
      if (seen.has(key)) return fail(`${s.sku} batch ${normLot(it.batch)} appears twice – merge the lines.`)
      seen.add(key)
    }
    const id = inbound.value.length ? Math.max(...inbound.value.map((d) => d.id)) + 1 : 1
    const doc: Inbound = {
      id, no, poRef: p.poRef.trim().toUpperCase(), date: todayISO(), supplier: p.supplier, createdBy: who(), logs: [],
      items: p.items.map((it) => {
        const s = sku(it.sku)!
        return { sku: it.sku, qty: it.qty, batch: s.hasBatch ? it.batch.trim() : '-', exp: s.hasExpiry ? it.exp : '-', putaways: [] }
      }),
    }
    log(doc, 'Created – goods received in Transit', `${doc.items.length} SKU`)
    inbound.value.push(doc)
    doc.items.forEach((it) => logMove('INBOUND RECEIVING', it.sku, it.batch, it.exp, it.qty, null, TRANSIT_BIN, no, `Supplier: ${p.supplier}`))
    syncTransit()
    return ok(`Inbound ${no} created – goods are in Transit (${TRANSIT_BIN}).`, doc)
  }
  function deleteInbound(id: number): Result {
    const doc = inbound.value.find((d) => d.id === id)
    if (!doc) return fail('Inbound not found.')
    if (doc.items.some((it) => itemPutawayDone(it) > 0)) return fail(`Inbound ${doc.no} is (partly) put away and cannot be deleted.`)
    doc.items.forEach((it) => logMove('INBOUND CANCELLED', it.sku, it.batch, it.exp, -it.qty, TRANSIT_BIN, null, doc.no, 'Inbound document deleted'))
    inbound.value = inbound.value.filter((d) => d.id !== id)
    syncTransit()
    return ok(`Inbound ${doc.no} deleted.`)
  }
  /**
   * Edit an inbound document. The header (delivery note, PO ref, supplier, date) is always editable.
   * Lines map to existing items through `origIdx`; a line that is (partly) put away keeps its SKU/batch/expiry,
   * cannot be removed and its qty cannot drop below what is already put away. Qty differences are
   * re-posted to the transit bin in the ledger (RECEIVING for more, CANCELLED for less).
   * Inbound documents created by a bin → transit transfer cannot be edited.
   */
  function updateInbound(id: number, p: { no: string; poRef: string; supplier: string; date: string; items: { sku: string; qty: number; batch: string; exp: string; origIdx?: number | null }[] }): Result<Inbound> {
    const doc = inbound.value.find((d) => d.id === id)
    if (!doc) return fail('Inbound not found.')
    if (doc.source === 'TRANSFER') return fail(`Inbound ${doc.no} comes from a bin → transit transfer and cannot be edited. Put it away instead.`)
    const no = p.no.trim().toUpperCase()
    if (!no) return fail('Delivery note number is required.')
    if (no !== doc.no && (inbound.value.some((d) => d.id !== id && d.no === no) || transfers.value.some((t) => t.no === no))) return fail(`Delivery note ${no} already exists.`)
    if (!p.supplier) return fail('Choose a supplier.')
    if (!p.date) return fail('Date is required.')
    if (!p.items.length) return fail('Add at least one item.')

    const lk = (s: string, batch: string, exp: string) => `${s}|${normLot(batch)}|${normLot(exp)}`
    const used = new Set<number>()
    const seen = new Set<string>()
    const next: InboundItem[] = []
    for (const it of p.items) {
      const old = it.origIdx !== undefined && it.origIdx !== null ? doc.items[it.origIdx] : undefined
      if (old) {
        if (used.has(it.origIdx!)) return fail('A line was submitted twice.')
        used.add(it.origIdx!)
      }
      const done = old ? itemPutawayDone(old) : 0
      if (old && done > 0) {
        // locked line: only qty may change, and not below what is already on the shelves
        if (it.sku !== old.sku) return fail(`${old.sku} is already put away – its product cannot change.`)
        if (!(it.qty >= done)) return fail(`${old.sku} batch ${normLot(old.batch)}: qty cannot be lower than the ${done} already put away.`)
        const key = lk(old.sku, old.batch, old.exp)
        if (seen.has(key)) return fail(`${old.sku} batch ${normLot(old.batch)} appears twice – merge the lines.`)
        seen.add(key)
        next.push({ ...old, qty: it.qty, putaways: old.putaways })
        continue
      }
      const s = sku(it.sku)
      if (!s) return fail('Every line needs a product.')
      const sameAsOld = old && old.sku === it.sku
      if (s.inactive && !sameAsOld) return fail(`SKU ${s.sku} is inactive.`)
      if (!(it.qty > 0)) return fail(`Qty for ${s.sku} must be greater than 0.`)
      if (s.hasBatch && !it.batch.trim()) return fail(`Batch is required for ${s.sku}.`)
      if (s.hasExpiry && !it.exp) return fail(`Expiry date is required for ${s.sku}.`)
      const batch = s.hasBatch ? it.batch.trim() : '-'
      const exp = s.hasExpiry ? it.exp : '-'
      const unchangedLot = old && old.sku === it.sku && normLot(old.batch) === normLot(batch) && normLot(old.exp) === normLot(exp)
      if (s.hasExpiry && !unchangedLot && expiryStatus(exp) === 'EXPIRED') return fail(`${s.sku}: expiry date has already passed – goods cannot be received.`)
      const key = lk(it.sku, batch, exp)
      if (seen.has(key)) return fail(`${s.sku} batch ${normLot(batch)} appears twice – merge the lines.`)
      seen.add(key)
      next.push({ sku: it.sku, qty: it.qty, batch, exp, putaways: [] })
    }
    const removedLocked = doc.items.filter((o, i) => !used.has(i) && itemPutawayDone(o) > 0)
    if (removedLocked.length) return fail(`${removedLocked.map((o) => o.sku).join(', ')} already put away – the line cannot be removed.`)

    // change summary for the document log
    const changes: string[] = []
    const oldNo = doc.no
    if (no !== doc.no) changes.push(`delivery note ${doc.no} → ${no}`)
    if (p.poRef.trim().toUpperCase() !== doc.poRef) changes.push(`PO ref ${doc.poRef || '-'} → ${p.poRef.trim().toUpperCase() || '-'}`)
    if (p.supplier !== doc.supplier) changes.push(`supplier ${doc.supplier} → ${p.supplier}`)
    if (p.date !== doc.date) changes.push(`date ${doc.date} → ${p.date}`)
    const before: Record<string, number> = {}
    const after: Record<string, number> = {}
    doc.items.forEach((o) => { const k = lk(o.sku, o.batch, o.exp); before[k] = (before[k] || 0) + o.qty })
    next.forEach((n) => { const k = lk(n.sku, n.batch, n.exp); after[k] = (after[k] || 0) + n.qty })
    const diffs: { key: string; d: number }[] = []
    new Set([...Object.keys(before), ...Object.keys(after)]).forEach((k) => {
      const d = (after[k] || 0) - (before[k] || 0)
      if (d) diffs.push({ key: k, d })
    })
    diffs.forEach(({ key, d }) => {
      const [s, b] = key.split('|')
      changes.push(`${s} ${b !== '-' ? `batch ${b} ` : ''}${d > 0 ? '+' : ''}${d}`)
    })
    if (!changes.length) return ok('Nothing changed.', doc)

    // a renamed delivery note keeps its ledger history linked
    if (no !== oldNo) ledger.value.forEach((e) => { if (e.ref === oldNo) e.ref = no })
    doc.no = no
    doc.poRef = p.poRef.trim().toUpperCase()
    doc.supplier = p.supplier
    doc.date = p.date
    doc.items = next
    diffs.forEach(({ key, d }) => {
      const [s, b, e] = key.split('|')
      if (d > 0) logMove('INBOUND RECEIVING', s, b, e, d, null, TRANSIT_BIN, no, `Inbound corrected – supplier: ${doc.supplier}`)
      else logMove('INBOUND CANCELLED', s, b, e, d, TRANSIT_BIN, null, no, 'Inbound corrected – qty/item removed')
    })
    const status = inboundStatus(doc)
    if (status === 'PUTAWAY COMPLETE' && !doc.completedAt) {
      doc.completedAt = new Date().toISOString()
      log(doc, 'Completed (all put away)')
    } else if (status !== 'PUTAWAY COMPLETE' && doc.completedAt) {
      doc.completedAt = undefined
    }
    log(doc, 'Edited', changes.join('; '))
    syncTransit()
    return ok(`Inbound ${no} updated.`, doc)
  }
  /** Best fit: bins in the category's zone with enough room, preferring bins that already hold this SKU, then the tightest fit. */
  function putawayCandidates(it: InboundItem, need = itemPutawayRemaining(it)) {
    const s = sku(it.sku)
    const targetZone = category(s?.category ?? '')?.zone ?? 'Zone A'
    const candidates = storageBins.value
      .filter((b) => b.zone === targetZone && !isFrozen(b.bin))
      .map((b) => ({ bin: b.bin, zone: b.zone, availCap: binAvailCap(b), sameSku: b.lots.some((l) => l.sku === it.sku && l.qty > 0) }))
      .filter((b) => b.availCap >= need)
      .sort((a, b) => Number(b.sameSku) - Number(a.sameSku) || a.availCap - b.availCap)
    return { targetZone, candidates, best: candidates[0] ?? null }
  }
  /** Auto plan: one best-fit bin, or split across bins (target zone first) when nothing fits it all. */
  function buildPutawayPlan(it: InboundItem): { bin: string; qty: number }[] {
    let need = itemPutawayRemaining(it)
    if (need <= 0) return []
    const rec = putawayCandidates(it, need)
    if (rec.best) return [{ bin: rec.best.bin, qty: need }]
    const pool = storageBins.value
      .filter((b) => !isFrozen(b.bin) && binAvailCap(b) > 0)
      .map((b) => ({ bin: b.bin, cap: binAvailCap(b), inZone: b.zone === rec.targetZone ? 0 : 1, same: b.lots.some((l) => l.sku === it.sku) ? 0 : 1 }))
      .sort((a, b) => a.inZone - b.inZone || a.same - b.same || b.cap - a.cap)
    const plan: { bin: string; qty: number }[] = []
    for (const c of pool) {
      if (need <= 0) break
      const take = Math.min(need, c.cap)
      plan.push({ bin: c.bin, qty: take })
      need -= take
    }
    return plan
  }
  function validatePutaway(it: InboundItem, plan: { bin: string; qty: number }[]): Result {
    const rem = itemPutawayRemaining(it)
    const total = plan.reduce((a, r) => a + r.qty, 0)
    if (!plan.length) return fail('Choose at least one destination bin.')
    if (plan.some((r) => !(r.qty > 0))) return fail('Every destination needs a qty above 0.')
    if (total > rem) return fail(`Planned ${total} is more than the ${rem} still in transit.`)
    const perBin: Record<string, number> = {}
    plan.forEach((r) => { perBin[r.bin] = (perBin[r.bin] || 0) + r.qty })
    for (const [code, q] of Object.entries(perBin)) {
      const b = bin(code)
      if (!b) return fail(`Bin ${code} not found.`)
      if (isFrozen(code)) return fail(`Bin ${code} is frozen by cycle count ${frozenBy(code)}.`)
      if (binAvailCap(b) < q) return fail(`Bin ${code} only has room for ${binAvailCap(b)} (planned ${q}).`)
    }
    return ok()
  }
  function executePutaway(inboundId: number, idx: number, plan: { bin: string; qty: number }[]): Result {
    const doc = inbound.value.find((d) => d.id === inboundId)
    const it = doc?.items[idx]
    if (!doc || !it) return fail('Item not found.')
    const v = validatePutaway(it, plan)
    if (!v.ok) return v
    const at = new Date().toISOString()
    plan.forEach((r) => {
      addLot(bin(r.bin)!, it.sku, it.batch, it.exp, r.qty)
      logMove('INBOUND PUTAWAY', it.sku, it.batch, it.exp, r.qty, TRANSIT_BIN, r.bin, doc.no, `Supplier: ${doc.supplier}`)
      const same = it.putaways.find((p) => p.bin === r.bin)
      if (same) same.qty += r.qty
      else it.putaways.push({ bin: r.bin, qty: r.qty, at, by: who() })
    })
    const qty = plan.reduce((a, r) => a + r.qty, 0)
    log(doc, 'Putaway', `${it.sku} ${qty} ${skuUnit(it.sku)} → ${plan.map((r) => `${r.bin} (${r.qty})`).join(', ')}`)
    if (inboundStatus(doc) === 'PUTAWAY COMPLETE' && !doc.completedAt) {
      doc.completedAt = at
      log(doc, 'Completed (all put away)')
    }
    syncTransit()
    const filled = retryPendingAllocations()
    const left = itemPutawayRemaining(it)
    return ok(`${it.sku}: ${qty} put away${left ? `, ${left} still in transit` : ''}.${filled ? ` ${filled} waiting outbound line(s) got stock.` : ''}`)
  }

  // ---------- outbound, FEFO allocation, picking, dispatch
  /** Lots of the SKU on shelves, earliest expiry first, with what is still free to allocate. */
  function fefoCandidates(it: OutboundItem) {
    const s = sku(it.sku)
    const cands = stockLots((l) => l.sku === it.sku && l.zone !== TRANSIT_ZONE && !isFrozen(l.bin))
      .map((l) => ({ ...l, key: lotKey(l.bin, l.batch, l.exp), availQty: Math.max(0, l.qty - reservedOnLot(l.bin, l.batch, l.exp, it)), expStatus: expiryStatus(l.exp, s?.hasExpiry ?? false) }))
      .sort((a, b) => (a.exp === '-' ? Infinity : new Date(a.exp).getTime()) - (b.exp === '-' ? Infinity : new Date(b.exp).getTime()))
    return { cands, totalAvail: cands.reduce((a, c) => a + c.availQty, 0) }
  }
  function buildFefoPlan(it: OutboundItem): Alloc[] {
    let remaining = itemOutstanding(it)
    const plan: Alloc[] = []
    for (const c of fefoCandidates(it).cands) {
      if (remaining <= 0) break
      if (c.availQty <= 0) continue
      const take = Math.min(remaining, c.availQty)
      plan.push({ bin: c.bin, batch: c.batch, exp: c.exp, qty: take })
      remaining -= take
    }
    return plan
  }
  /** Book stock for every pending line; lines without enough stock wait (stay PENDING). */
  function autoAllocate(doc: Outbound) {
    const res = { full: 0, short: [] as string[] }
    if (doc.dispatched) return res
    doc.items.forEach((it) => {
      if (it.status === 'ALLOCATED') { res.full++; return }
      if (it.status !== 'PENDING') return
      const need = itemOutstanding(it)
      if (need <= 0) return
      const plan = buildFefoPlan(it)
      const total = plan.reduce((a, p) => a + p.qty, 0)
      if (total >= need) {
        it.allocations = plan
        it.status = 'ALLOCATED'
        res.full++
      } else {
        it.allocations = []
        res.short.push(`${it.sku} (${total}/${need})`)
      }
    })
    return res
  }
  function retryPendingAllocations(): number {
    let n = 0
    outbound.value.forEach((doc) => {
      if (doc.dispatched) return
      const before = doc.items.filter((i) => i.status === 'ALLOCATED').length
      autoAllocate(doc)
      n += doc.items.filter((i) => i.status === 'ALLOCATED').length - before
    })
    return n
  }
  function createOutbound(p: { no: string; poCust: string; customer: string; note: string; items: { sku: string; qty: number }[] }): Result<Outbound> {
    const no = (p.no.trim() || nextDocNo('DO', outbound.value.map((d) => d.no))).toUpperCase()
    if (outbound.value.some((d) => d.no === no)) return fail(`DO ${no} already exists.`)
    if (!p.poCust.trim()) return fail('Customer PO number is required.')
    const c = contacts.value.find((x) => x.type === 'CUSTOMER' && x.name === p.customer)
    if (!c) return fail('Choose a customer.')
    if (!p.items.length) return fail('Add at least one item.')
    const seen = new Set<string>()
    for (const it of p.items) {
      const s = sku(it.sku)
      if (!s) return fail('Every line needs a product.')
      if (s.inactive) return fail(`SKU ${s.sku} is inactive.`)
      if (!(it.qty > 0)) return fail(`Qty for ${s.sku} must be greater than 0.`)
      if (seen.has(it.sku)) return fail(`${s.sku} appears twice – merge the lines.`)
      seen.add(it.sku)
    }
    const id = outbound.value.length ? Math.max(...outbound.value.map((d) => d.id)) + 1 : 1
    const doc: Outbound = {
      id, no, poCust: p.poCust.trim().toUpperCase(), date: todayISO(), customer: c.name, term: c.term ?? 'BELI PUTUS', note: p.note.trim(),
      items: p.items.map((it) => ({ sku: it.sku, qty: it.qty, status: 'PENDING', allocations: [], pickedQty: 0, shippedQty: 0, shippedAllocs: [] })),
      dispatched: false, shipments: [], createdBy: who(), logs: [],
    }
    log(doc, 'Created')
    outbound.value.push(doc)
    const res = autoAllocate(doc)
    return ok(res.short.length ? `DO ${no} created. Waiting for stock: ${res.short.join(', ')}.` : `DO ${no} created – stock allocated (FEFO).`, doc)
  }
  function deleteOutbound(id: number): Result {
    const doc = outbound.value.find((d) => d.id === id)
    if (!doc) return fail('Outbound not found.')
    if (doc.dispatched || doc.shipments.length || doc.items.some((i) => i.status === 'PICKED')) return fail(`DO ${doc.no} already has picked/shipped goods and cannot be deleted.`)
    outbound.value = outbound.value.filter((d) => d.id !== id)
    retryPendingAllocations()
    return ok(`DO ${doc.no} deleted.`)
  }
  /**
   * Edit an outbound DO while it is not dispatched. Lines map to existing items through `origIdx`.
   * Lines that are picked or (partly) shipped keep their SKU, cannot be removed and their qty cannot drop
   * below shipped + picked. An allocated line whose SKU or qty changes is released and re-allocated (FEFO).
   */
  function updateOutbound(id: number, p: { poCust: string; customer: string; note: string; items: { sku: string; qty: number; origIdx?: number | null }[] }): Result<Outbound> {
    const doc = outbound.value.find((d) => d.id === id)
    if (!doc) return fail('Outbound not found.')
    if (doc.dispatched) return fail(`DO ${doc.no} is already dispatched/closed and cannot be edited.`)
    const poCust = p.poCust.trim().toUpperCase()
    if (!poCust) return fail('Customer PO number is required.')
    const c = contacts.value.find((x) => x.type === 'CUSTOMER' && x.name === p.customer)
    if (!c) return fail('Choose a customer.')
    if (!p.items.length) return fail('Add at least one item.')

    const used = new Set<number>()
    const seen = new Set<string>()
    const plan: { it: { sku: string; qty: number }; old?: OutboundItem }[] = []
    for (const it of p.items) {
      const old = it.origIdx !== undefined && it.origIdx !== null ? doc.items[it.origIdx] : undefined
      if (old) {
        if (used.has(it.origIdx!)) return fail('A line was submitted twice.')
        used.add(it.origIdx!)
      }
      const s = sku(it.sku)
      if (!s) return fail('Every line needs a product.')
      if (s.inactive && !(old && old.sku === it.sku)) return fail(`SKU ${s.sku} is inactive.`)
      if (!(it.qty > 0)) return fail(`Qty for ${s.sku} must be greater than 0.`)
      if (old && (old.status === 'PICKED' || old.shippedQty > 0)) {
        if (it.sku !== old.sku) return fail(`${old.sku} is already picked/shipped – its product cannot change.`)
        const min = old.shippedQty + (old.status === 'PICKED' ? old.pickedQty : 0)
        if (it.qty < min) return fail(`${old.sku}: qty cannot be lower than the ${min} already picked/shipped.`)
      }
      if (seen.has(it.sku)) return fail(`${s.sku} appears twice – merge the lines.`)
      seen.add(it.sku)
      plan.push({ it, old })
    }
    const removedLocked = doc.items.filter((o, i) => !used.has(i) && (o.status === 'PICKED' || o.shippedQty > 0))
    if (removedLocked.length) return fail(`${removedLocked.map((o) => o.sku).join(', ')} already picked/shipped – the line cannot be removed.`)

    const changes: string[] = []
    if (poCust !== doc.poCust) changes.push(`customer PO ${doc.poCust} → ${poCust}`)
    if (c.name !== doc.customer) changes.push(`customer ${doc.customer} → ${c.name}`)
    if (p.note.trim() !== doc.note) changes.push('note changed')
    doc.items.forEach((o, i) => { if (!used.has(i)) changes.push(`${o.sku} removed${o.status === 'ALLOCATED' ? ' (allocation released)' : ''}`) })

    const next: OutboundItem[] = plan.map(({ it, old }) => {
      if (!old) {
        changes.push(`${it.sku} added (${it.qty})`)
        return { sku: it.sku, qty: it.qty, status: 'PENDING', allocations: [], pickedQty: 0, shippedQty: 0, shippedAllocs: [] }
      }
      if (old.sku === it.sku && old.qty === it.qty) return old
      if (old.sku !== it.sku) changes.push(`${old.sku} → ${it.sku} (${it.qty})`)
      else changes.push(`${it.sku} qty ${old.qty} → ${it.qty}`)
      const n: OutboundItem = { ...old, sku: it.sku, qty: it.qty, allocations: [...old.allocations], shippedAllocs: [...old.shippedAllocs] }
      if (n.status === 'ALLOCATED') {
        // allocation no longer matches the line: release, auto allocation below books it again (FEFO)
        n.status = 'PENDING'
        n.allocations = []
        changes.push(`${it.sku} allocation released`)
      } else if (n.status === 'SHIPPED' && n.qty > n.shippedQty) {
        n.status = 'PENDING'
        n.allocations = []
      } else if (n.status === 'PENDING' && n.shippedQty > 0 && n.qty <= n.shippedQty) {
        n.status = 'SHIPPED'
        n.allocations = n.shippedAllocs
      }
      return n
    })
    if (!changes.length) return ok('Nothing changed.', doc)

    doc.poCust = poCust
    if (c.name !== doc.customer) doc.term = c.term ?? 'BELI PUTUS'
    doc.customer = c.name
    doc.note = p.note.trim()
    doc.items = next
    log(doc, 'Edited', changes.join('; '))

    // nothing left to ship or pick after the edit → the DO is complete
    if (doc.shipments.length && doc.items.every((i) => itemOutstanding(i) <= 0 && i.status !== 'PICKED' && i.status !== 'ALLOCATED')) {
      doc.items.forEach((i) => { i.status = 'SHIPPED'; i.allocations = i.shippedAllocs })
      doc.dispatched = true
      log(doc, 'Dispatched', 'Fully shipped after edit')
      retryPendingAllocations()
      return ok(`DO ${doc.no} updated – everything is shipped, the DO is complete.`, doc)
    }
    const res = autoAllocate(doc)
    retryPendingAllocations() // released stock may serve other waiting orders
    return ok(res.short.length ? `DO ${doc.no} updated. Waiting for stock: ${res.short.join(', ')}.` : `DO ${doc.no} updated – stock allocated (FEFO).`, doc)
  }
  function validateAllocation(it: OutboundItem, plan: Alloc[]): Result {
    const { cands, totalAvail } = fefoCandidates(it)
    const max = Math.min(itemOutstanding(it), totalAvail)
    const per: Record<string, number> = {}
    let total = 0
    for (const a of plan) {
      const k = lotKey(a.bin, a.batch, a.exp)
      const c = cands.find((x) => x.key === k)
      if (!c) return fail(`Bin ${a.bin} batch ${a.batch} does not hold ${it.sku}.`)
      per[k] = (per[k] || 0) + a.qty
      if (per[k] > c.availQty) return fail(`Only ${c.availQty} free in ${a.bin} batch ${a.batch}.`)
      total += a.qty
    }
    if (total <= 0) return fail('Nothing allocated yet.')
    if (total > max) return fail(`Allocated ${total} is more than the maximum ${max}.`)
    return ok()
  }
  function allocateItem(docId: number, idx: number, plan: Alloc[]): Result {
    const doc = outbound.value.find((d) => d.id === docId)
    const it = doc?.items[idx]
    if (!doc || !it || doc.dispatched || it.status !== 'PENDING') return fail('This line cannot be allocated.')
    const clean = plan.filter((a) => a.qty > 0)
    const v = validateAllocation(it, clean)
    if (!v.ok) return v
    it.allocations = clean.map((a) => ({ ...a, batch: normLot(a.batch), exp: normLot(a.exp) }))
    it.status = 'ALLOCATED'
    log(doc, 'Allocated', `${it.sku} ${clean.reduce((a, x) => a + x.qty, 0)}`)
    return ok(`${it.sku}: stock allocated.`)
  }
  function unallocateItem(docId: number, idx: number): Result {
    const doc = outbound.value.find((d) => d.id === docId)
    const it = doc?.items[idx]
    if (!doc || !it || it.status !== 'ALLOCATED') return fail('Line is not allocated.')
    it.status = 'PENDING'
    it.allocations = []
    log(doc, 'Allocation released', it.sku)
    return ok(`${it.sku}: allocation released.`)
  }
  function executePick(docId: number, idx: number): Result {
    const doc = outbound.value.find((d) => d.id === docId)
    const it = doc?.items[idx]
    if (!doc || !it || doc.dispatched) return fail('Line not found.')
    if (it.status !== 'ALLOCATED') return fail('Allocate stock before picking.')
    for (const a of it.allocations) {
      if (isFrozen(a.bin)) return fail(`Bin ${a.bin} is frozen by cycle count ${frozenBy(a.bin)}.`)
      const lot = bin(a.bin) ? findLot(bin(a.bin)!, it.sku, a.batch, a.exp) : undefined
      if (!lot || lot.qty < a.qty) return fail(`Only ${lot?.qty ?? 0} of ${it.sku} batch ${a.batch} left in ${a.bin}. Release and re-allocate.`)
    }
    let picked = 0
    it.allocations.forEach((a) => {
      const taken = removeLot(bin(a.bin)!, it.sku, a.batch, a.exp, a.qty)
      picked += taken
      if (taken) logMove('OUTBOUND PICK', it.sku, a.batch, a.exp, -taken, a.bin, null, doc.no, `Customer: ${doc.customer}`)
    })
    it.status = 'PICKED'
    it.pickedQty = picked
    log(doc, 'Picked', `${it.sku} ${picked}/${itemOutstanding(it)} ${skuUnit(it.sku)}`)
    return ok(`${it.sku}: ${picked} picked from ${it.allocations.length} location(s).`)
  }
  function dispatch(docId: number): Result {
    const doc = outbound.value.find((d) => d.id === docId)
    if (!doc) return fail('Outbound not found.')
    if (!outboundReady(doc)) return fail(doc.items.some((i) => i.status === 'ALLOCATED') ? 'Some allocated lines are not picked yet – pick or release them first.' : 'Nothing picked to ship yet.')
    const shipNo = doc.shipments.length + 1
    const lines: Shipment['lines'] = []
    doc.items.filter((i) => i.status === 'PICKED' && i.pickedQty > 0).forEach((it) => {
      it.allocations.filter((a) => a.qty > 0).forEach((a) => {
        lines.push({ sku: it.sku, ...a })
        logMove('DISPATCH', it.sku, a.batch, a.exp, 0, a.bin, null, doc.no, `Shipment #${shipNo} to ${doc.customer} (${a.qty})`)
      })
      it.shippedQty += it.pickedQty
      it.shippedAllocs = [...it.shippedAllocs, ...it.allocations.filter((a) => a.qty > 0)]
      it.pickedQty = 0
      if (it.shippedQty >= it.qty) {
        it.status = 'SHIPPED'
        it.allocations = it.shippedAllocs
      } else {
        it.status = 'PENDING'
        it.allocations = []
      }
    })
    doc.shipments.push({ no: shipNo, ts: new Date().toISOString(), by: who(), lines })
    const outstanding = doc.items.reduce((a, i) => a + itemOutstanding(i), 0)
    if (outstanding <= 0) {
      doc.dispatched = true
      log(doc, 'Dispatched', `Shipment #${shipNo} – fully shipped`)
      return ok(`DO ${doc.no} fully shipped.`)
    }
    log(doc, 'Partially dispatched', `Shipment #${shipNo} – ${outstanding} outstanding`)
    autoAllocate(doc)
    return ok(`Shipment #${shipNo} of ${doc.no} sent. ${outstanding} outstanding (close the DO if it won't be fulfilled).`)
  }
  function closeOutbound(docId: number): Result {
    const doc = outbound.value.find((d) => d.id === docId)
    if (!doc || doc.dispatched) return fail('Outbound cannot be closed.')
    if (doc.items.some((i) => i.status === 'PICKED' && i.pickedQty > 0)) return fail('Dispatch the picked goods before closing.')
    doc.items.forEach((it) => {
      if (it.status === 'ALLOCATED' || it.status === 'PENDING') {
        it.status = it.shippedQty > 0 ? 'SHIPPED' : 'PENDING'
        it.allocations = it.shippedAllocs
      }
    })
    doc.dispatched = true
    doc.closedShort = true
    const prog = outboundProgress(doc)
    log(doc, 'Closed short', `Shipped ${prog.shippedQty}/${prog.totalQty}`)
    retryPendingAllocations()
    return ok(`DO ${doc.no} closed. ${prog.outstanding} will not be fulfilled.`)
  }

  // ---------- transfers
  function validateTransfer(p: { srcBin: string; tgtBin: string; sku: string; batch: string; exp: string; qty: number }): Result {
    const src = bin(p.srcBin)
    const tgt = bin(p.tgtBin)
    if (!src || !tgt) return fail('Choose the source and destination bins.')
    if (p.srcBin === p.tgtBin) return fail('Source and destination must differ.')
    if (src.zone === TRANSIT_ZONE) return fail('Transit stock moves through putaway, not transfers.')
    if (isFrozen(p.srcBin)) return fail(`Bin ${p.srcBin} is frozen by cycle count ${frozenBy(p.srcBin)}.`)
    const toTransit = tgt.zone === TRANSIT_ZONE
    if (!toTransit && isFrozen(p.tgtBin)) return fail(`Bin ${p.tgtBin} is frozen by cycle count ${frozenBy(p.tgtBin)}.`)
    const s = sku(p.sku)
    if (!s) return fail('Choose the SKU / batch to move.')
    if (s.inactive) return fail(`SKU ${s.sku} is inactive.`)
    const lot = findLot(src, p.sku, p.batch, p.exp)
    if (!lot) return fail('That batch is not in the source bin.')
    const movable = lot.qty - reservedOnLot(p.srcBin, p.batch, p.exp)
    if (!(p.qty > 0)) return fail('Qty must be greater than 0.')
    if (p.qty > movable) return fail(`Only ${movable} can move (the rest is allocated to outbound).`)
    if (!toTransit && p.qty > binAvailCap(tgt)) return fail(`Bin ${p.tgtBin} only has room for ${binAvailCap(tgt)}.`)
    return ok()
  }
  function movableQty(binCode: string, s: string, batch: string, exp: string) {
    const b = bin(binCode)
    const lot = b ? findLot(b, s, batch, exp) : undefined
    return lot ? Math.max(0, lot.qty - reservedOnLot(binCode, batch, exp)) : 0
  }
  function executeTransfer(p: { srcBin: string; tgtBin: string; sku: string; batch: string; exp: string; qty: number }): Result<Transfer> {
    const v = validateTransfer(p)
    if (!v.ok) return fail(v.msg)
    const src = bin(p.srcBin)!
    const tgt = bin(p.tgtBin)!
    const toTransit = tgt.zone === TRANSIT_ZONE
    const no = nextDocNo('TRF', [...transfers.value.map((t) => t.no), ...inbound.value.map((d) => d.no)])
    const doc: Transfer = { no, date: todayISO(), srcBin: p.srcBin, tgtBin: p.tgtBin, sku: p.sku, batch: normLot(p.batch), exp: normLot(p.exp), qty: p.qty, toTransit, createdBy: who(), createdAt: new Date().toISOString(), logs: [] }
    removeLot(src, p.sku, p.batch, p.exp, p.qty)
    if (toTransit) {
      // Back to transit = a new inbound document that waits for putaway again.
      const id = inbound.value.length ? Math.max(...inbound.value.map((d) => d.id)) + 1 : 1
      const inb: Inbound = { id, no, poRef: '', date: todayISO(), supplier: `Transfer from ${p.srcBin}`, source: 'TRANSFER', items: [{ sku: p.sku, qty: p.qty, batch: normLot(p.batch), exp: normLot(p.exp), putaways: [] }], createdBy: who(), logs: [] }
      log(inb, 'Created from a bin → transit transfer', `${p.qty} ${skuUnit(p.sku)} ${p.sku} from ${p.srcBin}`)
      inbound.value.push(inb)
      doc.inboundNo = no
      logMove('TRANSFER', p.sku, p.batch, p.exp, 0, p.srcBin, TRANSIT_BIN, no, `Moved ${p.qty} to transit → inbound ${no}`)
      syncTransit()
      log(doc, 'Executed – goods in transit', `Inbound ${no} waits for putaway`)
    } else {
      addLot(tgt, p.sku, p.batch, p.exp, p.qty)
      logMove('TRANSFER', p.sku, p.batch, p.exp, 0, p.srcBin, p.tgtBin, no, `Moved ${p.qty}`)
      log(doc, 'Executed', `${p.qty} ${skuUnit(p.sku)} ${p.srcBin} → ${p.tgtBin}`)
    }
    transfers.value.unshift(doc)
    return ok(toTransit ? `Transfer ${no}: ${p.qty} ${p.sku} moved to transit – inbound ${no} created for putaway.` : `Transfer ${no}: ${p.qty} ${p.sku} moved ${p.srcBin} → ${p.tgtBin}.`, doc)
  }
  function transferStatus(t: Transfer): 'DONE' | 'WAITING PUTAWAY' | 'PUTAWAY DONE' {
    if (!t.toTransit) return 'DONE'
    const inb = inbound.value.find((d) => d.no === t.inboundNo)
    if (!inb) return 'DONE'
    return inboundStatus(inb) === 'PUTAWAY COMPLETE' ? 'PUTAWAY DONE' : 'WAITING PUTAWAY'
  }

  // ---------- stock adjustments
  function validateAdjustment(lines: AdjustmentLine[]): Result {
    if (!lines.length) return fail('Add at least one line.')
    const seen = new Set<string>()
    const plusPerBin: Record<string, number> = {}
    for (const l of lines) {
      const s = sku(l.sku)
      if (!s) return fail('Every line needs a SKU.')
      if (s.inactive) return fail(`SKU ${s.sku} is inactive.`)
      const b = bin(l.bin)
      if (!b) return fail(`${l.sku}: choose a bin.`)
      if (b.zone === TRANSIT_ZONE) return fail('Transit cannot be adjusted.')
      if (isFrozen(b.bin)) return fail(`Bin ${b.bin} is frozen by cycle count ${frozenBy(b.bin)}.`)
      if (!l.qty) return fail(`${l.sku} in ${l.bin}: qty cannot be 0.`)
      if (s.hasBatch && normLot(l.batch) === '-') return fail(`${l.sku}: batch is required.`)
      if (s.hasExpiry && normLot(l.exp) === '-') return fail(`${l.sku}: expiry date is required.`)
      const k = `${l.sku}|${l.bin}|${normLot(l.batch)}|${normLot(l.exp)}`
      if (seen.has(k)) return fail(`${l.sku} ${l.bin} batch ${l.batch} appears twice.`)
      seen.add(k)
      if (l.qty < 0) {
        const free = movableQty(l.bin, l.sku, l.batch, l.exp)
        if (-l.qty > free) return fail(`${l.sku} in ${l.bin} batch ${l.batch}: at most ${free} can be removed (the rest is allocated).`)
      } else plusPerBin[l.bin] = (plusPerBin[l.bin] || 0) + l.qty
    }
    for (const [code, q] of Object.entries(plusPerBin)) if (binAvailCap(bin(code)!) < q) return fail(`Bin ${code} only has room for ${binAvailCap(bin(code)!)}.`)
    return ok()
  }
  function createAdjustment(p: { reason: string; note: string; date: string; lines: AdjustmentLine[] }): Result<Adjustment> {
    if (!p.reason) return fail('Choose a reason.')
    const lines = p.lines.map((l) => ({ ...l, batch: normLot(l.batch), exp: normLot(l.exp) }))
    const v = validateAdjustment(lines)
    if (!v.ok) return fail(v.msg)
    const no = nextDocNo('ADJ', adjustments.value.map((a) => a.no))
    const doc: Adjustment = { no, date: p.date || todayISO(), reason: p.reason, note: p.note.trim(), lines, createdBy: who(), createdAt: new Date().toISOString(), logs: [] }
    lines.forEach((l) => {
      const b = bin(l.bin)!
      if (l.qty > 0) addLot(b, l.sku, l.batch, l.exp, l.qty)
      else removeLot(b, l.sku, l.batch, l.exp, -l.qty)
      logMove('STOCK ADJUSTMENT', l.sku, l.batch, l.exp, l.qty, l.qty < 0 ? l.bin : null, l.qty > 0 ? l.bin : null, no, `${p.reason}${doc.note ? ' • ' + doc.note : ''}`)
    })
    log(doc, 'Created & applied', `${lines.length} line(s)`)
    adjustments.value.unshift(doc)
    if (lines.some((l) => l.qty > 0)) retryPendingAllocations()
    return ok(`Adjustment ${no} applied (${lines.length} line(s)).`, doc)
  }

  // ---------- cycle count
  function lastCycleCount(binCode: string, excludeId?: number) {
    let best: { date: string; code: string } | null = null
    cycleCounts.value.forEach((c) => {
      if (c.status !== 'DONE' || c.id === excludeId || !c.lines.some((l) => l.bin === binCode)) return
      const t = (c.finishedAt || c.date).slice(0, 10)
      if (!best || t > best.date) best = { date: t, code: c.code }
    })
    return best as { date: string; code: string } | null
  }
  function cycleCountScope(scope: { zones: string[]; racks: string[]; bins: string[] }) {
    return storageBins.value.filter((b) =>
      (!scope.zones.length || scope.zones.includes(b.zone)) &&
      (!scope.racks.length || scope.racks.includes(`${b.zone}|${b.rack}`)) &&
      (!scope.bins.length || scope.bins.includes(b.bin)))
  }
  function startCycleCount(scope: { zones: string[]; racks: string[]; bins: string[]; date: string }): Result<CycleCount> {
    const all = cycleCountScope(scope)
    const skipped = all.filter((b) => isFrozen(b.bin))
    const list = all.filter((b) => !isFrozen(b.bin))
    if (!list.length) return fail(skipped.length ? 'Every bin in scope is already being counted in another session.' : 'No bins in the selected scope.')
    const lines: CycleCountLine[] = []
    list.forEach((b) => {
      const lots = b.lots.filter((l) => l.qty > 0)
      if (!lots.length) lines.push({ bin: b.bin, zone: b.zone, rack: b.rack, sku: null, batch: '-', exp: '-', sysQty: 0, countQty: null, adjusted: false })
      else lots.forEach((l) => lines.push({ bin: b.bin, zone: b.zone, rack: b.rack, sku: l.sku, batch: normLot(l.batch), exp: normLot(l.exp), sysQty: l.qty, countQty: null, adjusted: false }))
    })
    const id = cycleCounts.value.length ? Math.max(...cycleCounts.value.map((c) => c.id)) + 1 : 1
    const date = scope.date || todayISO()
    const code = `CC-${date.replace(/-/g, '')}-${String(cycleCounts.value.filter((c) => c.date === date).length + 1).padStart(3, '0')}`
    const cc: CycleCount = { id, code, date, zones: scope.zones, racks: scope.racks, bins: scope.bins, status: 'IN PROGRESS', lines, createdBy: who(), createdAt: new Date().toISOString(), finishedAt: null, logs: [] }
    log(cc, 'Started', `${list.length} bin(s), ${lines.length} line(s)`)
    cycleCounts.value.unshift(cc)
    return ok(`${code} started: ${list.length} bin(s) frozen until every line matches.${skipped.length ? ` ${skipped.length} bin(s) skipped (already in another count).` : ''}`, cc)
  }
  // Re-reads the status after a mutation (defeats TS narrowing from an earlier check).
  const ccDone = (cc: CycleCount) => cc.status === 'DONE'
  function refreshCycleCount(cc: CycleCount) {
    const p = ccProgress(cc)
    const done = p.total > 0 && p.matched === p.total
    cc.status = done ? 'DONE' : 'IN PROGRESS'
    cc.finishedAt = done ? cc.finishedAt ?? new Date().toISOString() : null
    if (done) log(cc, 'Completed – every line matches, bins released')
  }
  function setCount(ccId: number, i: number, value: number | null): Result {
    const cc = cycleCounts.value.find((c) => c.id === ccId)
    if (!cc || cc.status === 'DONE') return fail('Session not found or already done.')
    const ln = cc.lines[i]
    if (!ln) return fail('Line not found.')
    ln.countQty = value === null ? null : Math.max(0, Math.floor(value))
    refreshCycleCount(cc)
    return ok(ccDone(cc) ? `${cc.code} completed – bins released.` : '')
  }
  /** Accept the counted qty: system stock is corrected to the physical count. */
  function approveCountAdjustment(ccId: number, i: number): Result {
    const cc = cycleCounts.value.find((c) => c.id === ccId)
    if (!cc || cc.status === 'DONE') return fail('Session not found or already done.')
    const ln = cc.lines[i]
    if (!ln || ln.countQty === null || ln.countQty === ln.sysQty) return fail('No difference to adjust.')
    if (!ln.sku) return fail('The system has this bin empty: receive the goods via inbound or transfer, then count again.')
    const b = bin(ln.bin)
    if (!b) return fail('Bin not found.')
    const diff = ln.countQty - ln.sysQty
    if (diff > 0) {
      if (binAvailCap(b) < diff) return fail(`Bin ${b.bin} has no room for +${diff}.`)
      addLot(b, ln.sku, ln.batch, ln.exp, diff)
    } else {
      const reserved = reservedOnLot(b.bin, ln.batch, ln.exp)
      const lot = findLot(b, ln.sku, ln.batch, ln.exp)
      if (lot && lot.qty - reserved < -diff) return fail(`Cannot remove ${-diff}: ${reserved} are allocated to outbound.`)
      removeLot(b, ln.sku, ln.batch, ln.exp, -diff)
    }
    logMove('CYCLE COUNT ADJ', ln.sku, ln.batch, ln.exp, diff, diff < 0 ? ln.bin : null, diff > 0 ? ln.bin : null, cc.code, `System ${ln.sysQty} → counted ${ln.countQty}`)
    log(cc, 'Adjustment approved', `${ln.bin} ${ln.sku} ${diff > 0 ? '+' : ''}${diff}`)
    ln.sysQty = ln.countQty
    ln.adjusted = true
    refreshCycleCount(cc)
    return ok(`Stock in ${ln.bin} corrected by ${diff > 0 ? '+' : ''}${diff}.${ccDone(cc) ? ` ${cc.code} completed.` : ''}`)
  }

  // ---------- ledger helpers
  /** Movements of one batch with a running balance (an opening line covers stock older than the ledger). */
  function batchHistory(s: string, batch: string, exp: string) {
    const rows = ledger.value.filter((e) => e.sku === s && e.batch === normLot(batch) && e.exp === normLot(exp) && e.type !== 'INBOUND RECEIVING' && e.type !== 'INBOUND CANCELLED').sort((a, b) => a.ts.localeCompare(b.ts))
    const now = stockLots((l) => l.sku === s && l.batch === normLot(batch) && l.exp === normLot(exp) && l.zone !== TRANSIT_ZONE).reduce((a, l) => a + l.qty, 0)
    const net = rows.reduce((a, e) => a + e.qty, 0)
    const opening = now - net
    const out: (LedgerEntry & { balance: number })[] = []
    let bal = 0
    if (opening !== 0) {
      bal = opening
      out.push({ id: 0, ts: rows[0]?.ts ?? new Date().toISOString(), type: 'OPENING', sku: s, batch: normLot(batch), exp: normLot(exp), qty: opening, fromBin: null, toBin: null, ref: '', note: 'Stock before movements were recorded', balance: bal })
    }
    rows.forEach((e) => { bal += e.qty; out.push({ ...e, balance: bal }) })
    return { rows: out, now }
  }

  function resetDemo() {
    const s = seedState()
    zones.value = s.zones
    categories.value = s.categories
    skus.value = s.skus
    bins.value = s.bins
    contacts.value = s.contacts
    inbound.value = s.inbound
    outbound.value = s.outbound
    transfers.value = s.transfers
    adjustments.value = s.adjustments
    cycleCounts.value = s.cycleCounts
    ledger.value = s.ledger
    syncTransit()
    outbound.value.forEach(autoAllocate)
  }

  // Derived state that must always hold after loading.
  syncTransit()
  outbound.value.forEach(autoAllocate)

  return {
    // state
    zones, categories, skus, bins, contacts, inbound, outbound, transfers, adjustments, cycleCounts, ledger,
    // lookups
    sku, skuName, skuUnit, bin, zone, category, storageBins, stockLots, skuMetrics, availableQty, reservedOnLot, movableQty,
    frozenBins, isFrozen, frozenBy,
    // master data
    nextSkuCode, saveSku, deleteSku, saveBin, deleteBin, saveZone, deleteZone, saveCategory, deleteCategory, saveContact, deleteContact,
    // inbound
    createInbound, updateInbound, deleteInbound, putawayCandidates, buildPutawayPlan, validatePutaway, executePutaway,
    // outbound
    fefoCandidates, buildFefoPlan, validateAllocation, allocateItem, unallocateItem, executePick, dispatch, closeOutbound, createOutbound, updateOutbound, deleteOutbound, nextDocNo,
    // transfers & adjustments
    validateTransfer, executeTransfer, transferStatus, validateAdjustment, createAdjustment,
    // cycle count
    cycleCountScope, startCycleCount, setCount, approveCountAdjustment, lastCycleCount,
    // ledger
    batchHistory,
    resetDemo,
  }
})
