// Excel / CSV import for WMS master data: SKU master, bins and opening stock balance.
// Each spec describes its columns (header + aliases), a template, and per-row validation.
// Rows are validated against the current store state; only valid rows are committed, via the public store API.
import * as XLSX from 'xlsx'
import { TRANSIT_ZONE, expiryStatus, todayISO, useWmsStore, type Sku } from '../../stores/wmsStore'

export type ImportKind = 'sku' | 'bin' | 'opening'
export type RowStatus = 'NEW' | 'UPDATE' | 'SKIP' | 'ERROR'

export interface ImportColumn {
  key: string
  label: string
  aliases: string[]
  required: boolean
  note?: string
}
export interface ImportOptions {
  updateExisting: boolean
}
export interface ValidatedRow {
  line: number // spreadsheet row number (header = 1)
  raw: Record<string, string>
  status: RowStatus
  errors: string[]
  notes: string[]
  normalized: Record<string, unknown>
}
export interface ImportSpec {
  kind: ImportKind
  title: string
  commitLabel: string
  fileName: string
  hint: string
  columns: ImportColumn[]
  examples: (string | number)[][]
  /** Whether the "update existing" option applies, and its label / default. */
  updateOption?: { label: string; default: boolean }
}
export interface CommitResult {
  created: number
  updated: number
  failed: { line: number; msg: string }[]
  summary: string
}

type Store = ReturnType<typeof useWmsStore>

// ---------- specs
export const IMPORT_SPECS: Record<ImportKind, ImportSpec> = {
  sku: {
    kind: 'sku',
    title: 'Import SKU master',
    commitLabel: 'Import SKUs',
    fileName: 'template-sku-master.xlsx',
    hint: 'Leave SKU empty to generate the code from the category prefix.',
    columns: [
      { key: 'sku', label: 'SKU', aliases: ['sku', 'sku code', 'code', 'kode sku', 'kode'], required: false, note: 'empty = auto from category' },
      { key: 'name', label: 'Name', aliases: ['name', 'product', 'product name', 'nama', 'nama produk'], required: true },
      { key: 'category', label: 'Category', aliases: ['category', 'cat', 'category id', 'kategori'], required: true, note: 'category code or name, e.g. RAW' },
      { key: 'unit', label: 'Unit', aliases: ['unit', 'uom', 'satuan'], required: true },
      { key: 'price', label: 'Purchase price', aliases: ['purchase price', 'price', 'cost', 'buy price', 'harga beli', 'harga'], required: true, note: 'number > 0' },
      { key: 'sellPrice', label: 'Sell price', aliases: ['sell price', 'sellprice', 'selling price', 'harga jual'], required: false, note: 'number, optional' },
      { key: 'hasBatch', label: 'Batch (Y/N)', aliases: ['batch (y/n)', 'batch', 'has batch', 'hasbatch'], required: false, note: 'Y/N, default Y' },
      { key: 'hasExpiry', label: 'Expiry (Y/N)', aliases: ['expiry (y/n)', 'expiry', 'has expiry', 'hasexpiry', 'ed'], required: false, note: 'Y/N, default Y' },
    ],
    examples: [
      ['', 'Fragrance Oil Noir (1 Kg)', 'RAW', 'Kg', 890000, 950000, 'Y', 'Y'],
      ['PKG-99', 'Magnetic Bottle Cap Black', 'PKG', 'Pcs', 2500, 3500, 'Y', 'N'],
    ],
    updateOption: { label: 'Update SKUs that already exist (otherwise they are skipped)', default: true },
  },
  bin: {
    kind: 'bin',
    title: 'Import bins',
    commitLabel: 'Import bins',
    fileName: 'template-bins.xlsx',
    hint: 'Bin code may be the short code (B1) or the full code (A1-R3-B1). Capacity cannot go below the stock already in a bin.',
    columns: [
      { key: 'zone', label: 'Zone', aliases: ['zone', 'zone id', 'zona'], required: true, note: 'zone code or name, e.g. Zone A' },
      { key: 'rack', label: 'Rack', aliases: ['rack', 'rak'], required: true, note: 'e.g. R3' },
      { key: 'bin', label: 'Bin code', aliases: ['bin code', 'bin', 'code', 'kode bin', 'location'], required: true, note: 'e.g. B1 or A1-R3-B1' },
      { key: 'capacity', label: 'Capacity', aliases: ['capacity', 'cap', 'capacity (units)', 'kapasitas'], required: true, note: 'units, > 0' },
    ],
    examples: [
      ['Zone A', 'R3', 'B1', 300],
      ['Zone C', 'R2', 'B2', 600],
    ],
    updateOption: { label: 'Update zone / capacity of bins that already exist (otherwise they are skipped)', default: false },
  },
  opening: {
    kind: 'opening',
    title: 'Import opening balance',
    commitLabel: 'Import opening balance',
    fileName: 'template-opening-balance.xlsx',
    hint: 'Stock is received on an OPENING inbound document (supplier "Opening balance") and put away straight into the given bins. Expired lots and frozen bins are rejected.',
    columns: [
      { key: 'sku', label: 'SKU', aliases: ['sku', 'sku code', 'code', 'kode sku'], required: true },
      { key: 'bin', label: 'Bin', aliases: ['bin', 'bin code', 'location', 'lokasi bin', 'lokasi'], required: true, note: 'full bin code, e.g. A1-R1-B1' },
      { key: 'batch', label: 'Batch', aliases: ['batch', 'batch no', 'lot', 'no batch'], required: false, note: 'required when the SKU uses batches' },
      { key: 'exp', label: 'Expiry date', aliases: ['expiry date', 'exp', 'expiry', 'expired date', 'ed', 'tgl kadaluarsa'], required: false, note: 'yyyy-mm-dd or dd-mm-yyyy; required when the SKU uses expiry' },
      { key: 'qty', label: 'Qty', aliases: ['qty', 'quantity', 'stock', 'jumlah'], required: true, note: 'number > 0' },
    ],
    examples: [
      ['RAW-01', 'A1-R1-B1', 'FO-2610-01', '2027-08-15', 100],
      ['PKG-03', 'B1-R1-B2', '', '', 500],
    ],
  },
}

