<script setup lang="ts">
// Warehouse dashboard (same layout as the original WMS prototype): stock value, bin occupancy,
// inbound/outbound pending and FEFO alert KPIs, value per category (click a bar to filter),
// unit distribution, and the FEFO risk queue (expired / < 3 months).
// Shown on Home as the "Warehouse" view (embedded: Home supplies the page header).
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Download, Plus, Search, TopRight } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import DonutChart from '../../components/charts/DonutChart.vue'
import { SERIES_COLORS, formatCompact, type ChartDatum } from '../../components/charts/chartUtils'
import {
  TRANSIT_ZONE,
  binQty,
  binStatus,
  expiryStatus,
  inboundStatus,
  useWmsStore,
  type ExpiryStatus,
} from '../../stores/wmsStore'
import { useAccessStore } from '../../stores/accessStore'
import ExpiryTag from './ExpiryTag.vue'
import { fmtDate, fmtQty, fmtRp } from './wmsUi'
import { printDashboardReport } from './wmsPrint'

withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

const store = useWmsStore()
const access = useAccessStore()
const router = useRouter()

/** Category filter for the value / occupancy KPIs (null = all), set by clicking a bar or chip. */
const activeCat = ref<string | null>(null)
function toggleCat(id: string) {
  activeCat.value = activeCat.value === id ? null : id
}

const catOf = (code: string) => store.sku(code)?.category ?? ''
const inCat = (code: string) => !activeCat.value || catOf(code) === activeCat.value
const catName = (id: string) => store.category(id)?.name ?? id

/** Lots on shelves (excluding transit). */
const shelfLots = computed(() => store.stockLots((l) => l.zone !== TRANSIT_ZONE))

// ---------- KPIs
const stockValue = computed(() =>
  shelfLots.value.filter((l) => inCat(l.sku)).reduce((a, l) => a + l.qty * (store.sku(l.sku)?.price ?? 0), 0),
)
const skuCountText = computed(() =>
  activeCat.value
    ? `${store.skus.filter((s) => s.category === activeCat.value).length} SKUs in ${catName(activeCat.value)} · click for all SKUs`
    : `${store.skus.filter((s) => !s.inactive).length} active SKUs · click for Top 5`,
)
function openValueDrill() {
  if (activeCat.value) openCatSku(activeCat.value)
  else topSkuOpen.value = true
}

/** Storage bins in scope: all, or those in the selected category's zone. */
const scopeBins = computed(() => {
  if (!activeCat.value) return store.storageBins
  const zone = store.category(activeCat.value)?.zone
  return store.storageBins.filter((b) => b.zone === zone)
})
const occupancy = computed(() => {
  const capacity = scopeBins.value.reduce((a, b) => a + b.capacity, 0)
  const units = !activeCat.value
    ? scopeBins.value.reduce((a, b) => a + binQty(b), 0)
    : shelfLots.value.filter((l) => inCat(l.sku)).reduce((a, l) => a + l.qty, 0)
  const full = scopeBins.value.filter((b) => binStatus(b) === 'full').length
  return {
    pct: capacity ? Math.round((units / capacity) * 1000) / 10 : 0,
    units,
    capacity,
    full,
    available: scopeBins.value.filter((b) => binStatus(b) === 'available').length,
    note: activeCat.value ? `${store.category(activeCat.value)?.zone ?? '-'} · ${fmtQty(units)} / ${fmtQty(capacity)}` : `${fmtQty(units)} / ${fmtQty(capacity)} units`,
  }
})
function goToBins(status: 'full' | 'available') {
  router.push({ path: '/inventory/rack-map', query: { status } })
}

const inboundPending = computed(() => store.inbound.filter((d) => inboundStatus(d) !== 'PUTAWAY COMPLETE').length)
const outboundPending = computed(() => store.outbound.filter((d) => !d.dispatched).length)

const hasExpiry = (code: string) => store.sku(code)?.hasExpiry ?? false
const lotExpiry = (l: { sku: string; exp: string }): ExpiryStatus => expiryStatus(l.exp, hasExpiry(l.sku))

