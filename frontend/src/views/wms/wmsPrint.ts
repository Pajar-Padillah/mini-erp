// Printable WMS documents (delivery order, pick list, putaway sheet, transfer note, stock sheet).
// Each helper opens a styled window and prints it. Returns false when the browser blocked the pop-up.
import {
  TRANSIT_ZONE,
  expiryStatus,
  itemOutstanding,
  itemPutawayRemaining,
  useWmsStore,
  type Inbound,
  type Lot,
  type Outbound,
  type Shipment,
  type Transfer,
} from '../../stores/wmsStore'
import type { PackingList } from '../../stores/packingStore'
import { expiryLabel, fmtDate, fmtDateTime, fmtQty, fmtRp } from './wmsUi'

const COMPANY = 'PT Sant Group Indonesia'

export const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

interface Column { label: string; align?: 'left' | 'right' | 'center'; width?: string }
/** Table row: cells are already-escaped HTML. `group` renders a full-width sub-heading row. */
type Row = { cells: string[]; muted?: boolean } | { group: string }

interface PrintSpec {
  docTitle: string // window / file title
  title: string // big heading, e.g. "DELIVERY ORDER"
  subtitle?: string
  meta: [string, string][] // label, plain text (escaped here)
  columns: Column[]
  rows: Row[]
  emptyText?: string
  notes?: string[] // plain text
  signatures: string[] // signature box captions
  landscape?: boolean
}

const CHECK = '<span class="chk"></span>'

function openPrint(spec: PrintSpec): boolean {
  const w = window.open('', '_blank', 'width=1000,height=760')
  if (!w) return false
  const head = spec.columns
    .map((c) => `<th style="${c.width ? `width:${c.width};` : ''}text-align:${c.align ?? 'left'}">${esc(c.label)}</th>`)
    .join('')
  const body = spec.rows.length
    ? spec.rows
        .map((r) =>
          'group' in r
            ? `<tr class="grp"><td colspan="${spec.columns.length}">${esc(r.group)}</td></tr>`
            : `<tr${r.muted ? ' class="muted-row"' : ''}>${r.cells.map((c, i) => `<td style="text-align:${spec.columns[i]?.align ?? 'left'}">${c}</td>`).join('')}</tr>`,
        )
        .join('')
    : `<tr><td colspan="${spec.columns.length}" class="empty">${esc(spec.emptyText ?? 'No lines.')}</td></tr>`
  const meta = spec.meta.map(([k, v]) => `<div class="mk">${esc(k)}</div><div class="mv">${esc(v || '-')}</div>`).join('')
  const notes = spec.notes?.length ? `<ul class="notes">${spec.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''
  const signs = spec.signatures
    .map((s) => `<div class="sig"><div class="sig-cap">${esc(s)}</div><div class="sig-line">Name / signature / date</div></div>`)
    .join('')
  w.document.open()
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(spec.docTitle)}</title>
<style>
  @page { size: A4 ${spec.landscape ? 'landscape' : 'portrait'}; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #12324e; margin: 24px; font-size: 12px; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; border-bottom: 2px solid #12324e; padding-bottom: 10px; margin-bottom: 14px; }
  .co { font-size: 16px; font-weight: 700; }
  .co-sub { color: #6d879c; font-size: 11px; margin-top: 2px; }
  .title { text-align: right; }
  .title h1 { font-size: 18px; margin: 0; letter-spacing: 0.02em; }
  .title div { color: #6d879c; margin-top: 2px; }
  .meta { display: grid; grid-template-columns: 130px 1fr 130px 1fr; gap: 4px 12px; margin-bottom: 14px; }
  .mk { color: #6d879c; }
  .mv { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #b7c7d4; padding: 5px 7px; vertical-align: top; }
  th { background: #eaf0f5; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.03em; }
  tr.grp td { background: #f4f7fa; font-weight: 700; }
  tr.muted-row td { color: #6d879c; }
  td.empty { text-align: center; color: #6d879c; padding: 16px; }
  .sub { color: #6d879c; font-size: 10px; }
  .warn { color: #b42318; font-weight: 600; }
  .chk { display: inline-block; width: 13px; height: 13px; border: 1.5px solid #12324e; border-radius: 2px; vertical-align: middle; }
  .done { color: #15803d; font-weight: 700; }
  .notes { margin: 12px 0 0; padding-left: 18px; color: #4a6378; }
  .sigs { display: flex; gap: 18px; margin-top: 36px; page-break-inside: avoid; }
  .sig { flex: 1; border: 1px solid #b7c7d4; height: 96px; padding: 8px; display: flex; flex-direction: column; justify-content: space-between; }
  .sig-cap { font-weight: 700; }
  .sig-line { border-top: 1px solid #b7c7d4; padding-top: 4px; color: #6d879c; font-size: 10.5px; }
  .foot { margin-top: 14px; color: #91a8ba; font-size: 10px; text-align: right; }
  @media print { body { margin: 0; } }
</style></head><body>
<div class="head">
  <div><div class="co">${esc(COMPANY)}</div><div class="co-sub">Warehouse Management System</div></div>
  <div class="title"><h1>${esc(spec.title)}</h1>${spec.subtitle ? `<div>${esc(spec.subtitle)}</div>` : ''}</div>
</div>
<div class="meta">${meta}</div>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
${notes}
<div class="sigs">${signs}</div>
<div class="foot">Printed ${esc(fmtDateTime(new Date().toISOString()))}</div>
<script>window.onload = function () { setTimeout(function () { window.focus(); window.print() }, 150) }<\/script>
</body></html>`)
  w.document.close()
  return true
}