// ---------- template
export function downloadTemplate(kind: ImportKind) {
  const spec = IMPORT_SPECS[kind]
  const aoa: (string | number)[][] = [spec.columns.map((c) => c.label), ...spec.examples]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = spec.columns.map((_, ci) => ({ wch: Math.max(14, ...aoa.map((r) => String(r[ci] ?? '').length + 4)) }))
  const info = XLSX.utils.aoa_to_sheet([
    ['Instructions'],
    ['The first row is the header – keep the column names.'],
    ['Example rows may be deleted or overwritten with your data.'],
    ...spec.columns.map((c) => [`${c.label}${c.required ? ' (required)' : ''}${c.note ? ` – ${c.note}` : ''}`]),
    ['Save as .xlsx (or .csv) and upload it in the Import dialog.'],
  ])
  info['!cols'] = [{ wch: 90 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Template')
  XLSX.utils.book_append_sheet(wb, info, 'Instructions')
  XLSX.writeFile(wb, spec.fileName)
}

// ---------- reading
export interface ParsedFile {
  rows: { line: number; raw: Record<string, string> }[]
  missing: string[] // labels of required columns not found
}

/** Read the first sheet of an .xlsx / .xls / .csv file into rows keyed by column key. */
export async function readImportFile(file: File, kind: ImportKind): Promise<ParsedFile> {
  const isCsv = /\.(csv|txt)$/i.test(file.name)
  const wb = isCsv
    ? XLSX.read(await file.text(), { type: 'string', raw: true })
    : XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0] ?? '']
  if (!ws) return { rows: [], missing: [] }
  // Raw values: real Excel dates arrive as Date objects (formatted text would follow the cell's locale format).
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' })
  return mapMatrix(matrix.map((r) => r.map(cellText)), kind)
}
function cellText(v: unknown): string {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return ''
    // round to the nearest day to absorb sub-minute timezone drift in Excel serial dates
    const d = new Date(v.getTime() + 12 * 3600 * 1000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return v === null || v === undefined ? '' : String(v)
}

function mapMatrix(matrix: unknown[][], kind: ImportKind): ParsedFile {
  const spec = IMPORT_SPECS[kind]
  if (!matrix.length) return { rows: [], missing: [] }
  const header = (matrix[0] ?? []).map((h) => String(h ?? '').trim().toLowerCase())
  const idx: Record<string, number> = {}
  spec.columns.forEach((c) => {
    const i = header.findIndex((h) => h === c.label.toLowerCase() || h === c.key.toLowerCase() || c.aliases.includes(h))
    if (i >= 0) idx[c.key] = i
  })
  const missing = spec.columns.filter((c) => c.required && idx[c.key] === undefined).map((c) => c.label)
  if (missing.length) return { rows: [], missing }
  const rows = matrix
    .slice(1)
    .map((r, i) => {
      const raw: Record<string, string> = {}
      spec.columns.forEach((c) => {
        const j = idx[c.key]
        raw[c.key] = j === undefined ? '' : String(r[j] ?? '').trim()
      })
      return { line: i + 2, raw }
    })
    .filter((r) => Object.values(r.raw).some((v) => v !== ''))
  return { rows, missing: [] }
}

// ---------- value parsers
/** "890000", "890,000", "890.000", "Rp 890.000" → 890000; NaN when not a number. */
export function parseNum(v: string): number {
  let s = v.replace(/rp/i, '').replace(/\s/g, '')
  if (!s) return Number.NaN
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.') // 1.234.567,5
  else s = s.replace(/,/g, '')
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : Number.NaN
}
/** Y/N style flag; empty → default, unknown → null. */
export function parseYesNo(v: string, def: boolean): boolean | null {
  const s = v.trim().toLowerCase()
  if (!s) return def
  if (['y', 'yes', 'ya', '1', 'true', 'x', 'v'].includes(s)) return true
  if (['n', 'no', 'tidak', 't', '0', 'false', '-'].includes(s)) return false
  return null
}
function validYmd(y: number, m: number, d: number): string | null {
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
/** yyyy-mm-dd, dd-mm-yyyy, dd/mm/yyyy, dd.mm.yy → "yyyy-mm-dd"; null when invalid. */
export function parseDate(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s)
  if (m) return validYmd(+m[1]!, +m[2]!, +m[3]!)
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s)
  if (m) return validYmd(+m[3]!, +m[2]!, +m[1]!)
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/.exec(s)
  if (m) return validYmd(2000 + +m[3]!, +m[2]!, +m[1]!)
  return null
}
const CODE_RE = /^[A-Z0-9\-/_.]+$/

