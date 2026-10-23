// Picking List → Packing List → Checking List: the steps between outbound and dispatch.
// A packing list splits the picked (or shipped) lines of one outbound DO round into cartons;
// a checker then re-counts every carton before the goods leave. State persists in localStorage.
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAuthStore } from './authStore'
import { todayISO, useWmsStore, type DocLog, type Outbound } from './wmsStore'

const STORAGE_KEY = 'mini-erp.packing.v1'

export type PackingStatus = 'DRAFT' | 'PACKED' | 'CHECKED' | 'DISCREPANCY'
export const PACKING_STATUSES: { label: string; value: PackingStatus; color: string }[] = [
  { label: 'Draft', value: 'DRAFT', color: 'gray' },
  { label: 'Packed', value: 'PACKED', color: 'blue' },
  { label: 'Checked', value: 'CHECKED', color: 'green' },
  { label: 'Discrepancy', value: 'DISCREPANCY', color: 'red' },
]
export const PACKING_STATUS_COLOR: Record<PackingStatus, string> = { DRAFT: 'gray', PACKED: 'blue', CHECKED: 'green', DISCREPANCY: 'red' }

export interface PackLine { carton: number; sku: string; batch: string; exp: string; qty: number; checkedQty: number }
export interface Carton { no: number; weight: number; dims: string }
export interface PackingList {
  id: number
  no: string // PL-…
  outboundId: number | null
  outboundNo: string
  round: number // shipment number of the DO this list belongs to
  customer: string
  date: string
  note: string
  status: PackingStatus
  cartons: Carton[]
  lines: PackLine[]
  createdBy: string
  createdAt: string
  checkedBy?: string
  checkedAt?: string
  checkNote?: string
  logs: DocLog[]
}
export interface SourceLine { sku: string; batch: string; exp: string; qty: number }
interface Result<T = undefined> { ok: boolean; msg: string; data?: T }

const ok = <T>(msg: string, data?: T): Result<T> => ({ ok: true, msg, data })
const fail = <T>(msg: string): Result<T> => ({ ok: false, msg })
const lineKey = (l: { sku: string; batch: string; exp: string }) => `${l.sku}|${l.batch}|${l.exp}`

export const packedQty = (pl: PackingList) => pl.lines.reduce((a, l) => a + l.qty, 0)
export const checkedQty = (pl: PackingList) => pl.lines.reduce((a, l) => a + Math.min(l.qty, l.checkedQty), 0)
export const lineVariance = (l: PackLine) => l.checkedQty - l.qty
export const hasVariance = (pl: PackingList) => pl.lines.some((l) => lineVariance(l) !== 0)

/**
 * Lines a DO can be packed from: the picked lines waiting to ship (next shipment round),
 * otherwise the lines of its latest shipment.
 */
export function outboundSource(doc: Outbound): { round: number; lines: SourceLine[] } | null {
  const merge = (rows: SourceLine[]) => {
    const map = new Map<string, SourceLine>()
    rows.filter((r) => r.qty > 0).forEach((r) => {
      const k = lineKey(r)
      const cur = map.get(k)
      if (cur) cur.qty += r.qty
      else map.set(k, { ...r })
    })
    return [...map.values()]
  }
  const picked = doc.items
    .filter((i) => i.status === 'PICKED' && i.pickedQty > 0)
    .flatMap((i) => i.allocations.map((a) => ({ sku: i.sku, batch: a.batch, exp: a.exp, qty: a.qty })))
  if (!doc.dispatched && picked.length) return { round: doc.shipments.length + 1, lines: merge(picked) }
  const last = doc.shipments[doc.shipments.length - 1]
  if (last) return { round: last.no, lines: merge(last.lines.map((l) => ({ sku: l.sku, batch: l.batch, exp: l.exp, qty: l.qty }))) }
  return null
}

