<script setup lang="ts">
// Batch & Serial: per-batch traceability – where a batch is now and every movement it went through.
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import PageHeader from '../../components/PageHeader.vue'
import ExpiryTag from './ExpiryTag.vue'
import { expiryLabel, fmtDate, fmtDateTime, fmtQty } from './wmsUi'
import { EXPIRY_STATUSES, TRANSIT_ZONE, expiryStatus, normLot, useWmsStore, type ExpiryStatus, type LedgerType } from '../../stores/wmsStore'

const store = useWmsStore()
const route = useRoute()

const TYPE_COLOR: Record<LedgerType, string> = {
  OPENING: 'gray',
  'INBOUND RECEIVING': 'green',
  'INBOUND PUTAWAY': 'green',
  'INBOUND CANCELLED': 'gray',
  'OUTBOUND PICK': 'red',
  DISPATCH: 'blue',
  TRANSFER: 'gray',
  'STOCK ADJUSTMENT': 'amber',
  'CYCLE COUNT ADJ': 'amber',
}
const isAdj = (t: LedgerType) => t === 'STOCK ADJUSTMENT' || t === 'CYCLE COUNT ADJ'

const keyOf = (sku: string, batch: string, exp: string) => `${sku}|${normLot(batch)}|${normLot(exp)}`

// ---------- all known batches
interface BatchRow { key: string; sku: string; batch: string; exp: string; name: string; hasExpiry: boolean; stock: number; status: ExpiryStatus }
const batches = computed<BatchRow[]>(() => {
  const m = new Map<string, BatchRow>()
  const add = (sku: string, batch: string, exp: string) => {
    const k = keyOf(sku, batch, exp)
    if (m.has(k)) return
    const s = store.sku(sku)
    const hasExpiry = s?.hasExpiry ?? normLot(exp) !== '-'
    m.set(k, { key: k, sku, batch: normLot(batch), exp: normLot(exp), name: s?.name ?? sku, hasExpiry, stock: 0, status: expiryStatus(normLot(exp), hasExpiry) })
  }
  store.ledger.forEach((e) => add(e.sku, e.batch, e.exp))
  store.inbound.forEach((d) => d.items.forEach((it) => add(it.sku, it.batch, it.exp)))
  store.stockLots().forEach((l) => {
    add(l.sku, l.batch, l.exp)
    m.get(keyOf(l.sku, l.batch, l.exp))!.stock += l.qty
  })
  const t = (e: string) => (e === '-' ? Number.POSITIVE_INFINITY : new Date(e).getTime())
  return [...m.values()].sort((a, b) => a.sku.localeCompare(b.sku) || t(a.exp) - t(b.exp) || a.batch.localeCompare(b.batch))
})

const search = ref('')
const statusFilter = ref<ExpiryStatus[]>([])
const inStockOnly = ref(false)
const list = computed(() => {
  const q = search.value.trim().toLowerCase()
  return batches.value.filter((b) => {
    if (q && !`${b.batch} ${b.sku} ${b.name}`.toLowerCase().includes(q)) return false
    if (statusFilter.value.length && !statusFilter.value.includes(b.status)) return false
    if (inStockOnly.value && b.stock <= 0) return false
    return true
  })
})

// ---------- selection (also from route query)
const selectedKey = ref('')
function applyQuery() {
  const { sku, batch, exp } = route.query
  if (typeof sku === 'string' && sku) selectedKey.value = keyOf(sku, typeof batch === 'string' ? batch : '-', typeof exp === 'string' ? exp : '-')
}
watch(() => route.query, applyQuery, { immediate: true })

const selected = computed(() => {
  const found = batches.value.find((b) => b.key === selectedKey.value)
  if (found || !selectedKey.value) return found ?? null
  // Unknown batch from a link: still show it (no movements).
  const [sku, batch, exp] = selectedKey.value.split('|')
  const s = store.sku(sku)
  const hasExpiry = s?.hasExpiry ?? exp !== '-'
  return { key: selectedKey.value, sku, batch, exp, name: s?.name ?? sku, hasExpiry, stock: 0, status: expiryStatus(exp, hasExpiry) } as BatchRow
})

