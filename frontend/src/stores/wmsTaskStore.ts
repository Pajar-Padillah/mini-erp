// Warehouse tasks: putaway / pick work orders that an admin assigns to a helper or picker,
// executed step by step on a phone (scan bin → scan item/lot → confirm qty).
// Ported from the "Sant Group WMS" prototype (TUGAS GUDANG). Stock moves only through the
// public API of the WMS store (executePutaway / allocateItem / executePick), so the ledger,
// transit bin and allocations stay consistent. State persists in localStorage.
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAuthStore } from './authStore'
import {
  TRANSIT_BIN, findLot, inboundStatus, itemOutstanding, itemPutawayRemaining, normLot, todayISO, useWmsStore,
  type Alloc, type DocLog, type Inbound, type Outbound, type Result,
} from './wmsStore'

const STORAGE_KEY = 'mini-erp.wms.tasks.v1'

// ---------------------------------------------------------------- types
export type TaskType = 'PUTAWAY' | 'PICK'
export type TaskStatus = 'NEW' | 'IN PROGRESS' | 'DONE' | 'PARTIALLY DONE' | 'CANCELLED'
export type TaskLineStatus = 'OPEN' | 'PARTIAL' | 'DONE' | 'SHORT' | 'PROBLEM'
export type ScanStep = 'BIN' | 'ITEM'

export interface TaskScan { ts: string; by: string; step: ScanStep; code: string; ok: boolean; msg: string }
export interface TaskLineHistory { ts: string; by: string; qty: number }
export interface TaskLine {
  idx: number // item index in the source document
  sku: string
  batch: string
  exp: string
  fromBin: string
  toBin: string // '-' for picks (goods leave to the staging / dispatch area)
  qty: number // planned
  done: number
  status: TaskLineStatus
  problem?: string
  /** Scan verification of the current attempt; reset after every confirmation. */
  verified: { bin: boolean; item: boolean }
  scans: TaskScan[]
  history: TaskLineHistory[]
}
export interface WarehouseTask {
  id: number
  no: string // TG-YYYYMMDD-NNN
  type: TaskType
  refId: number
  refNo: string
  party: string // supplier / customer
  assignee: string
  note: string
  createdBy: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
  cancelled?: boolean
  lines: TaskLine[]
  logs: DocLog[]
}
/** A planned line before the task exists (preview in the "New task" dialog). */
export type TaskLinePlan = Pick<TaskLine, 'idx' | 'sku' | 'batch' | 'exp' | 'fromBin' | 'toBin' | 'qty'>

export const TASK_TYPES: { value: TaskType; label: string; color: string }[] = [
  { value: 'PUTAWAY', label: 'Putaway', color: 'amber' },
  { value: 'PICK', label: 'Picking', color: 'blue' },
]
export const TASK_STATUSES: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'NEW', label: 'New', color: 'gray' },
  { value: 'IN PROGRESS', label: 'In progress', color: 'amber' },
  { value: 'DONE', label: 'Done', color: 'green' },
  { value: 'PARTIALLY DONE', label: 'Partially done', color: 'blue' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'red' },
]
export const TASK_LINE_STATUSES: Record<TaskLineStatus, { label: string; color: string }> = {
  OPEN: { label: 'Open', color: 'gray' },
  PARTIAL: { label: 'Partial', color: 'amber' },
  DONE: { label: 'Done', color: 'green' },
  SHORT: { label: 'Short', color: 'amber' },
  PROBLEM: { label: 'Problem', color: 'red' },
}
export const PROBLEM_REASONS = ['Short qty / item not found', 'Damaged goods', 'Bin full', 'Wrong batch / expiry', 'Bin blocked / not accessible', 'Other']

/** Warehouse floor staff (static for the mockup); the signed-in user is added in the store. */
export const WAREHOUSE_STAFF = ['Rudi (Helper)', 'Agus (Helper)', 'Joko (Helper)', 'Sari (Picker)', 'Dewi (Picker)', 'Bayu (Picker)']

