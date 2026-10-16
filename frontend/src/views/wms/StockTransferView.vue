<script setup lang="ts">
// Stock Transfer: bin-to-bin moves of one SKU/batch lot (documents TRF-…).
// Moving back to the transit bin creates a new inbound document that waits for putaway.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import TransactionFilterBar from '../../components/TransactionFilterBar.vue'
import { useListFilter } from './useListFilter'
import ExpiryTag from './ExpiryTag.vue'
import { fmtDate, fmtDateTime, fmtQty } from './wmsUi'
import { printTransferDoc } from './wmsPrint'
import { TRANSIT_BIN, TRANSIT_ZONE, binAvailCap, normLot, todayISO, useWmsStore, type DocLog, type Transfer } from '../../stores/wmsStore'
import { useAccessStore } from '../../stores/accessStore'
import DocCollabSection from './DocCollabSection.vue'
import { useDocCollabKey } from './useDocCollabKey'

const store = useWmsStore()
const access = useAccessStore()
const route = useRoute()
const router = useRouter()

const STATUS_COLOR: Record<string, string> = { DONE: 'green', 'WAITING PUTAWAY': 'amber', 'PUTAWAY DONE': 'green' }

function printDoc(t: Transfer) {
  if (!printTransferDoc(t)) ElMessage.warning('Allow pop-ups to print the transfer document.')
}

// ---------------------------------------------------------------- KPIs
const kpis = computed(() => {
  const today = todayISO()
  return {
    today: store.transfers.filter((t) => t.date === today).length,
    waiting: store.transfers.filter((t) => store.transferStatus(t) === 'WAITING PUTAWAY').length,
    done: store.transfers.filter((t) => store.transferStatus(t) !== 'WAITING PUTAWAY').length,
  }
})

// ---------------------------------------------------------------- list
const page = ref(1)
const pageSize = 10