const locations = computed(() => {
  const b = selected.value
  if (!b) return []
  return store.stockLots((l) => l.sku === b.sku && l.batch === b.batch && l.exp === b.exp).sort((x, y) => x.bin.localeCompare(y.bin))
})
const currentStock = computed(() => locations.value.reduce((a, l) => a + l.qty, 0))

const history = computed(() => (selected.value ? store.batchHistory(selected.value.sku, selected.value.batch, selected.value.exp) : { rows: [], now: 0 }))
const historyDesc = computed(() => [...history.value.rows].reverse())
const totals = computed(() => {
  let inQ = 0
  let outQ = 0
  let adj = 0
  history.value.rows.forEach((e) => {
    if (isAdj(e.type)) adj += e.qty
    else if (e.qty > 0) inQ += e.qty
    else if (e.qty < 0) outQ += -e.qty
  })
  return { inQ, outQ, adj }
})

function toggleStatus(key: ExpiryStatus) {
  const i = statusFilter.value.indexOf(key)
  if (i >= 0) statusFilter.value.splice(i, 1)
  else statusFilter.value.push(key)
}

// ---------- print
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
function printCard() {
  const b = selected.value
  if (!b) return
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) {
    ElMessage.warning('The browser blocked the print window. Allow pop-ups and try again.')
    return
  }
  const locRows = locations.value.map((l) => `<tr><td>${esc(l.zone)}</td><td>${esc(l.rack)}</td><td>${esc(l.bin)}</td><td class="r">${esc(fmtQty(l.qty))}</td></tr>`).join('')
  const histRows = history.value.rows
    .map((e) => `<tr><td>${esc(fmtDateTime(e.ts))}</td><td>${esc(e.type)}</td><td>${esc(e.ref || '-')}</td><td>${esc(e.fromBin ?? '-')}</td><td>${esc(e.toBin ?? '-')}</td><td class="r">${e.qty > 0 ? esc(fmtQty(e.qty)) : ''}</td><td class="r">${e.qty < 0 ? esc(fmtQty(-e.qty)) : ''}</td><td class="r">${esc(fmtQty(e.balance))}</td><td>${esc(e.note)}</td></tr>`)
    .join('')
  const expText = b.hasExpiry && b.exp !== '-' ? `${fmtDate(b.exp)} (${expiryLabel(b.status)})` : 'No expiry'
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Batch card ${esc(b.batch)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:24px}
h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:20px 0 6px}
.meta{display:grid;grid-template-columns:140px 1fr;gap:4px 12px;margin-top:10px}
.meta b{font-weight:600;color:#555}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#f2f2f2}.r{text-align:right}.foot{margin-top:24px;font-size:10px;color:#777}
</style></head><body>
<h1>Batch Card – ${esc(b.batch)}</h1>
<div class="meta">
<b>SKU</b><span>${esc(b.sku)} – ${esc(b.name)}</span>
<b>Batch</b><span>${esc(b.batch)}</span>
<b>Expiry</b><span>${esc(expText)}</span>
<b>Current stock</b><span>${esc(fmtQty(currentStock.value))} ${esc(store.skuUnit(b.sku))}</span>
<b>Total in / out / adj.</b><span>${esc(fmtQty(totals.value.inQ))} / ${esc(fmtQty(totals.value.outQ))} / ${esc(fmtQty(totals.value.adj))}</span>
</div>
<h2>Current locations</h2>
<table><thead><tr><th>Zone</th><th>Rack</th><th>Bin</th><th class="r">Qty</th></tr></thead><tbody>${locRows || '<tr><td colspan="4">No stock</td></tr>'}</tbody></table>
<h2>Movement history</h2>
<table><thead><tr><th>Time</th><th>Type</th><th>Ref</th><th>From</th><th>To</th><th class="r">In</th><th class="r">Out</th><th class="r">Balance</th><th>Note</th></tr></thead><tbody>${histRows || '<tr><td colspan="9">No movements</td></tr>'}</tbody></table>
<div class="foot">Printed ${esc(fmtDateTime(new Date().toISOString()))}</div>
</body></html>`)
  w.document.close()
  w.focus()
  w.print()
}
</script>

<template>
  <div class="page">
    <PageHeader title="Batch & Serial" subtitle="Per-batch traceability: current locations and full movement history" />

    <div class="bs-layout">
      <div class="card bs-list">
        <el-input v-model="search" clearable placeholder="Search batch / SKU / name" />
        <div class="bs-pills">
          <button type="button" class="bs-pill" :class="{ on: !statusFilter.length }" @click="statusFilter = []">All</button>
          <button
            v-for="e in EXPIRY_STATUSES"
            :key="e.key"
            type="button"
            class="bs-pill"
            :class="{ on: statusFilter.includes(e.key) }"
            @click="toggleStatus(e.key)"
          >
            {{ e.label }}
          </button>
        </div>
        <el-checkbox v-model="inStockOnly" size="small">In stock only</el-checkbox>
        <div class="bs-count">{{ list.length }} batches</div>
        <div class="bs-items">
          <button
            v-for="b in list"
            :key="b.key"
            type="button"
            class="bs-item"
            :class="{ active: b.key === selectedKey }"
            @click="selectedKey = b.key"
          >
            <div class="bs-item-top">
              <span class="mono bs-item-batch">{{ b.batch }}</span>
              <span class="bs-item-stock" :class="{ zero: b.stock <= 0 }">{{ fmtQty(b.stock) }}</span>
            </div>
            <div class="bs-item-name">{{ b.sku }} · {{ b.name }}</div>
            <div class="bs-item-exp">
              <span>{{ fmtDate(b.exp) }}</span>
              <ExpiryTag :exp="b.exp" :has-expiry="b.hasExpiry" />
            </div>
          </button>
          <div v-if="!list.length" class="bs-empty">No batches match the filter.</div>
        </div>
      </div>

      <div class="bs-detail">
        <div v-if="!selected" class="card bs-placeholder">Select a batch on the left to see where it is and how it moved.</div>
        <template v-else>
          <div class="card">
            <div class="bs-head">
              <div>
                <div class="bs-label">Batch</div>
                <div class="bs-batch mono">{{ selected.batch }}</div>
                <div class="bs-sku"><span class="mono">{{ selected.sku }}</span> · {{ selected.name }}</div>
              </div>
              <el-button @click="printCard">Print</el-button>
            </div>
            <div class="bs-stats">
              <div>
                <div class="bs-label">Expiry</div>
                <div class="bs-val">{{ fmtDate(selected.exp) }}</div>
                <ExpiryTag :exp="selected.exp" :has-expiry="selected.hasExpiry" show-days />
              </div>
              <div>
                <div class="bs-label">Current stock</div>
                <div class="bs-val">{{ fmtQty(currentStock) }} <small>{{ store.skuUnit(selected.sku) }}</small></div>
              </div>
              <div>
                <div class="bs-label">Total in</div>
                <div class="bs-val pos">+{{ fmtQty(totals.inQ) }}</div>
              </div>
              <div>
                <div class="bs-label">Total out</div>
                <div class="bs-val neg">-{{ fmtQty(totals.outQ) }}</div>
              </div>
              <div>
                <div class="bs-label">Adjustments</div>
                <div class="bs-val" :class="totals.adj > 0 ? 'pos' : totals.adj < 0 ? 'neg' : ''">{{ totals.adj > 0 ? '+' : '' }}{{ fmtQty(totals.adj) }}</div>
              </div>
            </div>
          </div>

          <div class="card">
            <h3 class="bs-title">Current locations</h3>
            <el-table :data="locations" size="small" empty-text="Not in stock">
              <el-table-column label="Zone" prop="zone" min-width="120" />
              <el-table-column label="Rack" prop="rack" width="90" />
              <el-table-column label="Bin" min-width="140">
                <template #default="{ row }">
                  <span class="mono">{{ row.bin }}</span>
                  <span v-if="row.zone === TRANSIT_ZONE" class="status-pill amber bs-ml">TRANSIT</span>
                </template>
              </el-table-column>
              <el-table-column label="Qty" align="right" width="110">
                <template #default="{ row }">{{ fmtQty(row.qty) }}</template>
              </el-table-column>
            </el-table>
          </div>

          <div class="card">
            <h3 class="bs-title">Movement history</h3>
            <el-table :data="historyDesc" size="small" empty-text="No movements recorded">
              <el-table-column label="Time" width="140">
                <template #default="{ row }">{{ fmtDateTime(row.ts) }}</template>
              </el-table-column>
              <el-table-column label="Type" width="165">
                <template #default="{ row }"><span class="status-pill" :class="TYPE_COLOR[row.type as LedgerType]">{{ row.type }}</span></template>
              </el-table-column>
              <el-table-column label="Ref" min-width="110">
                <template #default="{ row }"><span class="mono">{{ row.ref || '-' }}</span></template>
              </el-table-column>
              <el-table-column label="From" min-width="90">
                <template #default="{ row }"><span class="mono">{{ row.fromBin ?? '–' }}</span></template>
              </el-table-column>
              <el-table-column label="To" min-width="90">
                <template #default="{ row }"><span class="mono">{{ row.toBin ?? '–' }}</span></template>
              </el-table-column>
              <el-table-column label="In" align="right" width="70">
                <template #default="{ row }"><span v-if="row.qty > 0" class="pos">{{ fmtQty(row.qty) }}</span></template>
              </el-table-column>
              <el-table-column label="Out" align="right" width="70">
                <template #default="{ row }"><span v-if="row.qty < 0" class="neg">{{ fmtQty(-row.qty) }}</span></template>
              </el-table-column>
              <el-table-column label="Balance" align="right" width="90">
                <template #default="{ row }"><b>{{ fmtQty(row.balance) }}</b></template>
              </el-table-column>
              <el-table-column label="Note" prop="note" min-width="120" show-overflow-tooltip />
            </el-table>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bs-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.bs-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: sticky;
  top: 12px;
}
.bs-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.bs-pill {
  border: 1px solid var(--border-soft);
  background: var(--bg-card);
  color: var(--gray-600);
  font-size: 11px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  cursor: pointer;
}
.bs-pill.on {
  background: var(--brand-light);
  border-color: var(--brand);
  color: var(--brand);
}
.bs-count {
  font-size: 12px;
  color: var(--gray-500);
}
.bs-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: calc(100vh - 340px);
  min-height: 200px;
  overflow-y: auto;
}
.bs-item {
  text-align: left;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  padding: 8px 10px;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.bs-item:hover {
  background: var(--gray-50);
}
.bs-item.active {
  border-color: var(--brand);
  background: var(--brand-light);
}
.bs-item-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.bs-item-batch {
  font-weight: 700;
  color: var(--gray-900);
}
.bs-item-stock {
  font-weight: 700;
  color: var(--gray-800);
}
.bs-item-stock.zero {
  color: var(--gray-400);
}
.bs-item-name {
  font-size: 12px;
  color: var(--gray-600);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bs-item-exp {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--gray-500);
}
.bs-empty,
.bs-placeholder {
  color: var(--gray-500);
  font-size: 13px;
}
.bs-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.bs-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.bs-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--gray-500);
}
.bs-batch {
  font-size: 22px;
  font-weight: 700;
  color: var(--gray-900);
}
.bs-sku {
  color: var(--gray-600);
  margin-top: 2px;
}
.bs-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-soft);
}
.bs-val {
  font-size: 18px;
  font-weight: 700;
  color: var(--gray-900);
  margin: 4px 0;
}
.bs-val small {
  font-size: 12px;
  font-weight: 500;
  color: var(--gray-500);
}
.bs-title {
  margin: 0 0 10px;
  font-size: 15px;
}
.bs-ml {
  margin-left: 6px;
}
.pos {
  color: #15803d;
}
.neg {
  color: #b91c1c;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
@media (max-width: 960px) {
  .bs-layout {
    grid-template-columns: 1fr;
  }
  .bs-list {
    position: static;
  }
  .bs-items {
    max-height: 320px;
  }
  .bs-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
