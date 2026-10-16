<script setup lang="ts">
// Home dashboard: 12 static mockup views (executive + per module) plus the live Warehouse (WMS)
// dashboard, switched with the pill bar.
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowRight, Back, Bottom, CaretTop, CircleCloseFilled, Download, InfoFilled, MapLocation, TrendCharts, WarningFilled } from '@element-plus/icons-vue'
import PageHeader from '../components/PageHeader.vue'
import BarChart from '../components/charts/BarChart.vue'
import LineChart from '../components/charts/LineChart.vue'
import DonutChart from '../components/charts/DonutChart.vue'
import HBarChart from '../components/charts/HBarChart.vue'
import { formatValue } from '../components/charts/chartUtils'
import { useCompanyStore } from '../stores/companyStore'
import { useAuthStore } from '../stores/authStore'
import { useAccessStore } from '../stores/accessStore'
import { DASHBOARDS, RECENT_TRANSACTIONS } from './home/dashboards'
import WmsDashboardView from './wms/WmsDashboardView.vue'
import FulfillmentView from './wms/FulfillmentView.vue'

const STORAGE_KEY = 'mini-erp.homeDashboard'

// The Warehouse and Fulfillment views render the functional WMS dashboards instead of static data; they sit after Inventory.
const FULFILLMENT = { key: 'fulfillment', short: 'Fulfillment', icon: TrendCharts, title: 'Fulfillment', subtitle: 'Qty based: ordered on delivery orders vs picked / shipped, by period, customer and SKU' }
const WAREHOUSE = { key: 'warehouse', short: 'Warehouse', icon: MapLocation, title: 'Warehouse Dashboard', subtitle: 'Perfume factory warehouse – raw materials, packaging & finished goods · FEFO engine & visual layout' }

const router = useRouter()
const companyStore = useCompanyStore()
const auth = useAuthStore()
const access = useAccessStore()
const SWITCH_ITEMS = computed(() =>
  DASHBOARDS.flatMap((d) =>
    d.key === 'inventory'
      ? [d, ...(access.canView('wms-dashboard') ? [WAREHOUSE] : []), ...(access.canView('fulfillment') ? [FULFILLMENT] : [])]
      : [d],
  ),
)

function storedView(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && SWITCH_ITEMS.value.some((d) => d.key === v)) return v
  } catch {
    // ignore storage failures
  }
  return DASHBOARDS[0].key
}

const activeKey = ref(storedView())
watch(activeKey, (v) => {
  try {
    localStorage.setItem(STORAGE_KEY, v)
  } catch {
    // ignore storage failures
  }
})
// Sliding indicator under the active switcher item.
const switcherEl = ref<HTMLElement>()
const itemEls = ref<HTMLElement[]>([])
const indicator = ref({ left: 0, width: 0, ready: false })

function placeIndicator(scroll = false) {
  const index = SWITCH_ITEMS.value.findIndex((d) => d.key === activeKey.value)
  const el = itemEls.value[index]
  if (!el) return
  indicator.value = { left: el.offsetLeft, width: el.offsetWidth, ready: true }
  if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
}

let switcherObserver: ResizeObserver | undefined
onMounted(() => {
  placeIndicator()
  if (switcherEl.value) {
    switcherObserver = new ResizeObserver(() => placeIndicator())
    switcherObserver.observe(switcherEl.value)
  }
})
onActivated(() => placeIndicator())
onBeforeUnmount(() => switcherObserver?.disconnect())
watch(activeKey, () => nextTick(() => placeIndicator(true)))

const isWarehouse = computed(() => activeKey.value === WAREHOUSE.key && access.canView('wms-dashboard'))
const isFulfillment = computed(() => activeKey.value === FULFILLMENT.key && access.canView('fulfillment'))
const view = computed(() => DASHBOARDS.find((d) => d.key === activeKey.value) ?? DASHBOARDS[0])
const heading = computed(() => (isWarehouse.value ? WAREHOUSE : isFulfillment.value ? FULFILLMENT : view.value))
const isExecutive = computed(() => !isWarehouse.value && !isFulfillment.value && view.value.key === 'executive')

const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 11 ? 'Good morning' : h < 15 ? 'Good afternoon' : h < 19 ? 'Good evening' : 'Good night'
})
const scopeLine = computed(() => {
  const company = companyStore.selectedCompany?.name ?? 'All companies'
  const scope = companyStore.isGroupSelected ? ' · All branches' : ''
  const month = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
  return `${company}${scope} · ${month}`
})

const SIGNAL_ICONS = { critical: CircleCloseFilled, warning: WarningFilled, info: InfoFilled }
const STATUS_LABEL: Record<string, string> = { COMPLETED: 'green', PROCESSED: 'amber', ACTIVE: 'blue', DRAFT: 'gray' }

function pct(done: number, total: number) {
  return total ? Math.round((done / total) * 100) : 0
}

function exportView() {
  ElMessage.info(`Export of "${heading.value.title}" is not available in the mockup.`)
}
</script>