// ---------------------------------------------------------------- pure helpers
export const taskTypeLabel = (t: TaskType) => TASK_TYPES.find((x) => x.value === t)?.label ?? t
export const taskTypeColor = (t: TaskType) => TASK_TYPES.find((x) => x.value === t)?.color ?? 'gray'
export const taskStatusLabel = (s: TaskStatus) => TASK_STATUSES.find((x) => x.value === s)?.label ?? s
export const taskStatusColor = (s: TaskStatus) => TASK_STATUSES.find((x) => x.value === s)?.color ?? 'gray'

export const lineOpen = (ln: TaskLine) => ln.status === 'OPEN' || ln.status === 'PARTIAL'
export const lineRemaining = (ln: TaskLine) => Math.max(0, ln.qty - ln.done)
export const lineHasIssue = (ln: TaskLine) => ln.status === 'SHORT' || ln.status === 'PROBLEM'
/** The bin the worker must be at: destination for putaway, source for picking. */
export const lineBin = (t: Pick<WarehouseTask, 'type'>, ln: Pick<TaskLine, 'fromBin' | 'toBin'>) => (t.type === 'PUTAWAY' ? ln.toBin : ln.fromBin)

export function taskStatus(t: WarehouseTask): TaskStatus {
  if (t.cancelled) return 'CANCELLED'
  if (t.lines.some(lineOpen)) return t.startedAt ? 'IN PROGRESS' : 'NEW'
  return t.lines.some(lineHasIssue) ? 'PARTIALLY DONE' : 'DONE'
}
export const taskActive = (t: WarehouseTask) => {
  const s = taskStatus(t)
  return s === 'NEW' || s === 'IN PROGRESS'
}
export function taskProgress(t: WarehouseTask) {
  const totalQty = t.lines.reduce((a, l) => a + l.qty, 0)
  const doneQty = t.lines.reduce((a, l) => a + l.done, 0)
  const closedLines = t.lines.filter((l) => !lineOpen(l)).length
  const issues = t.lines.filter(lineHasIssue).length
  return { totalQty, doneQty, closedLines, totalLines: t.lines.length, issues, pct: totalQty ? Math.round((doneQty / totalQty) * 100) : 0 }
}
/** Minutes between start and finish (or now while running), as "12 min" / "1 h 5 min". */
export function taskDuration(t: Pick<WarehouseTask, 'startedAt' | 'finishedAt'>, now = Date.now()): string {
  if (!t.startedAt) return '-'
  const end = t.finishedAt ? new Date(t.finishedAt).getTime() : now
  const m = Math.max(0, Math.round((end - new Date(t.startedAt).getTime()) / 60000))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}

// QR label payloads
export const binLabelCode = (bin: string) => `BIN:${bin}`
export const lotLabelCode = (sku: string, batch: string, exp: string) => `LOT:${sku}|${normLot(batch)}|${normLot(exp)}`
export type ParsedScan =
  | { kind: 'BIN'; bin: string }
  | { kind: 'LOT'; sku: string; batch: string; exp: string }
  | { kind: 'RAW'; code: string }
export function parseScan(raw: string): ParsedScan {
  const code = raw.trim()
  const up = code.toUpperCase()
  if (up.startsWith('BIN:')) return { kind: 'BIN', bin: up.slice(4).trim() }
  if (up.startsWith('LOT:')) {
    const [sku = '', batch = '-', exp = '-'] = code.slice(4).split('|').map((s) => s.trim())
    return { kind: 'LOT', sku: sku.toUpperCase(), batch: normLot(batch), exp: normLot(exp) }
  }
  return { kind: 'RAW', code: up }
}

const ok = <T>(msg = '', data?: T): Result<T> => ({ ok: true, msg, data })
const fail = <T = undefined>(msg: string): Result<T> => ({ ok: false, msg })

function loadTasks(): WarehouseTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { tasks?: WarehouseTask[] }
      if (parsed && Array.isArray(parsed.tasks)) return parsed.tasks
    }
  } catch {
    // ignore storage failures
  }
  return []
}