function seed(): PackingList[] {
  const wms = useWmsStore()
  const expOf = (batch: string) => wms.ledger.find((l) => l.batch === batch)?.exp ?? '-'
  const daysAgo = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d
  }
  const make = (id: number, days: number, outboundNo: string, customer: string, status: PackingStatus, cartons: Carton[], lines: Omit<PackLine, 'exp' | 'checkedQty'>[], checked?: number[]): PackingList => {
    const at = daysAgo(days)
    const date = todayISO(at)
    const pl: PackingList = {
      id, no: `PL-${date.replace(/-/g, '')}-${String(id).padStart(3, '0')}`, outboundId: null, outboundNo, round: 1, customer, date, note: '', status, cartons,
      lines: lines.map((l, i) => ({ ...l, exp: expOf(l.batch), checkedQty: checked?.[i] ?? 0 })),
      createdBy: 'System', createdAt: at.toISOString(), logs: [{ ts: at.toISOString(), by: 'System', action: 'Created' }],
    }
    if (status !== 'DRAFT') pl.logs.push({ ts: at.toISOString(), by: 'System', action: 'Packed' })
    if (status === 'CHECKED' || status === 'DISCREPANCY') {
      pl.checkedBy = 'Budi Santoso'
      pl.checkedAt = at.toISOString()
      pl.logs.push({ ts: at.toISOString(), by: 'Budi Santoso', action: status === 'CHECKED' ? 'Checked – all cartons match' : 'Checked – discrepancy found' })
    }
    return pl
  }
  return [
    make(1, 4, 'DO-DEMO-02', 'Crusita Official Store', 'CHECKED',
      [{ no: 1, weight: 8.5, dims: '40x30x30' }, { no: 2, weight: 8.2, dims: '40x30x30' }],
      [{ carton: 1, sku: 'FG-01', batch: 'PRD-2609-01', qty: 20 }, { carton: 2, sku: 'FG-01', batch: 'PRD-2609-01', qty: 20 }], [20, 20]),
    make(2, 2, 'DO-DEMO-04', 'Alfamart DC Cikarang', 'DISCREPANCY',
      [{ no: 1, weight: 12, dims: '50x40x30' }, { no: 2, weight: 11.4, dims: '50x40x30' }],
      [{ carton: 1, sku: 'FG-04', batch: 'PRD-2609-05', qty: 25 }, { carton: 2, sku: 'FG-04', batch: 'PRD-2609-05', qty: 25 }], [25, 23]),
    make(3, 1, 'DO-DEMO-05', 'Crusita Official Store', 'PACKED',
      [{ no: 1, weight: 6.3, dims: '40x30x25' }],
      [{ carton: 1, sku: 'FG-02', batch: 'PRD-2607-03', qty: 20 }]),
    make(4, 0, 'DO-DEMO-06', 'Alfamart DC Cikarang', 'DRAFT',
      [{ no: 1, weight: 0, dims: '' }],
      [{ carton: 1, sku: 'FG-01', batch: 'PRD-2609-01', qty: 25 }]),
  ].map((pl) => (pl.status === 'DISCREPANCY' ? { ...pl, checkNote: 'Carton 2 short 2 pcs' } : pl))
}

function load(): PackingList[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as PackingList[]
  } catch {
    // fall back to demo data
  }
  return seed()
}