<template>
  <div class="page dash">
    <PageHeader :title="`${greeting}, ${(auth.user?.name ?? 'there').split(' ')[0]}`" :subtitle="scopeLine">
      <template #actions>
        <el-button :icon="Download" @click="exportView">Export</el-button>
      </template>
    </PageHeader>

    <!-- View switcher -->
    <div ref="switcherEl" class="dash-switcher" role="tablist" aria-label="Dashboard view">
      <span
        class="dash-switcher-indicator"
        :class="{ 'is-ready': indicator.ready }"
        :style="{ transform: `translateX(${indicator.left}px)`, width: `${indicator.width}px` }"
        aria-hidden="true"
      />
      <button
        v-for="d in SWITCH_ITEMS"
        :key="d.key"
        ref="itemEls"
        type="button"
        role="tab"
        class="dash-switcher-item"
        :class="{ 'is-active': d.key === activeKey }"
        :aria-selected="d.key === activeKey"
        @click="activeKey = d.key"
      >
        <span class="dash-switcher-icon"><el-icon><component :is="d.icon" /></el-icon></span>
        <span class="dash-switcher-label">{{ d.short }}</span>
      </button>
    </div>

    <div class="dash-heading">
      <div>
        <h3 class="dash-title">{{ heading.title }}</h3>
        <div class="dash-subtitle">{{ heading.subtitle }}</div>
      </div>
      <button v-if="!isExecutive" type="button" class="dash-back" @click="activeKey = 'executive'">
        <el-icon><Back /></el-icon>
        Executive overview
      </button>
    </div>

    <WmsDashboardView v-if="isWarehouse" embedded />
    <FulfillmentView v-else-if="isFulfillment" embedded />

    <template v-else>
    <!-- KPIs -->
    <div class="dash-kpis">
      <div v-for="kpi in view.kpis" :key="kpi.label" class="dash-kpi">
        <div class="dash-kpi-label">{{ kpi.label }}</div>
        <div class="dash-kpi-value">{{ kpi.value }}</div>
        <div class="dash-kpi-hint" :class="kpi.trend ? `is-${kpi.trend}` : ''">
          <el-icon v-if="kpi.trend === 'up'"><CaretTop /></el-icon>
          <el-icon v-else-if="kpi.trend === 'down'"><Bottom /></el-icon>
          {{ kpi.hint }}
        </div>
      </div>
    </div>

    <!-- Charts -->
    <div class="dash-grid">
      <section v-for="chart in view.charts" :key="`${view.key}-${chart.title}`" class="dash-card">
        <header class="dash-card-head">
          <h4>{{ chart.title }}</h4>
          <p v-if="chart.subtitle">{{ chart.subtitle }}</p>
        </header>
        <BarChart v-if="chart.type === 'bar'" :data="chart.data" :kind="chart.kind" />
        <LineChart v-else-if="chart.type === 'line'" :data="chart.data" :kind="chart.kind" :min-zero="chart.minZero ?? true" />
        <HBarChart v-else-if="chart.type === 'hbar'" :data="chart.data" :kind="chart.kind" :show-share="chart.showShare" />
        <DonutChart v-else :data="chart.data" :kind="chart.kind" :center-label="chart.centerLabel" />
      </section>
    </div>

    <!-- Process control + signals -->
    <div class="dash-grid is-wide-left">
      <section class="dash-card">
        <header class="dash-card-head">
          <h4>Process Control</h4>
          <p>Completion of each step this month</p>
        </header>
        <ul class="dash-process">
          <li v-for="p in view.process" :key="p.label">
            <div class="dash-process-top">
              <span class="dash-process-label">{{ p.label }}</span>
              <span class="dash-process-count">
                {{ formatValue(p.done) }} / {{ formatValue(p.total) }}
                <b>{{ pct(p.done, p.total) }}%</b>
              </span>
            </div>
            <el-progress :percentage="pct(p.done, p.total)" :show-text="false" :stroke-width="6" />
          </li>
        </ul>
      </section>

      <section class="dash-card">
        <header class="dash-card-head">
          <h4>Needs Attention</h4>
          <p>Items to follow up</p>
        </header>
        <ul class="dash-signals">
          <li v-for="s in view.signals" :key="s.title" class="dash-signal" :class="`is-${s.tone}`">
            <el-icon class="dash-signal-icon"><component :is="SIGNAL_ICONS[s.tone]" /></el-icon>
            <div class="dash-signal-body">
              <div class="dash-signal-title">{{ s.title }}</div>
              <div class="dash-signal-detail">{{ s.detail }}</div>
            </div>
            <span class="dash-signal-count">{{ s.count }}</span>
            <el-button size="small" @click="router.push(s.to)">Open</el-button>
          </li>
        </ul>
      </section>
    </div>

    <!-- Recent transactions (executive only) -->
    <section v-if="isExecutive" class="dash-card">
      <header class="dash-card-head">
        <h4>Recent Transactions</h4>
        <p>Latest documents across all branches</p>
      </header>
      <el-table :data="RECENT_TRANSACTIONS" row-class-name="clickable-row" @row-click="(row: any) => router.push(row.to)">
        <el-table-column prop="no" label="Document" min-width="150" />
        <el-table-column prop="type" label="Type" min-width="140" />
        <el-table-column prop="branch" label="Branch" width="110" />
        <el-table-column prop="party" label="Customer / Supplier" min-width="220" />
        <el-table-column prop="date" label="Date" width="120" />
        <el-table-column label="Amount" min-width="150" align="right">
          <template #default="{ row }">{{ formatValue(row.amount, 'money') }}</template>
        </el-table-column>
        <el-table-column label="Status" width="160">
          <template #default="{ row }"><span class="status-pill" :class="STATUS_LABEL[row.status]">{{ row.status }}</span></template>
        </el-table-column>
      </el-table>
    </section>

    <!-- Drill-down -->
    <section class="dash-card dash-drilldown">
      <span class="dash-drilldown-label">Go to</span>
      <button v-for="link in view.drilldown" :key="link.to" type="button" class="dash-chip" @click="router.push(link.to)">
        {{ link.label }}
        <el-icon><ArrowRight /></el-icon>
      </button>
    </section>
    </template>
  </div>
</template>
