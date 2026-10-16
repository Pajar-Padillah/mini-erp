<script setup lang="ts">
// Fulfillment dashboard (qty based): outbound in = DO qty ordered, shipped = dispatched qty,
// fulfillment rate = picked/shipped qty ÷ ordered qty. One filter bar drives KPIs, chart and tables.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../../components/PageHeader.vue'
import TransactionFilterBar, { type TransactionFilterCondition, type TransactionFilterState } from '../../components/TransactionFilterBar.vue'
import { currentMonthRange, matchesTransactionDate, matchesTransactionValue } from '../../utils/transactionFilters'
import { SERIES_COLORS, formatCompact, niceTicks, roundedTopBar, useElementWidth } from '../../components/charts/chartUtils'
import { itemFulfilled, outboundStatus, todayISO, useWmsStore, type Outbound, type OutboundItem, type OutboundStatus } from '../../stores/wmsStore'
import { fmtDate, fmtQty, OUTBOUND_STATUS_COLOR } from './wmsUi'

withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

const store = useWmsStore()
const router = useRouter()

// ---------------------------------------------------------------- filters
const STATUSES: OutboundStatus[] = ['PENDING', 'ALLOCATED', 'PARTIAL PICKED', 'READY TO SHIP', 'OUTSTANDING', 'DISPATCHED', 'CLOSED']
const statusOptions = STATUSES.map((s) => ({ label: s, value: s, color: OUTBOUND_STATUS_COLOR[s] }))
const termOptions = [
  { label: 'Beli Putus', value: 'BELI PUTUS', color: 'blue' },
  { label: 'Konsinyasi', value: 'KONSINYASI', color: 'amber' },
]
const fields = [
  { label: 'Customer', value: 'customer' },
  { label: 'DO no.', value: 'no' },
  { label: 'SKU', value: 'sku' },
]
const defaultFilters = (): TransactionFilterState => ({ dateRange: currentMonthRange(), status: [], secondaryStatus: [], conditions: [] })
const filters = ref<TransactionFilterState>(defaultFilters())

const docConds = computed(() => filters.value.conditions.filter((c) => c.field !== 'sku'))
const skuConds = computed(() => filters.value.conditions.filter((c) => c.field === 'sku'))
const docField = (d: Outbound, field: string) => (field === 'customer' ? d.customer : field === 'no' ? d.no : '')

interface Line { doc: Outbound; item: OutboundItem; ordered: number; fulfilled: number; shipped: number; outstanding: number; short: number }
function toLine(doc: Outbound, item: OutboundItem): Line {
  const shipped = Math.min(item.qty, item.shippedQty)
  return {
    doc,
    item,
    ordered: item.qty,
    fulfilled: Math.min(item.qty, itemFulfilled(doc, item)),
    shipped,
    outstanding: doc.dispatched ? 0 : Math.max(0, item.qty - shipped),
    short: doc.closedShort ? Math.max(0, item.qty - shipped) : 0,
  }
}

/** Documents passing every filter; items narrowed by SKU conditions (documents with no matching item drop out). */
const scoped = computed(() => {
  const f = filters.value
  const out: { doc: Outbound; lines: Line[] }[] = []
  store.outbound.forEach((d) => {
    if (!matchesTransactionDate(d.date, f.dateRange)) return
    if (f.status.length && !f.status.includes(outboundStatus(d))) return
    if (f.secondaryStatus.length && !f.secondaryStatus.includes(d.term)) return
    if (!docConds.value.every((c) => matchesTransactionValue(docField(d, c.field), c))) return
    const items = d.items.filter((it) => skuConds.value.every((c) => matchesTransactionValue(it.sku, c)))
    if (!items.length) return
    out.push({ doc: d, lines: items.map((it) => toLine(d, it)) })
  })
  return out
})
const lines = computed(() => scoped.value.flatMap((s) => s.lines))