const expTxt = (exp: string) => (exp && exp !== '-' ? fmtDate(exp) : '-')
const expTime = (exp: string) => (exp && exp !== '-' ? new Date(exp).getTime() : Infinity)

// ---------------------------------------------------------------- delivery order
/** Delivery order (surat jalan) for one shipment – the last one by default. Without shipments it prints the ordered lines as a draft. */
export function printDeliveryOrder(doc: Outbound, shipment?: Shipment): boolean {
  const store = useWmsStore()
  const sh = shipment ?? doc.shipments[doc.shipments.length - 1]
  const rows: Row[] = sh
    ? sh.lines.map((l, i) => ({
        cells: [String(i + 1), esc(l.sku), esc(store.skuName(l.sku)), esc(l.batch), esc(expTxt(l.exp)), `<b>${esc(fmtQty(l.qty))}</b>`, esc(store.skuUnit(l.sku)), esc(l.bin)],
      }))
    : doc.items.map((it, i) => ({
        cells: [String(i + 1), esc(it.sku), esc(store.skuName(it.sku)), '-', '-', `<b>${esc(fmtQty(it.qty))}</b>`, esc(store.skuUnit(it.sku)), '-'],
      }))
  const total = sh ? sh.lines.reduce((a, l) => a + l.qty, 0) : doc.items.reduce((a, i) => a + i.qty, 0)
  const outstanding = doc.items.reduce((a, i) => a + itemOutstanding(i), 0)
  const notes: string[] = []
  if (!sh) notes.push('Draft – nothing has been dispatched for this DO yet.')
  if (sh && outstanding > 0 && !doc.dispatched) notes.push(`Partial delivery: ${fmtQty(outstanding)} unit(s) still outstanding on this DO.`)
  if (doc.note) notes.push(`Note: ${doc.note}`)
  return openPrint({
    docTitle: `Delivery Order ${doc.no}`,
    title: 'DELIVERY ORDER',
    subtitle: sh ? `Surat Jalan · Shipment #${sh.no}` : 'Surat Jalan · Draft',
    meta: [
      ['DO no.', doc.no],
      ['Date', sh ? fmtDateTime(sh.ts) : fmtDate(doc.date)],
      ['Customer', doc.customer],
      ['Customer PO', doc.poCust],
      ['Trading term', doc.term],
      ['Total qty', fmtQty(total)],
    ],
    columns: [
      { label: '#', width: '28px', align: 'center' },
      { label: 'SKU', width: '80px' },
      { label: 'Item' },
      { label: 'Batch', width: '110px' },
      { label: 'Expiry', width: '90px' },
      { label: 'Qty', width: '70px', align: 'right' },
      { label: 'Unit', width: '55px' },
      { label: 'From bin', width: '90px' },
    ],
    rows,
    notes,
    signatures: [`Prepared by${sh ? ` (${sh.by})` : ''}`, 'Driver', 'Received by'],
  })
}