// ---------- validation
function finish(line: number, raw: Record<string, string>, errors: string[], notes: string[], normalized: Record<string, unknown>, status: RowStatus): ValidatedRow {
  return { line, raw, errors, notes, normalized, status: errors.length ? 'ERROR' : status }
}

function validateSku(rows: ParsedFile['rows'], opts: ImportOptions, store: Store): ValidatedRow[] {
  const seen = new Set<string>()
  return rows.map(({ line, raw }) => {
    const errors: string[] = []
    const notes: string[] = []
    const q = raw.category!.toLowerCase()
    const cat = store.categories.find((c) => c.id.toLowerCase() === q || c.name.toLowerCase() === q)
    if (!raw.name) errors.push('Name is empty')
    if (!raw.category) errors.push('Category is empty')
    else if (!cat) errors.push(`Unknown category '${raw.category}'`)
    if (!raw.unit) errors.push('Unit is empty')
    const price = parseNum(raw.price!)
    if (!(price > 0)) errors.push('Purchase price must be a number > 0')
    const sell = raw.sellPrice ? parseNum(raw.sellPrice) : null
    if (sell !== null && !(sell >= 0)) errors.push('Sell price is not a number')
    const hasBatch = parseYesNo(raw.hasBatch!, true)
    const hasExpiry = parseYesNo(raw.hasExpiry!, true)
    if (hasBatch === null) errors.push('Batch must be Y or N')
    if (hasExpiry === null) errors.push('Expiry must be Y or N')
    const code = raw.sku!.toUpperCase()
    let status: RowStatus = 'NEW'
    if (code) {
      if (!CODE_RE.test(code)) errors.push('Invalid SKU code format')
      if (seen.has(code)) errors.push('Duplicate SKU in file')
      seen.add(code)
      if (store.sku(code)) {
        if (opts.updateExisting) { status = 'UPDATE'; notes.push('Updates the existing SKU') }
        else { status = 'SKIP'; notes.push('Already exists – skipped') }
      }
    } else notes.push('Code generated from category')
    return finish(line, raw, errors, notes, { sku: code, name: raw.name, category: cat?.id, unit: raw.unit, price, sellPrice: sell, hasBatch, hasExpiry }, status)
  })
}