export const usePackingStore = defineStore('packing', () => {
  const lists = ref<PackingList[]>(load())

  let timer: number | undefined
  watch(lists, () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lists.value))
      } catch {
        // ignore storage failures
      }
    }, 150)
  }, { deep: true })

  const who = () => useAuthStore().user?.name ?? 'User'
  const log = (pl: PackingList, action: string, note = '') => pl.logs.push({ ts: new Date().toISOString(), by: who(), action, note })
  const find = (id: number) => lists.value.find((p) => p.id === id)

  function nextNo(): string {
    const pre = `PL-${todayISO().replace(/-/g, '')}-`
    const used = new Set(lists.value.map((p) => p.no))
    let k = 1
    let no = ''
    do { no = pre + String(k++).padStart(3, '0') } while (used.has(no))
    return no
  }

  /** Outbound DOs that have something to pack and no packing list for that round yet. */
  function packableOutbound() {
    const wms = useWmsStore()
    return wms.outbound
      .map((doc) => ({ doc, source: outboundSource(doc) }))
      .filter((x): x is { doc: Outbound; source: NonNullable<ReturnType<typeof outboundSource>> } =>
        !!x.source && !lists.value.some((p) => p.outboundId === x.doc.id && p.round === x.source!.round))
  }

  /** Packed lines must add up to the source lines exactly (per SKU / batch / expiry). */
  function validate(source: SourceLine[], lines: PackLine[], cartons: Carton[]): Result {
    if (!lines.length) return fail('Add at least one line.')
    const cartonNos = new Set(cartons.map((c) => c.no))
    for (const l of lines) {
      if (!l.sku) return fail('Every line needs a SKU.')
      if (!(l.qty > 0)) return fail(`${l.sku}: qty must be more than 0.`)
      if (!cartonNos.has(l.carton)) return fail(`${l.sku}: carton #${l.carton} does not exist.`)
    }
    const empty = cartons.find((c) => !lines.some((l) => l.carton === c.no))
    if (empty) return fail(`Carton #${empty.no} is empty – remove it or put something in it.`)
    const want = new Map(source.map((s) => [lineKey(s), s.qty]))
    const got = new Map<string, number>()
    lines.forEach((l) => got.set(lineKey(l), (got.get(lineKey(l)) ?? 0) + l.qty))
    for (const [k, qty] of got) {
      const need = want.get(k)
      const [sku, batch] = k.split('|')
      if (need === undefined) return fail(`${sku} batch ${batch} is not on the outbound.`)
      if (qty !== need) return fail(`${sku} batch ${batch}: packed ${qty}, outbound has ${need}.`)
    }
    for (const [k, need] of want) {
      if (!got.has(k)) {
        const [sku, batch] = k.split('|')
        return fail(`${sku} batch ${batch} (${need}) is not packed yet.`)
      }
    }
    return ok('All lines packed.')
  }

  /** Source lines of an existing list: its outbound round, or its own lines for demo / detached lists. */
  function sourceOf(pl: PackingList): SourceLine[] {
    const doc = pl.outboundId != null ? useWmsStore().outbound.find((d) => d.id === pl.outboundId) : undefined
    const src = doc ? outboundSource(doc) : null
    if (src && src.round === pl.round) return src.lines
    const map = new Map<string, SourceLine>()
    pl.lines.forEach((l) => {
      const cur = map.get(lineKey(l))
      if (cur) cur.qty += l.qty
      else map.set(lineKey(l), { sku: l.sku, batch: l.batch, exp: l.exp, qty: l.qty })
    })
    return [...map.values()]
  }

  function create(p: { outboundId: number; date: string; note: string; cartons: Carton[]; lines: PackLine[]; pack: boolean }): Result<PackingList> {
    const doc = useWmsStore().outbound.find((d) => d.id === p.outboundId)
    if (!doc) return fail('Outbound not found.')
    const src = outboundSource(doc)
    if (!src) return fail(`${doc.no} has nothing picked or shipped to pack.`)
    if (lists.value.some((x) => x.outboundId === doc.id && x.round === src.round)) return fail(`${doc.no} already has a packing list for shipment #${src.round}.`)
    if (p.pack) {
      const v = validate(src.lines, p.lines, p.cartons)
      if (!v.ok) return fail(v.msg)
    }
    const id = lists.value.length ? Math.max(...lists.value.map((x) => x.id)) + 1 : 1
    const pl: PackingList = {
      id, no: nextNo(), outboundId: doc.id, outboundNo: doc.no, round: src.round, customer: doc.customer, date: p.date, note: p.note,
      status: p.pack ? 'PACKED' : 'DRAFT', cartons: p.cartons.map((c) => ({ ...c })), lines: p.lines.map((l) => ({ ...l, checkedQty: 0 })),
      createdBy: who(), createdAt: new Date().toISOString(), logs: [],
    }
    log(pl, 'Created')
    if (p.pack) log(pl, 'Packed', `${p.cartons.length} carton(s)`)
    lists.value.push(pl)
    return ok(`${pl.no} ${p.pack ? 'packed' : 'saved as draft'}.`, pl)
  }

  function update(id: number, p: { date: string; note: string; cartons: Carton[]; lines: PackLine[]; pack: boolean }): Result<PackingList> {
    const pl = find(id)
    if (!pl) return fail('Packing list not found.')
    if (pl.status === 'PACKED' || pl.status === 'CHECKED') return fail(`${pl.no} is ${pl.status.toLowerCase()} and cannot be edited.`)
    if (p.pack) {
      const v = validate(sourceOf(pl), p.lines, p.cartons)
      if (!v.ok) return fail(v.msg)
    }
    const repack = pl.status === 'DISCREPANCY'
    pl.date = p.date
    pl.note = p.note
    pl.cartons = p.cartons.map((c) => ({ ...c }))
    pl.lines = p.lines.map((l) => ({ ...l, checkedQty: 0 }))
    if (p.pack) {
      pl.status = 'PACKED'
      pl.checkedBy = undefined
      pl.checkedAt = undefined
      pl.checkNote = undefined
      log(pl, repack ? 'Repacked' : 'Packed', `${p.cartons.length} carton(s)`)
    } else {
      log(pl, 'Edited')
    }
    return ok(`${pl.no} ${p.pack ? 'packed' : 'saved'}.`, pl)
  }

  function remove(id: number): Result {
    const pl = find(id)
    if (!pl) return fail('Packing list not found.')
    if (pl.status !== 'DRAFT') return fail('Only draft packing lists can be deleted.')
    lists.value = lists.value.filter((x) => x.id !== id)
    return ok(`${pl.no} deleted.`)
  }

  /** Save the checker's counts; `finish` closes the check as CHECKED or DISCREPANCY. */
  function saveCheck(id: number, counts: number[], finish: boolean, note = ''): Result<PackingList> {
    const pl = find(id)
    if (!pl) return fail('Packing list not found.')
    if (pl.status !== 'PACKED') return fail(`${pl.no} is not waiting for a check.`)
    pl.lines.forEach((l, i) => { l.checkedQty = Math.max(0, Number(counts[i]) || 0) })
    if (!finish) {
      log(pl, 'Check progress saved', `${checkedQty(pl)} / ${packedQty(pl)}`)
      return ok('Progress saved.', pl)
    }
    pl.checkedBy = who()
    pl.checkedAt = new Date().toISOString()
    pl.checkNote = note
    if (hasVariance(pl)) {
      pl.status = 'DISCREPANCY'
      log(pl, 'Checked – discrepancy found', note)
      return ok(`${pl.no} has a discrepancy – repack it in the Packing List.`, pl)
    }
    pl.status = 'CHECKED'
    log(pl, 'Checked – all cartons match', note)
    return ok(`${pl.no} checked – ready to dispatch.`, pl)
  }

  return { lists, find, packableOutbound, sourceOf, validate, create, update, remove, saveCheck }
})