const sorted = computed(() => [...store.transfers].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
const { filters, fieldOptions, filtered, reset, refresh, refreshing } = useListFilter(() => sorted.value, {
  date: (t) => t.date,
  status: (t) => store.transferStatus(t),
  fields: [
    { label: 'Transfer no', value: 'no', get: (t) => t.no },
    { label: 'SKU', value: 'sku', get: (t) => `${t.sku} ${store.skuName(t.sku)}` },
    { label: 'Batch', value: 'batch', get: (t) => t.batch },
    { label: 'From bin', value: 'srcBin', get: (t) => t.srcBin },
    { label: 'To bin', value: 'tgtBin', get: (t) => t.tgtBin },
    { label: 'Qty', value: 'qty', get: (t) => t.qty },
    { label: 'Created by', value: 'createdBy', get: (t) => t.createdBy },
  ],
}, page)
const statusOptions = [
  { label: 'Done', value: 'DONE', color: 'green' },
  { label: 'Waiting putaway', value: 'WAITING PUTAWAY', color: 'amber' },
  { label: 'Putaway done', value: 'PUTAWAY DONE', color: 'blue' },
]
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

const zoneOf = (code: string) => store.bin(code)?.zone ?? '-'
function openInbound(no: string) {
  router.push({ path: '/inventory/inbound-receiving', query: { no } })
}

// ---------------------------------------------------------------- log dialog
const logOpen = ref(false)
const logTitle = ref('')
const logRows = ref<DocLog[]>([])
function showLog(t: Transfer) {
  logTitle.value = `Log – ${t.no}`
  logRows.value = [...t.logs].reverse()
  logOpen.value = true
}

// ---------------------------------------------------------------- new transfer dialog
const dlgOpen = ref(false)
const form = reactive({ lot: '', srcBin: '', tgtBin: '', qty: 0 })
let prefilling = false // true while openNew() fills the form, so the reset watchers stay quiet

interface LotOption { key: string; sku: string; batch: string; exp: string; total: number; bins: number }
const lotOptions = computed<LotOption[]>(() => {
  const map = new Map<string, LotOption & { binSet: Set<string> }>()
  store.stockLots((l) => l.zone !== TRANSIT_ZONE).forEach((l) => {
    const key = `${l.sku}|${l.batch}|${l.exp}`
    let o = map.get(key)
    if (!o) {
      o = { key, sku: l.sku, batch: l.batch, exp: l.exp, total: 0, bins: 0, binSet: new Set() }
      map.set(key, o)
    }
    o.total += l.qty
    o.binSet.add(l.bin)
  })
  return [...map.values()]
    .map(({ binSet, ...o }) => ({ ...o, bins: binSet.size }))
    .sort((a, b) => a.sku.localeCompare(b.sku) || a.exp.localeCompare(b.exp))
})
const selLot = computed(() => lotOptions.value.find((o) => o.key === form.lot) ?? null)
function lotLabel(o: LotOption) {
  return `${o.sku} – ${store.skuName(o.sku)} · Batch ${o.batch} · Exp ${fmtDate(o.exp)} · total ${fmtQty(o.total)} in ${o.bins} bin${o.bins === 1 ? '' : 's'}`
}

const srcOptions = computed(() => {
  const lot = selLot.value
  if (!lot) return []
  return store.stockLots((l) => l.zone !== TRANSIT_ZONE && l.sku === lot.sku && l.batch === lot.batch && l.exp === lot.exp)
    .map((l) => ({
      bin: l.bin,
      zone: l.zone,
      qty: l.qty,
      reserved: store.reservedOnLot(l.bin, l.batch, l.exp),
      movable: store.movableQty(l.bin, l.sku, l.batch, l.exp),
      frozen: store.isFrozen(l.bin),
      frozenBy: store.frozenBy(l.bin),
    }))
    .sort((a, b) => a.bin.localeCompare(b.bin))
})

const tgtOptions = computed(() => {
  if (!form.srcBin) return []
  return store.storageBins
    .filter((b) => b.bin !== form.srcBin)
    .map((b) => ({ bin: b.bin, zone: b.zone, free: binAvailCap(b), frozen: store.isFrozen(b.bin), frozenBy: store.frozenBy(b.bin) }))
    .sort((a, b) => a.bin.localeCompare(b.bin))
})

const movable = computed(() => {
  const lot = selLot.value
  if (!lot || !form.srcBin) return 0
  return store.movableQty(form.srcBin, lot.sku, lot.batch, lot.exp)
})
const unit = computed(() => (selLot.value ? store.skuUnit(selLot.value.sku) : ''))

watch(() => form.lot, () => {
  if (prefilling) return
  form.srcBin = ''
  form.tgtBin = ''
  form.qty = 0
})
watch(() => form.srcBin, () => {
  if (prefilling) return
  if (form.tgtBin === form.srcBin) form.tgtBin = ''
  form.qty = movable.value
})

const payload = computed(() => ({
  srcBin: form.srcBin,
  tgtBin: form.tgtBin,
  sku: selLot.value?.sku ?? '',
  batch: selLot.value?.batch ?? '-',
  exp: selLot.value?.exp ?? '-',
  qty: Number(form.qty) || 0,
}))
const validation = computed(() => store.validateTransfer(payload.value))
const touched = computed(() => !!form.lot && !!form.srcBin && !!form.tgtBin)

const collab = useDocCollabKey('wms-transfer')

function openNew(prefill?: { bin?: string; sku?: string; batch?: string; exp?: string }) {
  prefilling = true
  form.lot = ''
  form.srcBin = ''
  form.tgtBin = ''
  form.qty = 0
  if (prefill?.sku) {
    const key = `${prefill.sku}|${normLot(prefill.batch)}|${normLot(prefill.exp)}`
    if (lotOptions.value.some((o) => o.key === key)) {
      form.lot = key
      if (prefill.bin && srcOptions.value.some((s) => s.bin === prefill.bin)) {
        form.srcBin = prefill.bin
        form.qty = movable.value
      }
    }
  }
  collab.startCreate()
  dlgOpen.value = true
  // Let the watchers fire for the prefilled values before re-enabling them.
  queueMicrotask(() => { prefilling = false })
}

function submit() {
  const r = store.executeTransfer(payload.value)
  if (r.ok) {
    if (r.data) collab.commit(r.data.no)
    ElMessage.success(r.msg)
    dlgOpen.value = false
  } else {
    ElMessage.warning(r.msg)
  }
}

function applyQuery() {
  const q = route.query
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  if (str(q.bin) || str(q.sku)) openNew({ bin: str(q.bin), sku: str(q.sku), batch: str(q.batch), exp: str(q.exp) })
}
onMounted(applyQuery)
watch(() => route.query, (n, o) => {
  if (route.path.includes('stock-transfer') && JSON.stringify(n) !== JSON.stringify(o)) applyQuery()
})
</script>

<template>
  <div class="page">
    <PageHeader title="Stock Transfer" subtitle="Move a SKU batch from one bin to another (documents TRF-…).">
      <template #actions>
        <el-button v-if="access.can('stock-transfer', 'create')" type="primary" @click="openNew()">+ New transfer</el-button>
      </template>
    </PageHeader>

    <div class="dash-kpis trf-kpis">
      <div class="dash-kpi">
        <div class="dash-kpi-label">Transfers today</div>
        <div class="dash-kpi-value">{{ kpis.today }}</div>
        <div class="dash-kpi-hint">Created on {{ fmtDate(todayISO()) }}</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Waiting putaway</div>
        <div class="dash-kpi-value">{{ kpis.waiting }}</div>
        <div class="dash-kpi-hint">Moved back to transit ({{ TRANSIT_BIN }})</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Done</div>
        <div class="dash-kpi-value">{{ kpis.done }}</div>
        <div class="dash-kpi-hint">Of {{ store.transfers.length }} transfers in total</div>
      </div>
    </div>

    <div class="card">
      <TransactionFilterBar
        v-model="filters"
        :fields="fieldOptions"
        :statuses="statusOptions"
        :loading="refreshing"
        @reset="reset"
        @refresh="refresh"
      />

      <el-table :data="paged" empty-text="No transfers yet">
        <el-table-column label="Transfer" min-width="170">
          <template #default="{ row }">
            <div class="cell-strong">{{ row.no }}</div>
            <div class="cell-sub">{{ fmtDate(row.date) }} · {{ row.createdBy }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Product" min-width="200">
          <template #default="{ row }">
            <div class="cell-strong">{{ row.sku }}</div>
            <div class="cell-sub">{{ store.skuName(row.sku) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Batch / Expiry" min-width="150">
          <template #default="{ row }">
            <div>{{ row.batch }}</div>
            <div class="cell-sub">{{ fmtDate(row.exp) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="From" min-width="120">
          <template #default="{ row }">
            <div class="cell-strong">{{ row.srcBin }}</div>
            <div class="cell-sub">{{ zoneOf(row.srcBin) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="To" min-width="150">
          <template #default="{ row }">
            <div class="cell-strong">{{ row.tgtBin }}</div>
            <div class="cell-sub">{{ zoneOf(row.tgtBin) }}</div>
            <el-link v-if="row.toTransit && row.inboundNo" type="primary" class="cell-link" @click="openInbound(row.inboundNo)">
              Inbound {{ row.inboundNo }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column label="Qty" width="110" align="right">
          <template #default="{ row }">
            <b>{{ fmtQty(row.qty) }}</b> <span class="cell-sub">{{ store.skuUnit(row.sku) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Status" width="170">
          <template #default="{ row }">
            <span class="status-pill" :class="STATUS_COLOR[store.transferStatus(row)]">{{ store.transferStatus(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="" width="110" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click="printDoc(row)">Print</el-button>
            <el-button link type="primary" @click="showLog(row)">Log</el-button>
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar v-model:page="page" :page-size="pageSize" :total="filtered.length" />
    </div>

    <!-- log -->
    <el-dialog v-model="logOpen" :title="logTitle" width="560px">
      <el-timeline v-if="logRows.length">
        <el-timeline-item v-for="(l, i) in logRows" :key="i" :timestamp="`${fmtDateTime(l.ts)} · ${l.by}`">
          <b>{{ l.action }}</b>
          <div v-if="l.note" class="cell-sub">{{ l.note }}</div>
        </el-timeline-item>
      </el-timeline>
      <div v-else class="cell-sub">No log entries.</div>
    </el-dialog>

    <!-- new transfer -->
    <el-dialog v-model="dlgOpen" title="New stock transfer" width="680px" top="5vh" destroy-on-close @closed="collab.closed">
      <el-form label-position="top" class="trf-form">
        <el-form-item label="1. SKU / batch to move">
          <el-select v-model="form.lot" filterable placeholder="Choose SKU / batch" class="w-full">
            <el-option v-for="o in lotOptions" :key="o.key" :value="o.key" :label="lotLabel(o)" />
          </el-select>
          <div v-if="selLot" class="trf-hint">
            <ExpiryTag :exp="selLot.exp" :has-expiry="store.sku(selLot.sku)?.hasExpiry ?? false" show-days />
          </div>
        </el-form-item>

        <el-form-item label="2. Source bin">
          <el-select v-model="form.srcBin" :disabled="!selLot" placeholder="Bin holding this batch" class="w-full">
            <el-option v-for="s in srcOptions" :key="s.bin" :value="s.bin" :disabled="s.frozen"
              :label="`${s.bin} (${s.zone})`">
              <div class="opt-row">
                <span><b>{{ s.bin }}</b> <span class="cell-sub">{{ s.zone }}</span></span>
                <span v-if="s.frozen" class="cell-sub">frozen by {{ s.frozenBy }}</span>
                <span v-else class="cell-sub">lot {{ fmtQty(s.qty) }} · allocated {{ fmtQty(s.reserved) }} · movable {{ fmtQty(s.movable) }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="3. Destination bin">
          <el-select v-model="form.tgtBin" :disabled="!form.srcBin" filterable placeholder="Choose destination" class="w-full">
            <el-option :value="TRANSIT_BIN" :label="`${TRANSIT_BIN} – Back to Transit`">
              <div class="opt-row">
                <span><b>{{ TRANSIT_BIN }}</b> <span class="cell-sub">{{ TRANSIT_ZONE }}</span></span>
                <span class="cell-sub">Back to Transit → creates a new inbound for putaway</span>
              </div>
            </el-option>
            <el-option v-for="t in tgtOptions" :key="t.bin" :value="t.bin" :disabled="t.frozen" :label="`${t.bin} (${t.zone})`">
              <div class="opt-row">
                <span><b>{{ t.bin }}</b> <span class="cell-sub">{{ t.zone }}</span></span>
                <span v-if="t.frozen" class="cell-sub">frozen by {{ t.frozenBy }}</span>
                <span v-else class="cell-sub">free {{ fmtQty(t.free) }}</span>
              </div>
            </el-option>
          </el-select>
          <div v-if="form.tgtBin === TRANSIT_BIN" class="trf-hint">
            The goods go back to {{ TRANSIT_BIN }} and a new inbound document is created; put it away again from Inbound Receiving.
          </div>
        </el-form-item>

        <div class="trf-qty-row">
          <el-form-item label="4. Movable qty">
            <el-input :model-value="form.srcBin ? `${fmtQty(movable)} ${unit}` : '-'" readonly />
          </el-form-item>
          <el-form-item label="5. Qty to move">
            <el-input-number v-model="form.qty" :min="0" :max="movable || undefined" :step="1" step-strictly
              :controls="false" :disabled="!form.srcBin" class="w-full" />
          </el-form-item>
        </div>
      </el-form>

      <el-alert v-if="touched" :type="validation.ok ? 'success' : 'warning'" :closable="false" show-icon
        :title="validation.ok ? 'Ready to transfer.' : validation.msg" />

      <DocCollabSection :doc-key="collab.key.value" />

      <template #footer>
        <el-button @click="dlgOpen = false">Cancel</el-button>
        <el-button type="primary" :disabled="!validation.ok || !access.can('stock-transfer', 'create')" @click="submit">Execute transfer</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.trf-kpis {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 16px;
}
.cell-strong {
  font-weight: 600;
  color: var(--gray-900);
}
.cell-sub {
  font-size: 12px;
  color: var(--gray-500);
}
.cell-link {
  font-size: 12px;
}
.w-full {
  width: 100%;
}
.opt-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.trf-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--gray-500);
  line-height: 1.4;
}
.trf-qty-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.trf-form :deep(.el-form-item__content) {
  flex-direction: column;
  align-items: stretch;
}
@media (max-width: 760px) {
  .trf-kpis {
    grid-template-columns: minmax(0, 1fr);
  }
  .trf-qty-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