function validateBin(rows: ParsedFile['rows'], opts: ImportOptions, store: Store): ValidatedRow[] {
  const seen = new Set<string>()
  return rows.map(({ line, raw }) => {
    const errors: string[] = []
    const notes: string[] = []
    const zq = raw.zone!.toLowerCase()
    const zone = store.zones.find((z) => z.id.toLowerCase() === zq || z.name.toLowerCase() === zq)
    if (!raw.zone) errors.push('Zone is empty')
    else if (!zone) errors.push(`Unknown zone '${raw.zone}'`)
    else if (zone.id === TRANSIT_ZONE) errors.push('Bins cannot be added to the transit zone')
    const rack = raw.rack!.toUpperCase()
    const given = raw.bin!.toUpperCase()
    if (!rack) errors.push('Rack is empty')
    if (!given || !CODE_RE.test(given)) errors.push('Bin code is empty or has an invalid format')
    const capacity = parseNum(raw.capacity!)
    if (!(capacity > 0) || !Number.isInteger(capacity)) errors.push('Capacity must be a whole number > 0')
    // An existing full code wins; otherwise the full code is built like "Add bin" does.
    let full = given
    let short = given
    if (!store.bin(given) && zone) {
      const pre = `${zone.prefix}-${rack}-`
      short = given.startsWith(pre) ? given.slice(pre.length) : given
      full = `${pre}${short}`
    }
    if (full && seen.has(full)) errors.push('Duplicate bin in file')
    seen.add(full)
    const exist = store.bin(full)
    let status: RowStatus = 'NEW'
    if (exist) {
      if (exist.zone === TRANSIT_ZONE) errors.push('The transit bin cannot be changed')
      else if (!opts.updateExisting) { status = 'SKIP'; notes.push('Already exists – skipped') }
      else {
        const qty = exist.lots.reduce((a, l) => a + l.qty, 0)
        if (capacity < qty) errors.push(`Capacity below current stock (${qty})`)
        status = 'UPDATE'
        notes.push('Updates the existing bin')
      }
    }
    return finish(line, raw, errors, notes, { zone: zone?.id, rack, code: short, full, capacity }, status)
  })
}

function validateOpening(rows: ParsedFile['rows'], store: Store): ValidatedRow[] {
  const seen = new Set<string>()
  const out = rows.map(({ line, raw }) => {
    const errors: string[] = []
    const notes: string[] = []
    const s = store.sku(raw.sku!.toUpperCase())
    const b = store.bin(raw.bin!.toUpperCase())
    if (!raw.sku) errors.push('SKU is empty')
    else if (!s) errors.push(`Unknown SKU '${raw.sku}'`)
    else if (s.inactive) errors.push('SKU is inactive')
    if (!raw.bin) errors.push('Bin is empty')
    else if (!b) errors.push(`Unknown bin '${raw.bin}'`)
    else if (b.zone === TRANSIT_ZONE) errors.push('The transit bin is not allowed')
    else if (store.isFrozen(b.bin)) errors.push(`Bin is frozen by cycle count ${store.frozenBy(b.bin)}`)
    const qty = parseNum(raw.qty!)
    if (!(qty > 0) || !Number.isInteger(qty)) errors.push('Qty must be a whole number > 0')
    let batch = '-'
    let exp = '-'
    if (s) {
      if (s.hasBatch) {
        batch = raw.batch!
        if (!batch) errors.push('Batch is required for this SKU')
      } else if (raw.batch) notes.push('Batch ignored (SKU has no batch)')
      if (s.hasExpiry) {
        const d = parseDate(raw.exp!)
        if (!raw.exp) errors.push('Expiry date is required for this SKU')
        else if (!d) errors.push(`Invalid date '${raw.exp}'`)
        else if (expiryStatus(d) === 'EXPIRED') errors.push('Already expired – cannot be received')
        else exp = d
      } else if (raw.exp) notes.push('Expiry ignored (SKU has no expiry)')
    }
    const key = `${s?.sku ?? raw.sku}|${b?.bin ?? raw.bin}|${batch}|${exp}`
    if (seen.has(key)) errors.push('Duplicate SKU / bin / batch / expiry in file')
    seen.add(key)
    return finish(line, raw, errors, notes, { sku: s?.sku, bin: b?.bin, batch, exp, qty }, 'NEW')
  })
  // Capacity check per bin over all valid rows.
  const need: Record<string, number> = {}
  out.filter((r) => r.status !== 'ERROR').forEach((r) => { const bin = r.normalized.bin as string; need[bin] = (need[bin] ?? 0) + (r.normalized.qty as number) })
  Object.entries(need).forEach(([code, total]) => {
    const b = store.bin(code)!
    const room = Math.max(0, b.capacity - b.lots.reduce((a, l) => a + l.qty, 0))
    if (total > room) out.filter((r) => r.normalized.bin === code && r.status !== 'ERROR').forEach((r) => {
      r.errors.push(`Total ${total} exceeds the free capacity of ${code} (${room})`)
      r.status = 'ERROR'
    })
  })
  return out
}