// ---------------------------------------------------------------- pick list
/** FEFO pick list in walking (bin) order. Allocated lines use their allocation; pending lines show the proposed FEFO plan. */
export function printPicklist(doc: Outbound): boolean {
  const store = useWmsStore()
  type Line = { sku: string; bin: string; zone: string; batch: string; exp: string; qty: number; state: 'ALLOCATED' | 'PICKED' | 'PROPOSED' }
  const lines: Line[] = []
  const shortages: string[] = []
  doc.items.forEach((it) => {
    if (it.status === 'SHIPPED') return
    const need = itemOutstanding(it)
    if (need <= 0) return
    const src = it.status === 'ALLOCATED' || it.status === 'PICKED' ? it.allocations.filter((a) => a.qty > 0) : store.buildFefoPlan(it)
    const state: Line['state'] = it.status === 'PICKED' ? 'PICKED' : it.status === 'ALLOCATED' ? 'ALLOCATED' : 'PROPOSED'
    src.forEach((a) => lines.push({ sku: it.sku, bin: a.bin, zone: store.bin(a.bin)?.zone ?? '-', batch: a.batch, exp: a.exp, qty: a.qty, state }))
    const got = src.reduce((a, x) => a + x.qty, 0)
    if (got < need) shortages.push(`${it.sku} ${store.skuName(it.sku)}: only ${fmtQty(got)} of ${fmtQty(need)} available (short ${fmtQty(need - got)}).`)
  })
  lines.sort((a, b) => a.zone.localeCompare(b.zone) || a.bin.localeCompare(b.bin) || expTime(a.exp) - expTime(b.exp) || a.sku.localeCompare(b.sku))
  const rows: Row[] = []
  let zone = ''
  lines.forEach((l, i) => {
    if (l.zone !== zone) {
      zone = l.zone
      rows.push({ group: zone })
    }
    const hasExp = store.sku(l.sku)?.hasExpiry ?? false
    const st = hasExp ? expiryLabel(expiryStatus(l.exp, true)) : ''
    rows.push({
      muted: l.state === 'PICKED',
      cells: [
        String(i + 1),
        `<b>${esc(l.bin)}</b>`,
        `<b>${esc(l.sku)}</b><div class="sub">${esc(store.skuName(l.sku))}</div>`,
        esc(l.batch),
        `${esc(expTxt(l.exp))}${st ? `<div class="sub">${esc(st)}</div>` : ''}`,
        `<b>${esc(fmtQty(l.qty))}</b> ${esc(store.skuUnit(l.sku))}`,
        l.state === 'PICKED' ? '<span class="done">Picked</span>' : l.state === 'PROPOSED' ? '<span class="sub">Proposed</span>' : 'Allocated',
        l.state === 'PICKED' ? '<span class="done">✓</span>' : CHECK,
        '',
      ],
    })
  })
  return openPrint({
    docTitle: `Pick list ${doc.no}`,
    title: 'PICK LIST',
    subtitle: 'FEFO – earliest expiry first, sorted by bin',
    meta: [
      ['DO no.', doc.no],
      ['DO date', fmtDate(doc.date)],
      ['Customer', doc.customer],
      ['Customer PO', doc.poCust],
      ['Trading term', doc.term],
      ['Lines', `${lines.length} location(s) · ${fmtQty(lines.reduce((a, l) => a + l.qty, 0))} unit(s)`],
    ],
    columns: [
      { label: '#', width: '28px', align: 'center' },
      { label: 'Bin', width: '95px' },
      { label: 'Item' },
      { label: 'Batch', width: '105px' },
      { label: 'Expiry', width: '95px' },
      { label: 'Qty to pick', width: '90px', align: 'right' },
      { label: 'State', width: '72px' },
      { label: 'Done', width: '42px', align: 'center' },
      { label: 'Actual qty / note', width: '120px' },
    ],
    rows,
    emptyText: 'Nothing left to pick on this DO.',
    notes: [...shortages.map((s) => `Short: ${s}`), ...(doc.note ? [`Note: ${doc.note}`] : [])],
    signatures: ['Picked by', 'Checked by', 'Warehouse supervisor'],
  })
}