const sum = (ls: Line[], k: 'ordered' | 'fulfilled' | 'shipped' | 'outstanding' | 'short') => ls.reduce((a, l) => a + l[k], 0)
const rate = (ful: number, ord: number) => (ord > 0 ? Math.min(100, (ful / ord) * 100) : 0)
const pctText = (p: number) => `${p.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const tone = (p: number) => (p >= 95 ? 'good' : p >= 70 ? 'warn' : 'bad')

// ---------------------------------------------------------------- KPIs
const totals = computed(() => {
  const ls = lines.value
  const docs = scoped.value.map((s) => s.doc)
  return {
    docs: docs.length,
    ordered: sum(ls, 'ordered'),
    fulfilled: sum(ls, 'fulfilled'),
    shipped: sum(ls, 'shipped'),
    outstanding: sum(ls, 'outstanding'),
    short: sum(ls, 'short'),
    shippedDocs: docs.filter((d) => d.shipments.length).length,
    shipments: docs.reduce((a, d) => a + d.shipments.length, 0),
    openDocs: docs.filter((d) => !d.dispatched).length,
    complete: docs.filter((d) => d.dispatched && !d.closedShort).length,
    closedShort: docs.filter((d) => d.closedShort).length,
  }
})
const fulfillRate = computed(() => rate(totals.value.fulfilled, totals.value.ordered))
const kpis = computed(() => {
  const t = totals.value
  return [
    { label: 'Outbound in (ordered)', value: fmtQty(t.ordered), hint: `${t.docs} DO · ${lines.value.length} line(s)`, tone: '' },
    { label: 'Qty shipped', value: fmtQty(t.shipped), hint: `${t.shipments} shipment(s) on ${t.shippedDocs} DO`, tone: '' },
    {
      label: 'Fulfillment rate',
      value: t.ordered ? pctText(fulfillRate.value) : '-',
      hint: `${fmtQty(t.fulfilled)} of ${fmtQty(t.ordered)} picked or shipped`,
      tone: t.ordered && tone(fulfillRate.value) === 'bad' ? 'is-down' : t.ordered && tone(fulfillRate.value) === 'good' ? 'is-up' : '',
    },
    { label: 'Outstanding qty', value: fmtQty(t.outstanding), hint: `${t.openDocs} DO not yet dispatched`, tone: t.outstanding > 0 ? 'is-down' : '' },
    {
      label: 'Completed DO',
      value: `${t.complete} / ${t.docs}`,
      hint: t.closedShort ? `${t.closedShort} closed short (${fmtQty(t.short)} units)` : 'None closed short',
      tone: t.closedShort ? 'is-down' : '',
    },
  ]
})

// ---------------------------------------------------------------- chart buckets (day / week / month)
const ymd = (d: Date) => todayISO(d)
const parse = (s: string) => new Date(`${s}T00:00:00`)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const span = computed(() => {
  const [from, to] = filters.value.dateRange
  if (from && to) return { from, to }
  const dates = scoped.value.map((s) => s.doc.date).sort()
  return { from: from || dates[0] || todayISO(), to: to || dates[dates.length - 1] || todayISO() }
})
const grain = computed<'day' | 'week' | 'month'>(() => {
  const days = Math.round((parse(span.value.to).getTime() - parse(span.value.from).getTime()) / 86_400_000) + 1
  return days <= 45 ? 'day' : days <= 210 ? 'week' : 'month'
})
function bucketKey(date: string): string {
  if (grain.value === 'month') return date.slice(0, 7)
  if (grain.value === 'week') {
    const d = parse(date)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // Monday
    return ymd(d)
  }
  return date
}
function bucketLabel(key: string): string {
  if (grain.value === 'month') return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
  const [, m, d] = key.split('-')
  return `${grain.value === 'week' ? 'Wk ' : ''}${Number(d)} ${MONTHS[Number(m) - 1]}`
}
const buckets = computed(() => {
  const keys: string[] = []
  const cur = parse(bucketKey(span.value.from))
  const end = parse(span.value.to)
  while (cur <= end && keys.length < 400) {
    keys.push(grain.value === 'month' ? ymd(cur).slice(0, 7) : ymd(cur))
    if (grain.value === 'month') cur.setMonth(cur.getMonth() + 1)
    else cur.setDate(cur.getDate() + (grain.value === 'week' ? 7 : 1))
  }
  const agg = new Map(keys.map((k) => [k, { ordered: 0, fulfilled: 0, docs: new Set<number>() }]))
  lines.value.forEach((l) => {
    const b = agg.get(bucketKey(l.doc.date))
    if (!b) return
    b.ordered += l.ordered
    b.fulfilled += l.fulfilled
    b.docs.add(l.doc.id)
  })
  return keys.map((k) => {
    const b = agg.get(k)!
    return { key: k, label: bucketLabel(k), ordered: b.ordered, fulfilled: b.fulfilled, docs: b.docs.size }
  })
})
const grainText = computed(() => ({ day: 'per day', week: 'per week (Mon–Sun)', month: 'per month' })[grain.value])

const ORDER_COLOR = '#91a8ba'
const FULFIL_COLOR = SERIES_COLORS[0]
const chartEl = ref<HTMLElement>()
const chartW = useElementWidth(chartEl, 720)
const CH = 260
const PAD = { top: 12, right: 8, bottom: 28, left: 52 }
const ticks = computed(() => niceTicks(Math.max(0, ...buckets.value.map((b) => Math.max(b.ordered, b.fulfilled)))))
const yMax = computed(() => ticks.value[ticks.value.length - 1] || 1)
const plotW = computed(() => Math.max(chartW.value - PAD.left - PAD.right, 40))
const plotH = CH - PAD.top - PAD.bottom
const baseline = PAD.top + plotH
const band = computed(() => plotW.value / Math.max(buckets.value.length, 1))
const barW = computed(() => Math.max(2, Math.min(14, (band.value * 0.7) / 2)))
const yOf = (v: number) => PAD.top + plotH * (1 - v / yMax.value)
const labelEvery = computed(() => Math.max(1, Math.ceil(buckets.value.length / Math.max(1, Math.floor(plotW.value / 52)))))
const bars = computed(() =>
  buckets.value.map((b, i) => {
    const x0 = PAD.left + i * band.value
    const center = x0 + band.value / 2
    const xo = center - barW.value - 1
    const xf = center + 1
    return {
      ...b,
      i,
      x0,
      center,
      ordPath: b.ordered > 0 ? roundedTopBar(xo, yOf(b.ordered), barW.value, baseline) : '',
      fulPath: b.fulfilled > 0 ? roundedTopBar(xf, yOf(b.fulfilled), barW.value, baseline) : '',
      top: yOf(Math.max(b.ordered, b.fulfilled)),
      showLabel: i % labelEvery.value === 0,
    }
  }),
)
const active = ref<number | null>(null)
const tip = computed(() => (active.value == null ? null : bars.value[active.value]))
const tipLeft = computed(() => (tip.value ? Math.min(Math.max(tip.value.center, 90), chartW.value - 90) : 0))
const chartEmpty = computed(() => !buckets.value.some((b) => b.ordered > 0))

// ---------------------------------------------------------------- by customer
const byCustomer = computed(() => {
  const m = new Map<string, { customer: string; term: string; docs: Set<number>; ls: Line[] }>()
  lines.value.forEach((l) => {
    const r = m.get(l.doc.customer) ?? { customer: l.doc.customer, term: l.doc.term, docs: new Set<number>(), ls: [] }
    r.docs.add(l.doc.id)
    r.ls.push(l)
    m.set(l.doc.customer, r)
  })
  return [...m.values()]
    .map((r) => {
      const ordered = sum(r.ls, 'ordered')
      const fulfilled = sum(r.ls, 'fulfilled')
      return { customer: r.customer, term: r.term, docs: r.docs.size, ordered, fulfilled, shipped: sum(r.ls, 'shipped'), outstanding: sum(r.ls, 'outstanding'), pct: rate(fulfilled, ordered) }
    })
    .sort((a, b) => b.ordered - a.ordered)
})
const custCond = computed(() => filters.value.conditions.find((c) => c.field === 'customer' && c.operator === '='))
const isActiveCustomer = (name: string) => custCond.value?.value.toLowerCase() === name.toLowerCase()
function toggleCustomer(row: { customer: string }) {
  const rest = filters.value.conditions.filter((c) => !(c.field === 'customer' && c.operator === '='))
  const next: TransactionFilterCondition[] = isActiveCustomer(row.customer) ? rest : [...rest, { field: 'customer', operator: '=', value: row.customer }]
  filters.value = { ...filters.value, conditions: next }
}

// ---------------------------------------------------------------- by SKU
const bySku = computed(() => {
  const m = new Map<string, Line[]>()
  lines.value.forEach((l) => m.set(l.item.sku, [...(m.get(l.item.sku) ?? []), l]))
  return [...m.entries()]
    .map(([sku, ls]) => {
      const ordered = sum(ls, 'ordered')
      const fulfilled = sum(ls, 'fulfilled')
      return {
        sku,
        name: store.skuName(sku),
        unit: store.skuUnit(sku),
        docs: new Set(ls.map((l) => l.doc.id)).size,
        ordered,
        fulfilled,
        shipped: sum(ls, 'shipped'),
        outstanding: sum(ls, 'outstanding'),
        short: sum(ls, 'short'),
        pct: rate(fulfilled, ordered),
      }
    })
    .sort((a, b) => b.outstanding - a.outstanding || b.ordered - a.ordered)
})

type SumRow = { ordered: number; fulfilled: number; shipped: number; outstanding: number; docs: number }
function summary(rows: SumRow[], labelCol: number) {
  return ({ columns }: { columns: { property?: string }[] }) => {
    const t = rows.reduce((a, r) => ({ ordered: a.ordered + r.ordered, fulfilled: a.fulfilled + r.fulfilled, shipped: a.shipped + r.shipped, outstanding: a.outstanding + r.outstanding }), { ordered: 0, fulfilled: 0, shipped: 0, outstanding: 0 })
    return columns.map((c, i) => {
      if (i === labelCol) return 'Total'
      if (c.property === 'docs') return String(totals.value.docs)
      if (c.property === 'pct') return t.ordered ? pctText(rate(t.fulfilled, t.ordered)) : '-'
      if (c.property && c.property in t) return fmtQty(t[c.property as keyof typeof t])
      return ''
    })
  }
}
const custSummary = computed(() => summary(byCustomer.value, 0))
const skuSummary = computed(() => summary(bySku.value, 0))

const periodText = computed(() => {
  const [from, to] = filters.value.dateRange
  return from && to ? `${fmtDate(from)} – ${fmtDate(to)}` : 'All dates'
})
function openOutbound() {
  router.push('/inventory/outbound-picking')
}
</script>

<template>
  <div :class="embedded ? 'ful-embedded' : 'page dash'">
    <div v-if="embedded" class="ful-actions">
      <el-button @click="openOutbound">Open outbound</el-button>
    </div>
    <PageHeader v-else title="Fulfillment" subtitle="Qty based: ordered on delivery orders vs picked / shipped, by period, customer and SKU">
      <template #actions>
        <el-button @click="openOutbound">Open outbound</el-button>
      </template>
    </PageHeader>

    <div class="dash-card ful-filter">
      <TransactionFilterBar
        v-model="filters"
        :fields="fields"
        :statuses="statusOptions"
        :secondary-statuses="termOptions"
        secondary-status-label="Term"
        @reset="filters = defaultFilters()"
        @refresh="() => {}"
      />
    </div>

    <div class="dash-kpis wms-kpis">
      <div v-for="kpi in kpis" :key="kpi.label" class="dash-kpi">
        <div class="dash-kpi-label">{{ kpi.label }}</div>
        <div class="dash-kpi-value" :title="kpi.value">{{ kpi.value }}</div>
        <div class="dash-kpi-hint" :class="kpi.tone">{{ kpi.hint }}</div>
      </div>
    </div>

    <section class="dash-card">
      <header class="dash-card-head ful-chart-head">
        <div>
          <h4>Ordered vs fulfilled</h4>
          <p>Qty on DOs by DO date, {{ grainText }} · {{ periodText }}</p>
        </div>
        <ul class="ful-legend">
          <li><span class="ful-swatch" :style="{ background: ORDER_COLOR }" />Ordered</li>
          <li><span class="ful-swatch" :style="{ background: FULFIL_COLOR }" />Fulfilled (picked / shipped)</li>
        </ul>
      </header>
      <div ref="chartEl" class="chart" :style="{ height: `${CH}px` }">
        <svg :width="chartW" :height="CH" role="img" aria-label="Ordered versus fulfilled quantity per period">
          <g class="chart-grid">
            <g v-for="t in ticks" :key="t">
              <line :x1="PAD.left" :x2="chartW - PAD.right" :y1="yOf(t)" :y2="yOf(t)" />
              <text :x="PAD.left - 8" :y="yOf(t)" dy="0.32em" text-anchor="end">{{ formatCompact(t) }}</text>
            </g>
          </g>
          <g v-for="b in bars" :key="b.key">
            <path v-if="b.ordPath" :d="b.ordPath" :fill="ORDER_COLOR" class="chart-bar" :class="{ 'is-dim': active != null && active !== b.i }" />
            <path v-if="b.fulPath" :d="b.fulPath" :fill="FULFIL_COLOR" class="chart-bar" :class="{ 'is-dim': active != null && active !== b.i }" />
            <text v-if="b.showLabel" class="chart-axis-label" :x="b.center" :y="baseline + 18" text-anchor="middle">{{ b.label }}</text>
            <rect
              class="chart-hit"
              :x="b.x0"
              :y="PAD.top"
              :width="band"
              :height="plotH"
              tabindex="0"
              @mouseenter="active = b.i"
              @mouseleave="active = null"
              @focus="active = b.i"
              @blur="active = null"
            />
          </g>
        </svg>
        <div v-if="chartEmpty" class="ful-empty">No outbound in this period</div>
        <div v-if="tip" class="chart-tooltip" :style="{ left: `${tipLeft}px`, top: `${tip.top - 8}px` }">
          <div class="chart-tooltip-label">{{ tip.label }} · {{ tip.docs }} DO</div>
          <div class="ful-tip-row"><span class="ful-swatch" :style="{ background: ORDER_COLOR }" />Ordered <b>{{ fmtQty(tip.ordered) }}</b></div>
          <div class="ful-tip-row"><span class="ful-swatch" :style="{ background: FULFIL_COLOR }" />Fulfilled <b>{{ fmtQty(tip.fulfilled) }}</b></div>
          <div class="ful-tip-row">Rate <b>{{ tip.ordered ? pctText(rate(tip.fulfilled, tip.ordered)) : '-' }}</b></div>
        </div>
      </div>
    </section>

    <section class="dash-card">
      <header class="dash-card-head">
        <h4>Fulfillment by customer</h4>
        <p>Click a customer to filter the whole page (click again to clear)</p>
      </header>
      <el-table
        :data="byCustomer"
        size="small"
        empty-text="No outbound for these filters"
        show-summary
        :summary-method="custSummary"
        :row-class-name="({ row }: { row: { customer: string } }) => (isActiveCustomer(row.customer) ? 'ful-row-active' : 'ful-row')"
        @row-click="toggleCustomer"
      >
        <el-table-column label="Customer" min-width="220">
          <template #default="{ row }">
            <div class="ful-strong">{{ row.customer }}</div>
            <span class="status-pill" :class="row.term === 'KONSINYASI' ? 'amber' : 'blue'">{{ row.term }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="docs" label="DO" width="70" align="right" />
        <el-table-column prop="ordered" label="Ordered" width="105" align="right">
          <template #default="{ row }">{{ fmtQty(row.ordered) }}</template>
        </el-table-column>
        <el-table-column prop="fulfilled" label="Fulfilled" width="105" align="right">
          <template #default="{ row }">{{ fmtQty(row.fulfilled) }}</template>
        </el-table-column>
        <el-table-column prop="shipped" label="Shipped" width="105" align="right">
          <template #default="{ row }">{{ fmtQty(row.shipped) }}</template>
        </el-table-column>
        <el-table-column prop="outstanding" label="Outstanding" width="115" align="right">
          <template #default="{ row }"><span :class="{ 'ful-warn': row.outstanding > 0 }">{{ fmtQty(row.outstanding) }}</span></template>
        </el-table-column>
        <el-table-column prop="pct" label="Fulfillment" min-width="200">
          <template #default="{ row }">
            <div class="ful-meter">
              <div class="ful-track"><div class="ful-fill" :class="tone(row.pct)" :style="{ width: `${Math.max(row.pct, row.pct > 0 ? 2 : 0)}%` }" /></div>
              <span class="ful-pct">{{ pctText(row.pct) }}</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="dash-card">
      <header class="dash-card-head">
        <h4>Fulfillment by SKU</h4>
        <p>Ordered, fulfilled and outstanding qty per product, most outstanding first</p>
      </header>
      <el-table :data="bySku" size="small" empty-text="No outbound for these filters" show-summary :summary-method="skuSummary">
        <el-table-column label="SKU" min-width="240">
          <template #default="{ row }">
            <div class="ful-strong">{{ row.sku }}</div>
            <div class="ful-muted">{{ row.name }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="docs" label="DO" width="70" align="right" />
        <el-table-column prop="ordered" label="Ordered" width="110" align="right">
          <template #default="{ row }">{{ fmtQty(row.ordered) }} <span class="ful-muted">{{ row.unit }}</span></template>
        </el-table-column>
        <el-table-column prop="fulfilled" label="Fulfilled" width="105" align="right">
          <template #default="{ row }">{{ fmtQty(row.fulfilled) }}</template>
        </el-table-column>
        <el-table-column prop="shipped" label="Shipped" width="105" align="right">
          <template #default="{ row }">{{ fmtQty(row.shipped) }}</template>
        </el-table-column>
        <el-table-column prop="outstanding" label="Outstanding" width="115" align="right">
          <template #default="{ row }">
            <span :class="{ 'ful-warn': row.outstanding > 0 }">{{ fmtQty(row.outstanding) }}</span>
            <div v-if="row.short" class="ful-muted">{{ fmtQty(row.short) }} closed short</div>
          </template>
        </el-table-column>
        <el-table-column prop="pct" label="Fulfillment" min-width="200">
          <template #default="{ row }">
            <div class="ful-meter">
              <div class="ful-track"><div class="ful-fill" :class="tone(row.pct)" :style="{ width: `${Math.max(row.pct, row.pct > 0 ? 2 : 0)}%` }" /></div>
              <span class="ful-pct">{{ pctText(row.pct) }}</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<style scoped>
.ful-embedded {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.ful-actions {
  display: flex;
  justify-content: flex-end;
}
.ful-filter {
  padding: 16px 18px;
}
.wms-kpis {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}
@media (max-width: 1300px) {
  .wms-kpis {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .wms-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 480px) {
  .wms-kpis {
    grid-template-columns: minmax(0, 1fr);
  }
}
.ful-chart-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px 20px;
}
.ful-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
  color: var(--gray-700);
}
.ful-legend li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ful-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}
.ful-tip-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ful-tip-row b {
  margin-left: auto;
  padding-left: 12px;
  font-variant-numeric: tabular-nums;
}
.ful-empty {
  position: absolute;
  inset: 0 0 28px 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--gray-500);
  pointer-events: none;
}
.ful-strong {
  font-weight: 600;
  color: var(--gray-900);
}
.ful-muted {
  font-size: 12px;
  color: var(--gray-500);
}
.ful-warn {
  font-weight: 600;
  color: var(--danger);
}
.ful-meter {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ful-track {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--gray-100);
  overflow: hidden;
}
.ful-fill {
  height: 100%;
  border-radius: 999px;
}
.ful-fill.good {
  background: var(--success);
}
.ful-fill.warn {
  background: var(--warning);
}
.ful-fill.bad {
  background: var(--danger);
}
.ful-pct {
  min-width: 48px;
  text-align: right;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--gray-900);
}
:deep(.ful-row) {
  cursor: pointer;
}
:deep(.ful-row-active) {
  cursor: pointer;
}
:deep(.ful-row-active > td.el-table__cell) {
  background: var(--brand-light) !important;
}
</style>