// ---------- charts (always across all categories)
const byCategory = computed(() =>
  store.categories.map((c) => {
    const lots = shelfLots.value.filter((l) => catOf(l.sku) === c.id)
    return {
      id: c.id,
      label: c.name,
      value: lots.reduce((a, l) => a + l.qty * (store.sku(l.sku)?.price ?? 0), 0),
      units: lots.reduce((a, l) => a + l.qty, 0),
    }
  }),
)
/** Value bars, ranked; clicking a bar filters the value / occupancy KPIs to that category. */
const valueRows = computed(() => {
  const sorted = [...byCategory.value].sort((a, b) => b.value - a.value)
  const max = Math.max(...sorted.map((c) => c.value), 0) || 1
  return sorted.map((c) => ({
    ...c,
    width: `${Math.max((c.value / max) * 100, 1.5)}%`,
    color: activeCat.value && activeCat.value !== c.id ? '#c7d6e2' : SERIES_COLORS[0],
  }))
})
const unitsChart = computed<ChartDatum[]>(() => byCategory.value.map((c) => ({ label: c.label, value: c.units })))

// ---------- SKU drill-down (stock value = shelf on-hand × purchase price)
interface SkuValueRow { sku: string; name: string; unit: string; onHand: number; price: number; value: number; share: number }
/** Per category: every SKU with its shelf stock value, highest value first. */
const skuValuesByCat = computed(() => {
  const onHand = new Map<string, number>()
  shelfLots.value.forEach((l) => onHand.set(l.sku, (onHand.get(l.sku) ?? 0) + l.qty))
  const out = new Map<string, { rows: SkuValueRow[]; total: number; units: number }>()
  store.categories.forEach((c) => {
    const rows = store.skus
      .filter((s) => s.category === c.id)
      .map((s) => {
        const qty = onHand.get(s.sku) ?? 0
        return { sku: s.sku, name: s.name, unit: s.unit, onHand: qty, price: s.price, value: qty * s.price, share: 0 }
      })
    const total = rows.reduce((a, r) => a + r.value, 0)
    rows.forEach((r) => (r.share = total ? (r.value / total) * 100 : 0))
    rows.sort((a, b) => b.value - a.value || a.sku.localeCompare(b.sku))
    out.set(c.id, { rows, total, units: rows.reduce((a, r) => a + r.onHand, 0) })
  })
  return out
})
const fmtPct = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`

const catSkuOpen = ref(false)
const catSkuId = ref('')
const catSkuSearch = ref('')
function openCatSku(id: string) {
  catSkuId.value = id
  catSkuSearch.value = ''
  catSkuOpen.value = true
}
const catSkuName = computed(() => catName(catSkuId.value))
const catSkuData = computed(() => skuValuesByCat.value.get(catSkuId.value) ?? { rows: [], total: 0, units: 0 })
const catSkuRows = computed(() => {
  const q = catSkuSearch.value.trim().toLowerCase()
  return q ? catSkuData.value.rows.filter((r) => `${r.sku} ${r.name}`.toLowerCase().includes(q)) : catSkuData.value.rows
})
const catSkuTotals = computed(() => ({
  value: catSkuRows.value.reduce((a, r) => a + r.value, 0),
  share: catSkuRows.value.reduce((a, r) => a + r.share, 0),
}))

const topSkuOpen = ref(false)
const topSkuCards = computed(() =>
  store.categories.map((c) => {
    const d = skuValuesByCat.value.get(c.id) ?? { rows: [], total: 0, units: 0 }
    return { id: c.id, name: c.name, total: d.total, count: d.rows.length, top: d.rows.filter((r) => r.value > 0).slice(0, 5) }
  }),
)

function openSku(sku: string) {
  catSkuOpen.value = false
  topSkuOpen.value = false
  router.push({ path: '/inventory/stock-balance', query: { sku } })
}

// ---------- FEFO risk queue: expired and < 3 months only, with its own category filter
const riskLots = computed(() =>
  shelfLots.value
    .filter((l) => hasExpiry(l.sku) && ['EXPIRED', '<3M'].includes(lotExpiry(l)))
    .sort((a, b) => a.exp.localeCompare(b.exp))
    .map((l) => ({ ...l, category: catOf(l.sku), name: store.skuName(l.sku), unit: store.skuUnit(l.sku) })),
)
/** Only categories that have SKUs with an expiry date, with their number of risky batches. */
const fefoCatOptions = computed(() => {
  const cats = [...new Set(store.skus.filter((s) => s.hasExpiry).map((s) => s.category))]
  return cats.map((id) => ({ id, label: `${id} – ${catName(id)} (${riskLots.value.filter((l) => l.category === id).length})` }))
})
const fefoCat = ref('ALL')
const fefoQueue = computed(() => (fefoCat.value !== 'ALL' ? riskLots.value.filter((l) => l.category === fefoCat.value) : riskLots.value))
const fefoInfo = computed(() =>
  fefoCat.value !== 'ALL' ? `${fefoQueue.value.length} of ${riskLots.value.length} batches` : `${riskLots.value.length} batches at risk`,
)
function prioritise(sku: string) {
  router.push({ path: '/inventory/outbound-picking', query: { sku } })
}

// ---------- header actions
function newInbound() {
  router.push({ path: '/inventory/inbound-receiving', query: { new: '1' } })
}
function newOutbound() {
  router.push({ path: '/inventory/outbound-picking', query: { new: '1' } })
}
function exportPdf() {
  const ok = printDashboardReport({
    category: activeCat.value ? `${activeCat.value} – ${catName(activeCat.value)}` : '',
    kpis: [
      ['Total stock value', fmtRp(stockValue.value), skuCountText.value.replace(/ · click.*/, '')],
      ['Bin occupancy', `${occupancy.value.pct}%`, `${occupancy.value.full} full · ${occupancy.value.available} available`],
      ['Inbound / outbound pending', `${inboundPending.value} / ${outboundPending.value}`, 'Receiving · FEFO pick'],
      ['FEFO alert (< 3 months)', `${riskLots.value.length} batches`, 'Prioritise outbound'],
    ],
    categories: byCategory.value.map((c) => ({ id: c.id, name: c.label, value: c.value, units: c.units })),
    top: topSkuCards.value.map((c) => ({ name: c.name, total: c.total, rows: c.top })),
    fefo: riskLots.value.map((l) => ({ sku: l.sku, category: l.category, name: l.name, batch: l.batch, bin: l.bin, zone: l.zone, exp: l.exp, status: lotExpiry(l), qty: l.qty, unit: l.unit })),
  })
  if (!ok) ElMessage.warning('Allow pop-ups to export the dashboard.')
}
</script>

<template>
  <div :class="embedded ? 'wms-embedded' : 'page dash'">
    <PageHeader v-if="!embedded" title="Warehouse Dashboard" subtitle="Perfume factory warehouse – raw materials, packaging & finished goods · FEFO engine & visual layout">
      <template #actions>
        <el-button :icon="Download" @click="exportPdf">Export PDF</el-button>
        <el-button v-if="access.can('inbound-receiving', 'create')" type="success" :icon="Plus" @click="newInbound">Inbound</el-button>
        <el-button v-if="access.can('outbound-picking', 'create')" type="primary" :icon="TopRight" @click="newOutbound">Outbound</el-button>
      </template>
    </PageHeader>
    <div v-else class="dash-actions">
      <span class="engine-pill">Active Engine</span>
      <div class="dash-actions-buttons">
        <el-button :icon="Download" @click="exportPdf">Export PDF</el-button>
        <el-button v-if="access.can('inbound-receiving', 'create')" type="success" :icon="Plus" @click="newInbound">Inbound</el-button>
        <el-button v-if="access.can('outbound-picking', 'create')" type="primary" :icon="TopRight" @click="newOutbound">Outbound</el-button>
      </div>
    </div>

    <div class="dash-kpis">
      <div class="dash-kpi">
        <div class="dash-kpi-label">
          Total stock value
          <span v-if="activeCat" class="kpi-chip">{{ activeCat }}</span>
        </div>
        <button type="button" class="dash-kpi-value kpi-link" :title="activeCat ? 'Show all SKUs of this category' : 'Show the Top 5 SKUs per category'" @click="openValueDrill">
          {{ fmtRp(stockValue) }}
        </button>
        <div class="dash-kpi-hint is-up">{{ skuCountText }}</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">
          Rack / bin occupancy
          <span v-if="activeCat" class="kpi-chip">{{ activeCat }}</span>
        </div>
        <div class="dash-kpi-value">{{ occupancy.pct }}%</div>
        <div class="kpi-note">{{ occupancy.note }}</div>
        <div class="kpi-split">
          <button type="button" class="kpi-split-link is-red" title="Show full bins on the rack map" @click="goToBins('full')">Full {{ occupancy.full }} bins</button>
          <button type="button" class="kpi-split-link is-green" title="Show available bins on the rack map" @click="goToBins('available')">Available {{ occupancy.available }} bins</button>
        </div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Inbound / outbound pending</div>
        <div class="dash-kpi-value">
          <span class="in-count">{{ inboundPending }}</span>
          <span class="slash">/</span>
          <span class="out-count">{{ outboundPending }}</span>
        </div>
        <div class="kpi-split">
          <button type="button" class="kpi-split-link is-amber" @click="router.push('/inventory/inbound-receiving')">Inbound (receiving)</button>
          <button type="button" class="kpi-split-link is-blue" @click="router.push('/inventory/outbound-picking')">Outbound (FEFO pick)</button>
        </div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">FEFO expiry alert (&lt; 3 months)</div>
        <div class="dash-kpi-value is-red">{{ riskLots.length }} batches</div>
        <div class="dash-kpi-hint is-down">Outbound prioritised automatically (FEFO)</div>
      </div>
    </div>

    <div class="dash-grid">
      <section class="dash-card">
        <header class="dash-card-head head-with-action">
          <div>
            <h4>Stock value by category</h4>
            <p>Click a bar to filter Total stock value &amp; occupancy by category</p>
          </div>
          <div class="cat-chips" role="group" aria-label="Filter by category">
            <button type="button" class="cat-chip" :class="{ 'is-active': !activeCat }" @click="activeCat = null">All</button>
            <button
              v-for="c in store.categories"
              :key="c.id"
              type="button"
              class="cat-chip"
              :class="{ 'is-active': activeCat === c.id }"
              :title="c.name"
              @click="toggleCat(c.id)"
            >
              {{ c.id }}
            </button>
          </div>
        </header>
        <ul class="hbar" role="list">
          <li v-for="row in valueRows" :key="row.id">
            <button
              type="button"
              class="hbar-row cat-bar"
              :class="{ 'is-active': activeCat === row.id }"
              :title="`${row.label}: ${fmtRp(row.value)}`"
              :aria-pressed="activeCat === row.id"
              @click="toggleCat(row.id)"
            >
              <span class="hbar-label">{{ row.label }}</span>
              <span class="hbar-track">
                <span class="hbar-fill" :style="{ width: row.width, background: row.color }" />
              </span>
              <span class="hbar-value">{{ formatCompact(row.value, 'money') }}</span>
            </button>
          </li>
        </ul>
      </section>
      <section class="dash-card">
        <header class="dash-card-head">
          <h4>Stock distribution by category</h4>
          <p>Share of units (pcs / kg / etc.) in the warehouse</p>
        </header>
        <DonutChart :data="unitsChart" kind="number" center-label="Units" />
      </section>
    </div>

    <section class="dash-card">
      <header class="dash-card-head head-with-action">
        <div>
          <h4>Expiry warning (FEFO risk queue)</h4>
          <p>Lots on shelves that are expired or expire in less than 3 months, earliest first</p>
        </div>
        <div class="fefo-filter">
          <span class="muted">Category with expiry:</span>
          <el-select v-model="fefoCat" size="small" class="fefo-select">
            <el-option label="All categories" value="ALL" />
            <el-option v-for="o in fefoCatOptions" :key="o.id" :label="o.label" :value="o.id" />
          </el-select>
          <span class="muted">{{ fefoInfo }}</span>
        </div>
      </header>
      <el-table :data="fefoQueue" size="small" :empty-text="fefoCat !== 'ALL' ? `No expiring items at risk in category ${fefoCat}` : 'No expiring items at risk'">
        <el-table-column prop="sku" label="SKU code" width="100" />
        <el-table-column label="Category" width="90">
          <template #default="{ row }"><span class="status-pill blue">{{ row.category }}</span></template>
        </el-table-column>
        <el-table-column prop="name" label="Product name" min-width="200" show-overflow-tooltip />
        <el-table-column prop="batch" label="Batch number" min-width="120" />
        <el-table-column label="Bin location" min-width="140">
          <template #default="{ row }">
            <div class="mono">{{ row.bin }}</div>
            <div class="muted">{{ row.zone }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Expiry date" width="120">
          <template #default="{ row }">{{ fmtDate(row.exp) }}</template>
        </el-table-column>
        <el-table-column label="Expiry status" min-width="160">
          <template #default="{ row }"><ExpiryTag :exp="row.exp" show-days /></template>
        </el-table-column>
        <el-table-column label="Physical stock" align="right" width="120">
          <template #default="{ row }">{{ fmtQty(row.qty) }} {{ row.unit }}</template>
        </el-table-column>
        <el-table-column label="Action" width="170" align="right">
          <template #default="{ row }">
            <el-button size="small" type="danger" plain @click="prioritise(row.sku)">Prioritise outbound</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>
    <!-- SKUs of one category, by stock value -->
    <el-dialog v-model="catSkuOpen" :title="`SKUs in ${catSkuName}`" width="920px" append-to-body>
      <div class="drill-bar">
        <div class="drill-summary">
          <span><b>{{ catSkuData.rows.length }}</b> SKUs</span>
          <span><b>{{ fmtQty(catSkuData.units) }}</b> units on shelves</span>
          <span>Stock value <b>{{ fmtRp(catSkuData.total) }}</b></span>
        </div>
        <el-input v-model="catSkuSearch" :prefix-icon="Search" placeholder="Search SKU or name" clearable class="drill-search" />
      </div>
      <el-table :data="catSkuRows" size="small" max-height="460" empty-text="No SKUs" :default-sort="{ prop: 'value', order: 'descending' }">
        <el-table-column label="SKU" prop="sku" width="110" sortable>
          <template #default="{ row }">
            <el-button link type="primary" @click="openSku(row.sku)">{{ row.sku }}</el-button>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="Name" min-width="220" show-overflow-tooltip sortable />
        <el-table-column label="On hand" prop="onHand" align="right" width="130" sortable>
          <template #default="{ row }">{{ fmtQty(row.onHand) }} {{ row.unit }}</template>
        </el-table-column>
        <el-table-column label="Price" prop="price" align="right" width="130" sortable>
          <template #default="{ row }">{{ fmtRp(row.price) }}</template>
        </el-table-column>
        <el-table-column label="Stock value" prop="value" align="right" width="150" sortable>
          <template #default="{ row }"><span class="mono">{{ fmtRp(row.value) }}</span></template>
        </el-table-column>
        <el-table-column label="Share" prop="share" align="right" width="150" sortable>
          <template #default="{ row }">
            <div class="share-cell">
              <span class="share-track"><span class="share-fill" :style="{ width: `${Math.min(row.share, 100)}%` }" /></span>
              <span>{{ fmtPct(row.share) }}</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="drill-total">
        <span>Total{{ catSkuSearch.trim() ? ` (${catSkuRows.length} shown)` : '' }}</span>
        <span class="mono">{{ fmtRp(catSkuTotals.value) }}</span>
        <span class="drill-total-share">{{ fmtPct(catSkuTotals.share) }}</span>
      </div>
    </el-dialog>

    <!-- Top 5 SKUs per category -->
    <el-dialog v-model="topSkuOpen" title="Top 5 SKUs by stock value, per category" width="1000px" append-to-body>
      <div class="top-grid">
        <section v-for="c in topSkuCards" :key="c.id" class="top-card">
          <header class="top-head">
            <button type="button" class="top-title" @click="topSkuOpen = false; openCatSku(c.id)">{{ c.name }}</button>
            <span class="muted">{{ fmtRp(c.total) }} · {{ c.count }} SKUs</span>
          </header>
          <table v-if="c.top.length" class="top-table">
            <thead>
              <tr><th>SKU</th><th>Name</th><th class="num">Qty</th><th class="num">Value</th><th class="num">%</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in c.top" :key="r.sku">
                <td><el-button link type="primary" @click="openSku(r.sku)">{{ r.sku }}</el-button></td>
                <td class="ellipsis" :title="r.name">{{ r.name }}</td>
                <td class="num">{{ fmtQty(r.onHand) }}</td>
                <td class="num mono">{{ formatCompact(r.value, 'money') }}</td>
                <td class="num">{{ fmtPct(r.share) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="muted empty">No stock on shelves</p>
        </section>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.dash-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.dash-actions-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.dash-actions-buttons .el-button + .el-button {
  margin-left: 0;
}
.engine-pill {
  padding: 3px 10px;
  border: 1px solid #86efac;
  border-radius: 999px;
  background: var(--success-light);
  color: #15803d;
  font-size: 12px;
  font-weight: 600;
}
.kpi-chip {
  margin-left: 4px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--brand-light);
  color: var(--brand);
  font-size: 10px;
  text-transform: none;
  letter-spacing: 0;
}
.kpi-link {
  display: block;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kpi-link:hover {
  color: var(--brand);
}
.kpi-note {
  font-size: 11px;
  color: var(--gray-500);
  font-variant-numeric: tabular-nums;
}
.kpi-split {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
}
.kpi-split-link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.kpi-split-link:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.is-red { color: #b91c1c; }
.is-green { color: #15803d; }
.is-amber { color: #b45309; }
.is-blue { color: #1d4ed8; }
.in-count { color: #b45309; }
.out-count { color: #1d4ed8; }
.slash {
  margin: 0 4px;
  color: var(--gray-300);
}
.fefo-filter {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.fefo-select {
  width: 240px;
}
.cat-bar.is-active {
  background: var(--brand-light);
}
.wms-embedded {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.cat-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cat-chip {
  padding: 3px 10px;
  border: 1px solid var(--border-soft);
  border-radius: 999px;
  background: var(--bg-card);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--gray-700);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.cat-chip:hover:not(.is-active) {
  background: var(--brand-light);
  color: var(--gray-900);
}
.cat-chip:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.cat-chip.is-active {
  border-color: var(--brand);
  background: var(--brand);
  color: #ffffff;
}
.mono {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--gray-900);
}
.muted {
  font-size: 12px;
  color: var(--gray-500);
}
.head-with-action {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.cat-bar {
  width: 100%;
  margin: 0;
  padding: 4px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}
.cat-bar:hover {
  background: var(--brand-light);
}
.cat-bar:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 1px;
}
.drill-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.drill-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  color: var(--gray-700);
}
.drill-summary b {
  color: var(--gray-900);
  font-variant-numeric: tabular-nums;
}
.drill-search {
  width: 260px;
}
.share-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  font-variant-numeric: tabular-nums;
}
.share-track {
  width: 56px;
  height: 6px;
  border-radius: 999px;
  background: var(--gray-100);
  overflow: hidden;
}
.share-fill {
  display: block;
  height: 100%;
  background: var(--brand);
}
.drill-total {
  display: grid;
  grid-template-columns: 1fr 150px 150px;
  gap: 0;
  padding: 10px 12px;
  border-top: 2px solid var(--border-soft);
  font-weight: 700;
  color: var(--gray-900);
}
.drill-total > span:not(:first-child) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.top-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
@media (max-width: 760px) {
  .top-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.top-card {
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--bg-card);
}
.top-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.top-title {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--gray-900);
  cursor: pointer;
}
.top-title:hover {
  color: var(--brand);
}
.top-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12.5px;
}
.top-table th {
  padding: 4px 6px;
  border-bottom: 1px solid var(--border-soft);
  font-weight: 600;
  text-align: left;
  color: var(--gray-500);
}
.top-table th:nth-child(1) { width: 78px; }
.top-table th:nth-child(3) { width: 60px; }
.top-table th:nth-child(4) { width: 76px; }
.top-table th:nth-child(5) { width: 52px; }
.top-table td {
  padding: 4px 6px;
  border-bottom: 1px solid var(--gray-100);
  color: var(--gray-700);
}
.top-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty {
  margin: 8px 0 0;
}
</style>