// ---------------------------------------------------------------- putaway sheet
/** Putaway sheet: what is already put away plus the recommended bins (best fit) for what is still in transit. */
export function printPutawaySheet(doc: Inbound): boolean {
  const store = useWmsStore()
  const rows: Row[] = []
  doc.items.forEach((it, idx) => {
    const s = store.sku(it.sku)
    const targetZone = store.category(s?.category ?? '')?.zone ?? '-'
    type L = { bin: string; qty: number; done: boolean }
    const ls: L[] = it.putaways.map((p) => ({ bin: p.bin, qty: p.qty, done: true }))
    const rem = itemPutawayRemaining(it)
    if (rem > 0) {
      const plan = store.buildPutawayPlan(it)
      plan.forEach((p) => ls.push({ bin: p.bin, qty: p.qty, done: false }))
      const planned = plan.reduce((a, p) => a + p.qty, 0)
      if (planned < rem) ls.push({ bin: '(no room – decide on site)', qty: rem - planned, done: false })
    }
    ls.forEach((l, r) => {
      rows.push({
        muted: l.done,
        cells: [
          r === 0 ? String(idx + 1) : '',
          r === 0 ? `<b>${esc(it.sku)}</b><div class="sub">${esc(s?.name ?? '')}</div>` : '',
          r === 0 ? esc(it.batch) : '',
          r === 0 ? esc(expTxt(it.exp)) : '',
          r === 0 ? `${esc(fmtQty(it.qty))} ${esc(s?.unit ?? '')}` : '',
          r === 0 ? esc(targetZone) : '',
          `<b>${esc(l.bin)}</b><div class="sub">${esc(store.bin(l.bin)?.zone ?? '')}</div>`,
          `<b>${esc(fmtQty(l.qty))}</b>`,
          l.done ? '<span class="done">Done</span>' : 'Recommended',
          l.done ? '<span class="done">✓</span>' : CHECK,
        ],
      })
    })
  })
  const total = doc.items.reduce((a, i) => a + i.qty, 0)
  const rem = doc.items.reduce((a, i) => a + itemPutawayRemaining(i), 0)
  return openPrint({
    docTitle: `Putaway sheet ${doc.no}`,
    title: 'PUTAWAY SHEET',
    subtitle: 'From transit to storage bins (best fit)',
    meta: [
      ['Delivery note', doc.no],
      ['Received', fmtDate(doc.date)],
      ['Supplier', doc.supplier],
      ['PO ref.', doc.poRef],
      ['Total qty', fmtQty(total)],
      ['Still in transit', fmtQty(rem)],
    ],
    columns: [
      { label: '#', width: '28px', align: 'center' },
      { label: 'Item' },
      { label: 'Batch', width: '100px' },
      { label: 'Expiry', width: '88px' },
      { label: 'Received', width: '80px', align: 'right' },
      { label: 'Target zone', width: '75px' },
      { label: 'Bin', width: '115px' },
      { label: 'Qty', width: '60px', align: 'right' },
      { label: 'State', width: '85px' },
      { label: 'Done', width: '42px', align: 'center' },
    ],
    rows,
    notes: ['Recommended bins follow the best-fit rule at print time; check capacity on site before placing goods.'],
    signatures: ['Put away by', 'Checked by', 'Warehouse supervisor'],
  })
}