// ---------------------------------------------------------------- store
export const useWmsTaskStore = defineStore('wmsTasks', () => {
  const wms = useWmsStore()
  const tasks = ref<WarehouseTask[]>(loadTasks())

  let persistTimer: number | undefined
  watch(tasks, () => {
    window.clearTimeout(persistTimer)
    persistTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks: tasks.value }))
      } catch {
        // ignore storage failures
      }
    }, 150)
  }, { deep: true })

  const who = () => useAuthStore().user?.name ?? 'User'
  const log = (t: WarehouseTask, action: string, note = '', by = who()) => t.logs.push({ ts: new Date().toISOString(), by, action, note })

  /** Assignable staff: the static floor team plus the signed-in user. */
  const workers = computed(() => {
    const me = useAuthStore().user?.name
    return me && !WAREHOUSE_STAFF.includes(me) ? [...WAREHOUSE_STAFF, me] : [...WAREHOUSE_STAFF]
  })

  const taskByNo = (no: string) => tasks.value.find((t) => t.no === no)
  const inboundDoc = (id: number) => wms.inbound.find((d) => d.id === id)
  const outboundDoc = (id: number) => wms.outbound.find((d) => d.id === id)
  const activeTaskFor = (type: TaskType, refId: number) => tasks.value.find((t) => t.type === type && t.refId === refId && taskActive(t)) ?? null
  const tasksOf = (assignee: string) => tasks.value.filter((t) => t.assignee === assignee)

  /** Inbound documents that still have goods in transit. */
  const putawaySources = computed(() => wms.inbound.filter((d) => inboundStatus(d) !== 'PUTAWAY COMPLETE'))
  /** Outbound documents with something left to pick (allocated, or pending with outstanding qty). */
  const pickSources = computed(() => wms.outbound.filter((d) => !d.dispatched && d.items.some((i) => i.status === 'ALLOCATED' || (i.status === 'PENDING' && itemOutstanding(i) > 0))))

  function nextTaskNo(): string {
    const pre = `TG-${todayISO().replace(/-/g, '')}-`
    const used = new Set(tasks.value.map((t) => t.no))
    let k = 1
    let no = ''
    do { no = pre + String(k++).padStart(3, '0') } while (used.has(no))
    return no
  }

  // ---------- planning
  function planPutaway(doc: Inbound): { lines: TaskLinePlan[]; warnings: string[] } {
    const lines: TaskLinePlan[] = []
    const warnings: string[] = []
    doc.items.forEach((it, idx) => {
      const rem = itemPutawayRemaining(it)
      if (rem <= 0) return
      const plan = wms.buildPutawayPlan(it)
      const planned = plan.reduce((a, r) => a + r.qty, 0)
      if (planned < rem) warnings.push(`${it.sku}: only ${planned} of ${rem} fit in free bins`)
      plan.forEach((r) => lines.push({ idx, sku: it.sku, batch: normLot(it.batch), exp: normLot(it.exp), fromBin: TRANSIT_BIN, toBin: r.bin, qty: r.qty }))
    })
    return { lines, warnings }
  }
  /** Allocated lines as they are, pending lines as their FEFO plan (nothing is booked here). */
  function planPick(doc: Outbound): { lines: TaskLinePlan[]; warnings: string[] } {
    const lines: TaskLinePlan[] = []
    const warnings: string[] = []
    doc.items.forEach((it, idx) => {
      let allocs: Alloc[] = []
      if (it.status === 'ALLOCATED') allocs = it.allocations
      else if (it.status === 'PENDING' && itemOutstanding(it) > 0) {
        allocs = wms.buildFefoPlan(it)
        const total = allocs.reduce((a, x) => a + x.qty, 0)
        if (total < itemOutstanding(it)) warnings.push(`${it.sku}: only ${total} of ${itemOutstanding(it)} in stock`)
      }
      allocs.filter((a) => a.qty > 0).forEach((a) => lines.push({ idx, sku: it.sku, batch: normLot(a.batch), exp: normLot(a.exp), fromBin: a.bin, toBin: '-', qty: a.qty }))
    })
    return { lines, warnings }
  }
  function previewLines(type: TaskType, refId: number): Result<{ lines: TaskLinePlan[]; warnings: string[] }> {
    if (type === 'PUTAWAY') {
      const doc = inboundDoc(refId)
      if (!doc) return fail('Inbound document not found.')
      return ok('', planPutaway(doc))
    }
    const doc = outboundDoc(refId)
    if (!doc) return fail('Outbound document not found.')
    if (doc.dispatched) return fail(`DO ${doc.no} is already dispatched.`)
    return ok('', planPick(doc))
  }

  // ---------- create / cancel / start
  function createTask(p: { type: TaskType; refId: number; assignee: string; note?: string }): Result<WarehouseTask> {
    if (!p.assignee) return fail('Choose who will do the task.')
    const dup = activeTaskFor(p.type, p.refId)
    if (dup) return fail(`Task ${dup.no} (${dup.assignee}) is still active for this document. Finish or cancel it first.`)
    let refNo = ''
    let party = ''
    let plan: { lines: TaskLinePlan[]; warnings: string[] }
    if (p.type === 'PUTAWAY') {
      const doc = inboundDoc(p.refId)
      if (!doc) return fail('Inbound document not found.')
      refNo = doc.no
      party = doc.supplier
      plan = planPutaway(doc)
    } else {
      const doc = outboundDoc(p.refId)
      if (!doc) return fail('Outbound document not found.')
      if (doc.dispatched) return fail(`DO ${doc.no} is already dispatched.`)
      refNo = doc.no
      party = doc.customer
      // Book stock (FEFO) for pending lines first, so the task picks reserved lots.
      const warnings: string[] = []
      doc.items.forEach((it, idx) => {
        if (it.status !== 'PENDING' || itemOutstanding(it) <= 0) return
        const fefo = wms.buildFefoPlan(it)
        if (!fefo.length) return
        const r = wms.allocateItem(doc.id, idx, fefo)
        if (!r.ok) warnings.push(`${it.sku}: ${r.msg}`)
      })
      plan = planPick(doc)
      plan.warnings = [...warnings, ...plan.warnings]
    }
    if (!plan.lines.length) {
      return fail(p.type === 'PUTAWAY' ? 'Nothing to put away: no goods in transit or no free bin capacity.' : 'Nothing to pick: no stock could be allocated for this DO.')
    }
    const id = tasks.value.length ? Math.max(...tasks.value.map((t) => t.id)) + 1 : 1
    const task: WarehouseTask = {
      id, no: nextTaskNo(), type: p.type, refId: p.refId, refNo, party, assignee: p.assignee, note: (p.note ?? '').trim(),
      createdBy: who(), createdAt: new Date().toISOString(), logs: [],
      lines: plan.lines.map((l) => ({ ...l, done: 0, status: 'OPEN', verified: { bin: false, item: false }, scans: [], history: [] })),
    }
    log(task, 'Task created', `Assigned to ${p.assignee} · ${task.lines.length} line(s)${task.note ? ` · ${task.note}` : ''}`)
    tasks.value.unshift(task)
    const warn = plan.warnings.length ? ` Note: ${plan.warnings.join('; ')}.` : ''
    return ok(`Task ${task.no} created and assigned to ${p.assignee}.${warn}`, task)
  }

  function startTask(no: string, by = who()): Result {
    const t = taskByNo(no)
    if (!t || !taskActive(t)) return fail('Task is not active.')
    if (!t.startedAt) {
      t.startedAt = new Date().toISOString()
      log(t, 'Started', '', by)
    }
    return ok(`Task ${t.no} started.`)
  }

  function finishCheck(t: WarehouseTask, by: string) {
    if (t.finishedAt || t.lines.some(lineOpen)) return
    t.finishedAt = new Date().toISOString()
    log(t, taskStatus(t) === 'DONE' ? 'Finished' : 'Finished with short / problem lines', `Duration ${taskDuration(t)}`, by)
  }

  /**
   * Pick: once every line of an outbound item is closed, re-book the allocation to the quantities
   * actually confirmed per lot and execute the pick. Unconfirmed reservations are released.
   */
  function finalizePickItem(t: WarehouseTask, idx: number): Result {
    const doc = outboundDoc(t.refId)
    const it = doc?.items[idx]
    if (!doc || !it) return fail('Outbound item not found.')
    if (it.status !== 'ALLOCATED') return ok() // already picked / released elsewhere
    const confirmed: Alloc[] = []
    t.lines.filter((l) => l.idx === idx && l.done > 0).forEach((l) => {
      const same = confirmed.find((a) => a.bin === l.fromBin && a.batch === l.batch && a.exp === l.exp)
      if (same) same.qty += l.done
      else confirmed.push({ bin: l.fromBin, batch: l.batch, exp: l.exp, qty: l.done })
    })
    const key = (a: Alloc) => `${a.bin}|${normLot(a.batch)}|${normLot(a.exp)}|${a.qty}`
    const unchanged = confirmed.length === it.allocations.length && confirmed.map(key).sort().join() === it.allocations.map(key).sort().join()
    if (!unchanged) {
      const old = it.allocations.map((a) => ({ ...a }))
      const r1 = wms.unallocateItem(doc.id, idx)
      if (!r1.ok) return r1
      if (!confirmed.length) return ok(`${it.sku}: nothing picked – allocation released.`)
      const r2 = wms.allocateItem(doc.id, idx, confirmed)
      if (!r2.ok) {
        wms.allocateItem(doc.id, idx, old) // restore the previous reservation
        return r2
      }
    }
    return wms.executePick(doc.id, idx)
  }

  function cancelTask(no: string, reason = ''): Result {
    const t = taskByNo(no)
    if (!t || !taskActive(t)) return fail('Only new or running tasks can be cancelled.')
    t.cancelled = true
    t.finishedAt = new Date().toISOString()
    log(t, 'Cancelled', reason)
    // Picks already confirmed must still leave the shelf: finalize items that have confirmed qty.
    if (t.type === 'PICK') {
      const msgs: string[] = []
      new Set(t.lines.filter((l) => l.done > 0).map((l) => l.idx)).forEach((idx) => {
        const r = finalizePickItem(t, idx)
        if (!r.ok) msgs.push(r.msg)
      })
      if (msgs.length) return ok(`Task ${no} cancelled. ${msgs.join(' ')}`)
    }
    return ok(`Task ${no} cancelled.${t.lines.some((l) => l.done > 0) ? ' Confirmed lines stay recorded.' : ''}`)
  }

  function deleteTask(no: string): Result {
    const t = taskByNo(no)
    if (!t) return fail('Task not found.')
    if (taskActive(t)) return fail('Cancel the task before deleting it.')
    tasks.value = tasks.value.filter((x) => x.no !== no)
    return ok(`Task ${no} deleted.`)
  }

  // ---------- scanning
  /** Next expected scan of a line: bin first, then item / lot. */
  const nextStep = (ln: TaskLine): ScanStep | 'QTY' => (!ln.verified.bin ? 'BIN' : !ln.verified.item ? 'ITEM' : 'QTY')

  function checkBin(t: WarehouseTask, ln: TaskLine, raw: string): Result {
    const s = parseScan(raw)
    const expected = lineBin(t, ln)
    const code = s.kind === 'BIN' ? s.bin : s.kind === 'RAW' ? s.code : ''
    if (!code) return fail(`That is an item label. Scan the bin label of ${expected} first.`)
    if (code === expected.toUpperCase()) return ok(`Bin ${expected} confirmed.`)
    if (wms.bins.some((b) => b.bin.toUpperCase() === code)) return fail(`Wrong bin! Scanned ${code}, expected ${expected}.`)
    return fail(`${code} is not a registered bin. Expected ${expected}.`)
  }
  function checkItem(ln: TaskLine, raw: string): Result {
    const s = parseScan(raw)
    if (s.kind === 'BIN') return fail(`That is a bin label (${s.bin}). Scan the item / lot label of ${ln.sku}.`)
    if (s.kind === 'LOT') {
      if (s.sku !== ln.sku.toUpperCase()) return fail(`Wrong item! Scanned ${s.sku}, expected ${ln.sku}.`)
      if (normLot(s.batch).toUpperCase() !== normLot(ln.batch).toUpperCase()) return fail(`Wrong batch! Scanned ${s.batch}, expected ${ln.batch}.`)
      if (s.exp !== '-' && ln.exp !== '-' && s.exp !== ln.exp) return fail(`Wrong expiry! Label says ${s.exp}, expected ${ln.exp}.`)
      return ok(`${ln.sku} batch ${ln.batch} confirmed.`)
    }
    if (s.code === ln.sku.toUpperCase()) return ok(ln.batch !== '-' ? `${ln.sku} confirmed – check batch ${ln.batch} on the label.` : `${ln.sku} confirmed.`)
    if (ln.batch !== '-' && s.code === ln.batch.toUpperCase()) return ok(`Batch ${ln.batch} (${ln.sku}) confirmed.`)
    if (wms.bins.some((b) => b.bin.toUpperCase() === s.code)) return fail(`That is a bin code. Scan the item / lot label of ${ln.sku}.`)
    return fail(`Wrong item! Scanned ${s.code}, expected ${ln.sku}${ln.batch !== '-' ? ` batch ${ln.batch}` : ''}.`)
  }

  /** Validate a scan for the line's current step and record it. Returns the step that was checked. */
  function scan(no: string, li: number, raw: string, by = who()): Result<{ step: ScanStep; next: ScanStep | 'QTY' }> {
    const t = taskByNo(no)
    if (!t || !taskActive(t)) return fail('Task is not active.')
    const ln = t.lines[li]
    if (!ln || !lineOpen(ln)) return fail('This line is already closed.')
    const code = raw.trim()
    if (!code) return fail('Nothing scanned.')
    const step = nextStep(ln)
    if (step === 'QTY') return ok('Bin and item already confirmed – enter the qty.', { step: 'ITEM', next: 'QTY' })
    const r = step === 'BIN' ? checkBin(t, ln, code) : checkItem(ln, code)
    ln.scans.push({ ts: new Date().toISOString(), by, step, code, ok: r.ok, msg: r.msg })
    if (!t.startedAt) {
      t.startedAt = new Date().toISOString()
      log(t, 'Started', '', by)
    }
    if (!r.ok) {
      log(t, `Wrong ${step === 'BIN' ? 'bin' : 'item'} scan`, `Line ${li + 1} ${ln.sku}: ${r.msg}`, by)
      return fail(r.msg)
    }
    if (step === 'BIN') ln.verified.bin = true
    else ln.verified.item = true
    return ok(r.msg, { step, next: nextStep(ln) })
  }
  /** Clear all warehouse tasks (used by Data & Backup → reset demo data). */
  function resetTasks() {
    tasks.value = []
  }

  function resetScans(no: string, li: number) {
    const ln = taskByNo(no)?.lines[li]
    if (ln) ln.verified = { bin: false, item: false }
  }

  // ---------- execution
  /**
   * Confirm the qty moved for a line. Less than the remaining qty keeps the line open (PARTIAL),
   * unless a short reason is given – then the line closes as SHORT.
   */
  function executeLine(no: string, li: number, qtyIn: number, shortNote = '', by = who()): Result {
    const t = taskByNo(no)
    if (!t || !taskActive(t)) return fail('Task is not active.')
    const ln = t.lines[li]
    if (!ln || !lineOpen(ln)) return fail('This line is already closed.')
    if (!ln.verified.bin || !ln.verified.item) return fail('Scan the bin and the item first.')
    const qty = Math.floor(Number(qtyIn) || 0)
    const rem = lineRemaining(ln)
    if (qty < 0 || qty > rem) return fail(`Qty must be between 0 and ${rem}.`)
    if (qty === 0 && !shortNote.trim()) return fail('Enter a qty, or give a reason to close the line short.')
    const bin = lineBin(t, ln)
    if (wms.isFrozen(bin)) return fail(`Bin ${bin} is frozen by cycle count ${wms.frozenBy(bin)}. Report a problem.`)

    const snapshot = { done: ln.done, status: ln.status, problem: ln.problem, historyLen: ln.history.length }
    if (qty > 0) {
      if (t.type === 'PUTAWAY') {
        const doc = inboundDoc(t.refId)
        if (!doc?.items[ln.idx]) return fail('Inbound item not found.')
        const r = wms.executePutaway(doc.id, ln.idx, [{ bin, qty }])
        if (!r.ok) return fail(`${r.msg} Report a problem so the admin can re-plan.`)
      } else {
        const doc = outboundDoc(t.refId)
        const it = doc?.items[ln.idx]
        if (!doc || !it) return fail('Outbound item not found.')
        if (it.status !== 'ALLOCATED') return fail(`${it.sku} is no longer allocated (changed on the desktop). Report a problem.`)
        const b = wms.bin(bin)
        const lot = b ? findLot(b, ln.sku, ln.batch, ln.exp) : undefined
        const alreadyConfirmed = t.lines.filter((l) => l !== ln && l.idx === ln.idx && l.fromBin === ln.fromBin && l.batch === ln.batch && l.exp === ln.exp).reduce((a, l) => a + l.done, 0)
        if (!lot || lot.qty < alreadyConfirmed + ln.done + qty) return fail(`Only ${Math.max(0, (lot?.qty ?? 0) - alreadyConfirmed - ln.done)} of ${ln.sku} batch ${ln.batch} left in ${bin}. Report a problem.`)
      }
    }
    ln.done += qty
    ln.history.push({ ts: new Date().toISOString(), by, qty })
    if (ln.done >= ln.qty) ln.status = 'DONE'
    else if (shortNote.trim()) {
      ln.status = 'SHORT'
      ln.problem = shortNote.trim()
    } else ln.status = 'PARTIAL'
    ln.verified = { bin: false, item: false }
    if (!t.startedAt) {
      t.startedAt = new Date().toISOString()
      log(t, 'Started', '', by)
    }
    log(t, 'Line confirmed', `${li + 1}. ${ln.sku} ${qty} ${wms.skuUnit(ln.sku)} @${bin}${ln.status === 'SHORT' ? ` – short ${lineRemaining(ln)}: ${ln.problem}` : ''}`, by)

    let extra = ''
    if (t.type === 'PICK' && !t.lines.some((l) => l.idx === ln.idx && lineOpen(l))) {
      const r = finalizePickItem(t, ln.idx)
      if (!r.ok) {
        // roll the line back – the stock could not be picked
        Object.assign(ln, { done: snapshot.done, status: snapshot.status, problem: snapshot.problem })
        ln.history.length = snapshot.historyLen
        t.logs.pop()
        return fail(r.msg)
      }
      extra = ` ${r.msg}`
    }
    finishCheck(t, by)
    const verb = t.type === 'PUTAWAY' ? 'Put away' : 'Picked'
    return ok(qty > 0 ? `${verb} ${qty} ${wms.skuUnit(ln.sku)} ${ln.sku} @${bin}.${extra}` : `Line closed without qty.${extra}`)
  }

  /** Close a line as PROBLEM (bin full, damaged, not found…) so the admin can re-plan on the desktop. */
  function reportProblem(no: string, li: number, note: string, by = who()): Result {
    const t = taskByNo(no)
    if (!t || !taskActive(t)) return fail('Task is not active.')
    const ln = t.lines[li]
    if (!ln || !lineOpen(ln)) return fail('This line is already closed.')
    if (!note.trim()) return fail('Describe the problem.')
    ln.status = 'PROBLEM'
    ln.problem = note.trim()
    ln.verified = { bin: false, item: false }
    if (!t.startedAt) t.startedAt = new Date().toISOString()
    log(t, 'Problem reported', `Line ${li + 1} ${ln.sku} @${lineBin(t, ln)}: ${ln.problem}`, by)
    let extra = ''
    if (t.type === 'PICK' && !t.lines.some((l) => l.idx === ln.idx && lineOpen(l))) {
      const r = finalizePickItem(t, ln.idx)
      extra = r.msg ? ` ${r.msg}` : ''
    }
    finishCheck(t, by)
    return ok(`Problem reported to the admin.${extra}`)
  }

  return {
    tasks, workers,
    taskByNo, activeTaskFor, tasksOf, putawaySources, pickSources, inboundDoc, outboundDoc,
    previewLines, createTask, startTask, cancelTask, deleteTask,
    nextStep, scan, resetScans, executeLine, reportProblem, resetTasks,
  }
})