export function validateImport(kind: ImportKind, rows: ParsedFile['rows'], opts: ImportOptions, store: Store): ValidatedRow[] {
  if (kind === 'sku') return validateSku(rows, opts, store)
  if (kind === 'bin') return validateBin(rows, opts, store)
  return validateOpening(rows, store)
}
export const isCommittable = (r: ValidatedRow) => r.status === 'NEW' || r.status === 'UPDATE'

// ---------- commit
export function commitImport(kind: ImportKind, rows: ValidatedRow[], store: Store): CommitResult {
  const todo = rows.filter(isCommittable)
  const res: CommitResult = { created: 0, updated: 0, failed: [], summary: '' }
  if (kind === 'sku') {
    todo.forEach((r) => {
      const n = r.normalized
      const existing = r.status === 'UPDATE' ? store.sku(n.sku as string) : undefined
      const data: Sku = {
        sku: (n.sku as string) || store.nextSkuCode(n.category as string),
        name: n.name as string,
        category: n.category as string,
        unit: n.unit as string,
        price: n.price as number,
        sellPrice: (n.sellPrice as number | null) ?? existing?.sellPrice ?? 0,
        hasBatch: n.hasBatch as boolean,
        hasExpiry: n.hasExpiry as boolean,
        inactive: existing?.inactive ?? false,
      }
      const out = store.saveSku(data, existing?.sku)
      if (!out.ok) res.failed.push({ line: r.line, msg: out.msg })
      else if (existing) res.updated++
      else res.created++
    })
    res.summary = `SKU import done: ${res.created} created, ${res.updated} updated.`
  } else if (kind === 'bin') {
    todo.forEach((r) => {
      const n = r.normalized
      const out = r.status === 'UPDATE'
        ? store.saveBin({ zone: n.zone as string, rack: n.rack as string, code: n.full as string, capacity: n.capacity as number }, n.full as string)
        : store.saveBin({ zone: n.zone as string, rack: n.rack as string, code: n.code as string, capacity: n.capacity as number })
      if (!out.ok) res.failed.push({ line: r.line, msg: out.msg })
      else if (r.status === 'UPDATE') res.updated++
      else res.created++
    })
    res.summary = `Bin import done: ${res.created} created, ${res.updated} updated.`
  } else {
    commitOpening(todo, store, res)
  }
  if (res.failed.length) res.summary += ` ${res.failed.length} row(s) failed.`
  return res
}

export const OPENING_SUPPLIER = 'Opening balance'

/** One OPENING inbound document (one line per SKU / batch / expiry), then put away each line into its bins. */
function commitOpening(todo: ValidatedRow[], store: Store, res: CommitResult) {
  if (!todo.length) { res.summary = 'Nothing to import.'; return }
  if (!store.contacts.some((c) => c.type === 'SUPPLIER' && c.name === OPENING_SUPPLIER)) store.saveContact({ name: OPENING_SUPPLIER, type: 'SUPPLIER' })
  const groups = new Map<string, { sku: string; batch: string; exp: string; rows: ValidatedRow[] }>()
  todo.forEach((r) => {
    const n = r.normalized
    const key = `${n.sku}|${n.batch}|${n.exp}`
    if (!groups.has(key)) groups.set(key, { sku: n.sku as string, batch: n.batch as string, exp: n.exp as string, rows: [] })
    groups.get(key)!.rows.push(r)
  })
  const items = [...groups.values()].map((g) => ({ sku: g.sku, batch: g.batch === '-' ? '' : g.batch, exp: g.exp === '-' ? '' : g.exp, qty: g.rows.reduce((a, r) => a + (r.normalized.qty as number), 0) }))
  const no = store.nextDocNo('OPENING', store.inbound.map((d) => d.no))
  const created = store.createInbound({ no, poRef: `OPENING ${todayISO()}`, supplier: OPENING_SUPPLIER, items })
  if (!created.ok || !created.data) {
    todo.forEach((r) => res.failed.push({ line: r.line, msg: created.msg }))
    res.summary = 'Opening balance import failed.'
    return
  }
  const docId = created.data.id
  let units = 0
  ;[...groups.values()].forEach((g, idx) => {
    const plan = g.rows.map((r) => ({ bin: r.normalized.bin as string, qty: r.normalized.qty as number }))
    const out = store.executePutaway(docId, idx, plan)
    if (out.ok) {
      res.created += g.rows.length
      units += plan.reduce((a, p) => a + p.qty, 0)
    } else g.rows.forEach((r) => res.failed.push({ line: r.line, msg: `${out.msg} (left in transit on ${no})` }))
  })
  res.summary = `Opening balance imported on ${no}: ${res.created} row(s), ${units.toLocaleString('id-ID')} units put away.`
}