// ---------------------------------------------------------------- transfer document
export function printTransferDoc(t: Transfer): boolean {
  const store = useWmsStore()
  const s = store.sku(t.sku)
  return openPrint({
    docTitle: `Stock transfer ${t.no}`,
    title: 'STOCK TRANSFER',
    subtitle: t.toTransit ? 'Bin → Transit (re-putaway)' : 'Bin to bin',
    meta: [
      ['Transfer no.', t.no],
      ['Date', fmtDate(t.date)],
      ['Created by', t.createdBy],
      ['Created at', fmtDateTime(t.createdAt)],
      ['Status', store.transferStatus(t)],
      ['Inbound ref.', t.inboundNo ?? '-'],
    ],
    columns: [
      { label: '#', width: '28px', align: 'center' },
      { label: 'Item' },
      { label: 'Batch', width: '105px' },
      { label: 'Expiry', width: '90px' },
      { label: 'From bin', width: '120px' },
      { label: 'To bin', width: '120px' },
      { label: 'Qty', width: '80px', align: 'right' },
      { label: 'Done', width: '42px', align: 'center' },
    ],
    rows: [
      {
        cells: [
          '1',
          `<b>${esc(t.sku)}</b><div class="sub">${esc(s?.name ?? '')}</div>`,
          esc(t.batch),
          esc(expTxt(t.exp)),
          `<b>${esc(t.srcBin)}</b><div class="sub">${esc(store.bin(t.srcBin)?.zone ?? '')}</div>`,
          `<b>${esc(t.tgtBin)}</b><div class="sub">${esc(store.bin(t.tgtBin)?.zone ?? '')}</div>`,
          `<b>${esc(fmtQty(t.qty))}</b> ${esc(s?.unit ?? '')}`,
          CHECK,
        ],
      },
    ],
    notes: t.toTransit ? [`Goods return to transit and wait for putaway under inbound ${t.inboundNo ?? '-'}.`] : [],
    signatures: ['Moved by', 'Checked by', 'Approved by'],
  })
}

// ---------------------------------------------------------------- stock sheet
export type StockSheetRow = Lot & { bin: string; zone: string; rack: string }
/** Inventory sheet for a physical check: every lot grouped by zone, in bin order, with blank count columns. */
export function printStockSheet(rows: StockSheetRow[], scope = 'All storage bins'): boolean {
  const store = useWmsStore()
  const sorted = [...rows].sort(
    (a, b) => Number(a.zone === TRANSIT_ZONE) - Number(b.zone === TRANSIT_ZONE) || a.zone.localeCompare(b.zone) || a.bin.localeCompare(b.bin) || a.sku.localeCompare(b.sku) || expTime(a.exp) - expTime(b.exp),
  )
  const out: Row[] = []
  let zone = ''
  let n = 0
  sorted.forEach((l) => {
    if (l.zone !== zone) {
      zone = l.zone
      const zr = sorted.filter((x) => x.zone === zone)
      out.push({ group: `${zone} · ${new Set(zr.map((x) => x.bin)).size} bin(s) · ${fmtQty(zr.reduce((a, x) => a + x.qty, 0))} unit(s)` })
    }
    n++
    out.push({
      cells: [
        String(n),
        `<b>${esc(l.bin)}</b>`,
        `<b>${esc(l.sku)}</b><div class="sub">${esc(store.skuName(l.sku))}</div>`,
        esc(l.batch),
        esc(expTxt(l.exp)),
        `${esc(fmtQty(l.qty))} ${esc(store.skuUnit(l.sku))}`,
        '',
        '',
        '',
      ],
    })
  })
  return openPrint({
    docTitle: 'Stock sheet',
    title: 'STOCK SHEET',
    subtitle: 'Physical inventory check per bin / lot',
    landscape: true,
    meta: [
      ['Scope', scope],
      ['As of', fmtDateTime(new Date().toISOString())],
      ['Bins', String(new Set(rows.map((r) => r.bin)).size)],
      ['Lots / units', `${rows.length} · ${fmtQty(rows.reduce((a, r) => a + r.qty, 0))}`],
    ],
    columns: [
      { label: '#', width: '30px', align: 'center' },
      { label: 'Bin', width: '100px' },
      { label: 'Item' },
      { label: 'Batch', width: '115px' },
      { label: 'Expiry', width: '90px' },
      { label: 'System qty', width: '95px', align: 'right' },
      { label: 'Counted qty', width: '95px', align: 'right' },
      { label: 'Difference', width: '85px', align: 'right' },
      { label: 'Note', width: '150px' },
    ],
    rows: out,
    emptyText: 'No stock on the selected bins.',
    signatures: ['Counted by', 'Checked by', 'Approved by'],
  })
}

// ---------------------------------------------------------------- dashboard report
export interface DashboardReport {
  category: string // active category filter, '' for all
  kpis: [label: string, value: string, hint: string][]
  categories: { id: string; name: string; value: number; units: number }[]
  top: { name: string; total: number; rows: { sku: string; name: string; onHand: number; unit: string; value: number; share: number }[] }[]
  fefo: { sku: string; category: string; name: string; batch: string; bin: string; zone: string; exp: string; status: string; qty: number; unit: string }[]
}

/** Dashboard report (KPIs, value per category with bars, Top 5 SKUs per category, FEFO risk queue) as a printable PDF page. */
export function printDashboardReport(r: DashboardReport): boolean {
  const w = window.open('', '_blank', 'width=1000,height=760')
  if (!w) return false
  const totV = r.categories.reduce((a, c) => a + c.value, 0) || 1
  const totU = r.categories.reduce((a, c) => a + c.units, 0) || 1
  const maxV = Math.max(...r.categories.map((c) => c.value), 1)
  const pct = (n: number) => `${n.toFixed(1)}%`
  const kpis = r.kpis.map(([l, v, h]) => `<div><small>${esc(l)}</small><b>${esc(v)}</b><span>${esc(h)}</span></div>`).join('')
  const cats = [...r.categories]
    .sort((a, b) => b.value - a.value)
    .map((c) => `<tr><td>${esc(c.id)}</td><td>${esc(c.name)}</td><td class="r">${esc(fmtRp(c.value))}</td><td class="r">${pct((c.value / totV) * 100)}</td>
      <td><div class="bar"><span style="width:${Math.max((c.value / maxV) * 100, 1)}%"></span></div></td>
      <td class="r">${esc(fmtQty(c.units))}</td><td class="r">${pct((c.units / totU) * 100)}</td></tr>`)
    .join('')
  const top = r.top
    .filter((c) => c.rows.length)
    .map((c) => `<h3>${esc(c.name)} – ${esc(fmtRp(c.total))}</h3><table><thead><tr><th>SKU</th><th>Name</th><th class="r">Qty</th><th class="r">Value</th><th class="r">%</th></tr></thead><tbody>${c.rows
      .map((x) => `<tr><td>${esc(x.sku)}</td><td>${esc(x.name)}</td><td class="r">${esc(fmtQty(x.onHand))} ${esc(x.unit)}</td><td class="r">${esc(fmtRp(x.value))}</td><td class="r">${pct(x.share)}</td></tr>`)
      .join('')}</tbody></table>`)
    .join('')
  const fefo = r.fefo.length
    ? r.fefo
        .map((l) => `<tr><td>${esc(l.sku)}</td><td>${esc(l.category)}</td><td>${esc(l.name)}</td><td>${esc(l.batch)}</td><td>${esc(l.bin)}<div class="sub">${esc(l.zone)}</div></td><td>${esc(expTxt(l.exp))}</td><td class="${l.status === 'EXPIRED' ? 'warn' : 'amber'}">${esc(l.status === 'EXPIRED' ? 'Expired' : '< 3 months')}</td><td class="r">${esc(fmtQty(l.qty))} ${esc(l.unit)}</td></tr>`)
        .join('')
    : '<tr><td colspan="8" class="empty">No expiring items at risk.</td></tr>'
  const now = new Date().toISOString()
  w.document.open()
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Warehouse dashboard report – ${esc(fmtDate(now.slice(0, 10)))}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #12324e; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 6px; border-bottom: 2px solid #12324e; padding-bottom: 3px; }
  h3 { font-size: 11px; margin: 10px 0 4px; }
  .meta { color: #6d879c; margin-bottom: 10px; }
  .kpi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0; }
  .kpi div { border: 1px solid #b7c7d4; border-radius: 6px; padding: 8px; }
  .kpi small { display: block; color: #6d879c; font-size: 9px; text-transform: uppercase; }
  .kpi b { display: block; font-size: 14px; margin: 2px 0; }
  .kpi span { color: #6d879c; font-size: 9.5px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th, td { border: 1px solid #b7c7d4; padding: 4px 6px; vertical-align: top; }
  th { background: #eaf0f5; font-size: 10px; text-transform: uppercase; text-align: left; }
  .r { text-align: right; }
  .bar { height: 8px; background: #eaf0f5; border-radius: 4px; overflow: hidden; min-width: 90px; }
  .bar span { display: block; height: 100%; background: #0369a1; }
  .sub { color: #6d879c; font-size: 9.5px; }
  .warn { color: #b42318; font-weight: 700; }
  .amber { color: #b45309; font-weight: 700; }
  .empty { text-align: center; color: #6d879c; padding: 12px; }
  .foot { margin-top: 14px; font-size: 9px; color: #91a8ba; text-align: right; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>${esc(COMPANY)} – Warehouse Management System</h1>
<div class="meta">Warehouse dashboard report · printed ${esc(fmtDateTime(now))}${r.category ? ` · category filter: <b>${esc(r.category)}</b>` : ''}</div>
<div class="kpi">${kpis}</div>
<h2>Stock value &amp; distribution per category</h2>
<table><thead><tr><th>Code</th><th>Category</th><th class="r">Stock value</th><th class="r">% value</th><th></th><th class="r">Units</th><th class="r">% units</th></tr></thead><tbody>${cats}</tbody></table>
<h2>Top 5 SKUs by stock value per category</h2>
${top || '<p class="empty">No stock on shelves.</p>'}
<h2>Expiry warning (FEFO risk queue) – expired &amp; &lt; 3 months</h2>
<table><thead><tr><th>SKU</th><th>Cat.</th><th>Product</th><th>Batch</th><th>Bin</th><th>Expiry</th><th>Status</th><th class="r">Qty</th></tr></thead><tbody>${fefo}</tbody></table>
<div class="foot">${esc(COMPANY)} · WMS</div>
<script>window.onload = function () { setTimeout(function () { window.focus(); window.print() }, 150) }<\/script>
</body></html>`)
  w.document.close()
  return true
}

// ---------------------------------------------------------------- packing list
/** Packing list: carton-by-carton contents of one outbound shipment, with a check box per line. */
export function printPackingList(pl: PackingList): boolean {
  const store = useWmsStore()
  const rows: Row[] = []
  pl.cartons.forEach((c) => {
    const lines = pl.lines.filter((l) => l.carton === c.no)
    const qty = lines.reduce((a, l) => a + l.qty, 0)
    const extra = [c.weight ? `${c.weight} kg` : '', c.dims ? `${c.dims} cm` : ''].filter(Boolean).join(' · ')
    rows.push({ group: `Carton #${c.no} of ${pl.cartons.length} – ${fmtQty(qty)} pcs${extra ? ` · ${extra}` : ''}` })
    lines.forEach((l, i) => rows.push({
      cells: [String(i + 1), esc(l.sku), esc(store.skuName(l.sku)), esc(l.batch), esc(expTxt(l.exp)), `<b>${esc(fmtQty(l.qty))}</b>`, esc(store.skuUnit(l.sku)), CHECK],
    }))
  })
  const total = pl.lines.reduce((a, l) => a + l.qty, 0)
  const weight = pl.cartons.reduce((a, c) => a + (Number(c.weight) || 0), 0)
  const notes: string[] = []
  if (pl.status === 'DRAFT') notes.push('Draft – packing is not finished yet.')
  if (pl.status === 'DISCREPANCY') notes.push(`Checking found a discrepancy${pl.checkNote ? `: ${pl.checkNote}` : ''}.`)
  if (pl.note) notes.push(`Note: ${pl.note}`)
  return openPrint({
    docTitle: `Packing List ${pl.no}`,
    title: 'PACKING LIST',
    subtitle: `${pl.outboundNo} · Shipment #${pl.round}`,
    meta: [
      ['Packing list no.', pl.no],
      ['Date', fmtDate(pl.date)],
      ['Outbound DO', pl.outboundNo],
      ['Customer', pl.customer],
      ['Cartons', String(pl.cartons.length)],
      ['Total qty / weight', `${fmtQty(total)}${weight ? ` · ${weight.toFixed(1)} kg` : ''}`],
    ],
    columns: [
      { label: '#', width: '28px', align: 'center' },
      { label: 'SKU', width: '80px' },
      { label: 'Item' },
      { label: 'Batch', width: '110px' },
      { label: 'Expiry', width: '90px' },
      { label: 'Qty', width: '70px', align: 'right' },
      { label: 'Unit', width: '55px' },
      { label: 'Check', width: '50px', align: 'center' },
    ],
    rows,
    notes,
    signatures: [`Packed by (${pl.createdBy})`, `Checked by${pl.checkedBy ? ` (${pl.checkedBy})` : ''}`, 'Received by'],
  })
}
