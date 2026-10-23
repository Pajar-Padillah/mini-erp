<script setup lang="ts">
// Checking List: re-count every carton of a packed list (scan or type the counts)
// before dispatch. Matching counts → CHECKED; any difference → DISCREPANCY, back to repacking in the Packing List.
import { computed, nextTick, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import TransactionFilterBar from '../../components/TransactionFilterBar.vue'
import { useListFilter } from './useListFilter'
import { fmtDate, fmtDateTime, fmtQty } from './wmsUi'
import { outboundReady, useWmsStore } from '../../stores/wmsStore'
import { PACKING_STATUSES, PACKING_STATUS_COLOR, checkedQty, packedQty, usePackingStore, type PackingList } from '../../stores/packingStore'
import { useAccessStore } from '../../stores/accessStore'

const wms = useWmsStore()
const store = usePackingStore()
const access = useAccessStore()

// Drafts are still being packed, so they are not shown here.
const CHECK_STATUSES = PACKING_STATUSES.filter((s) => s.value !== 'DRAFT')

// ---------------------------------------------------------------- list
const page = ref(1)
const pageSize = 10

const ORDER = { PACKED: 0, DISCREPANCY: 1, CHECKED: 2, DRAFT: 3 }
const rows = computed(() => store.lists
  .filter((p) => p.status !== 'DRAFT')
  .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.createdAt.localeCompare(a.createdAt)))
const { filters, fieldOptions, filtered, reset, refresh, refreshing } = useListFilter(() => rows.value, {
  date: (p) => p.date,
  status: (p) => p.status,
  fields: [
    { label: 'No', value: 'no', get: (p) => p.no },
    { label: 'Outbound DO', value: 'outboundNo', get: (p) => p.outboundNo },
    { label: 'Customer', value: 'customer', get: (p) => p.customer },
    { label: 'SKU', value: 'sku', get: (p) => p.lines.map((l) => `${l.sku} ${wms.skuName(l.sku)}`).join(' ') },
    { label: 'Checked by', value: 'checkedBy', get: (p) => p.checkedBy },
  ],
}, page)
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
/** A checked list whose outbound round is picked and still waiting to leave the warehouse. */
function dispatchable(p: PackingList) {
  if (p.status !== 'CHECKED' || p.outboundId == null) return false
  const d = wms.outbound.find((x) => x.id === p.outboundId)
  return !!d && outboundReady(d) && d.shipments.length + 1 === p.round
}
const dispatched = (p: PackingList) => !!wms.outbound.find((x) => x.id === p.outboundId)?.shipments.some((s) => s.no === p.round)
async function dispatchDoc(p: PackingList) {
  try {
    await ElMessageBox.confirm(`Dispatch ${p.outboundNo} (shipment #${p.round}, ${p.cartons.length} carton(s)) to ${p.customer}?`, 'Dispatch', { confirmButtonText: 'Dispatch' })
  } catch {
    return
  }
  const r = wms.dispatch(p.outboundId!)
  ElMessage[r.ok ? 'success' : 'warning'](r.msg)
}
const pct = (p: PackingList) => (packedQty(p) ? Math.round((checkedQty(p) / packedQty(p)) * 100) : 0)

// ---------------------------------------------------------------- check dialog
const dlgOpen = ref(false)
const doc = ref<PackingList | null>(null)
const counts = ref<number[]>([])
const carton = ref<number | 'all'>('all')
const scan = ref('')
const scanQty = ref(1)
const scanInput = ref<{ focus: () => void } | null>(null)
const lastScan = ref<{ ok: boolean; msg: string } | null>(null)

const editable = computed(() => doc.value?.status === 'PACKED' && access.can('checking-list', 'execute'))
const shown = computed(() => (doc.value?.lines ?? [])
  .map((l, i) => ({ ...l, idx: i }))
  .filter((l) => carton.value === 'all' || l.carton === carton.value))
const variance = (idx: number) => (counts.value[idx] ?? 0) - (doc.value?.lines[idx]?.qty ?? 0)
const totalPacked = computed(() => (doc.value ? packedQty(doc.value) : 0))
const totalCounted = computed(() => counts.value.reduce((a, n) => a + (Number(n) || 0), 0))
const mismatches = computed(() => (doc.value?.lines ?? []).filter((_, i) => variance(i) !== 0).length)

function openCheck(p: PackingList) {
  doc.value = p
  counts.value = p.lines.map((l) => l.checkedQty)
  carton.value = 'all'
  scan.value = ''
  scanQty.value = 1
  lastScan.value = null
  dlgOpen.value = true
  nextTick(() => scanInput.value?.focus())
}

/** Scan a SKU or batch code: adds the qty to the first matching line that is not full yet. */
function onScan() {
  const code = scan.value.trim().toUpperCase()
  scan.value = ''
  if (!code || !doc.value) return
  const qty = Math.max(1, Number(scanQty.value) || 1)
  const matches = shown.value.filter((l) => l.sku.toUpperCase() === code || l.batch.toUpperCase() === code)
  if (!matches.length) {
    lastScan.value = { ok: false, msg: `${code} is not in ${carton.value === 'all' ? 'this packing list' : `carton #${carton.value}`}.` }
    return
  }
  const target = matches.find((l) => (counts.value[l.idx] ?? 0) < l.qty) ?? matches[0]!
  counts.value[target.idx] = (counts.value[target.idx] ?? 0) + qty
  const over = variance(target.idx) > 0
  lastScan.value = {
    ok: !over,
    msg: `${target.sku} · ${target.batch} · carton #${target.carton}: ${fmtQty(counts.value[target.idx]!)} / ${fmtQty(target.qty)}${over ? ' – over the packed qty!' : ''}`,
  }
  scanQty.value = 1
}

function fillAll() {
  if (!doc.value) return
  counts.value = doc.value.lines.map((l, i) => (carton.value === 'all' || l.carton === carton.value ? l.qty : counts.value[i] ?? 0))
}
function resetCounts() {
  counts.value = (doc.value?.lines ?? []).map(() => 0)
  lastScan.value = null
}

function saveProgress() {
  if (!doc.value) return
  const r = store.saveCheck(doc.value.id, counts.value, false)
  ElMessage[r.ok ? 'success' : 'warning'](r.msg)
  if (r.ok) dlgOpen.value = false
}
async function confirmCheck() {
  if (!doc.value) return
  let note = ''
  if (mismatches.value) {
    try {
      const res = await ElMessageBox.prompt(
        `${mismatches.value} line(s) do not match the packed qty. The packing list goes back to the Packing List for repacking.`,
        'Confirm discrepancy',
        { type: 'warning', confirmButtonText: 'Confirm discrepancy', inputPlaceholder: 'What was wrong? (e.g. carton 2 short 2 pcs)' },
      )
      note = res.value ?? ''
    } catch {
      return
    }
  }
  const r = store.saveCheck(doc.value.id, counts.value, true, note)
  ElMessage[r.ok ? (mismatches.value ? 'warning' : 'success') : 'warning'](r.msg)
  if (r.ok) dlgOpen.value = false
}
</script>

<template>
  <div class="page">
    <PageHeader title="Checking List" subtitle="Re-count every packed carton before dispatch – scan a SKU or batch, or type the counted qty." />

    <div class="card">
      <TransactionFilterBar
        v-model="filters"
        :fields="fieldOptions"
        :statuses="CHECK_STATUSES"
        :loading="refreshing"
        @reset="reset"
        @refresh="refresh"
      />

      <el-table :data="paged" row-key="no" empty-text="No packed lists to check">
        <el-table-column label="Date" width="130">
          <template #default="{ row }">{{ fmtDate(row.date) }}</template>
        </el-table-column>
        <el-table-column label="Packing list" min-width="170">
          <template #default="{ row }"><span class="cell-strong">{{ row.no }}</span></template>
        </el-table-column>
        <el-table-column label="Outbound DO" min-width="160">
          <template #default="{ row }">
            <div>{{ row.outboundNo }}</div>
            <div class="cell-sub">Shipment #{{ row.round }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="customer" label="Customer" min-width="190" />
        <el-table-column label="Cartons" width="90" align="right">
          <template #default="{ row }">{{ row.cartons.length }}</template>
        </el-table-column>
        <el-table-column label="Checked" width="170">
          <template #default="{ row }">
            <div class="cell-sub">{{ fmtQty(checkedQty(row)) }} / {{ fmtQty(packedQty(row)) }}</div>
            <el-progress :percentage="pct(row)" :show-text="false" :stroke-width="6"
              :status="row.status === 'CHECKED' ? 'success' : row.status === 'DISCREPANCY' ? 'exception' : undefined" />
          </template>
        </el-table-column>
        <el-table-column label="Status" width="140">
          <template #default="{ row }">
            <span class="status-pill" :class="PACKING_STATUS_COLOR[row.status as PackingList['status']]">{{ row.status }}</span>
            <div v-if="row.status === 'CHECKED' && dispatched(row)" class="cell-sub">Dispatched</div>
          </template>
        </el-table-column>
        <el-table-column label="Checked by" min-width="170">
          <template #default="{ row }">
            <template v-if="row.checkedBy">
              <div>{{ row.checkedBy }}</div>
              <div class="cell-sub">{{ fmtDateTime(row.checkedAt) }}</div>
            </template>
            <span v-else class="cell-sub">-</span>
          </template>
        </el-table-column>
        <el-table-column label="" width="170" align="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'PACKED' && access.can('checking-list', 'execute')" size="small" type="primary" @click="openCheck(row)">Check</el-button>
            <el-button v-else size="small" @click="openCheck(row)">View</el-button>
            <el-button v-if="dispatchable(row) && access.can('checking-list', 'execute')" size="small" type="success" @click="dispatchDoc(row)">Dispatch</el-button>
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar v-model:page="page" :page-size="pageSize" :total="filtered.length" />
    </div>

    <el-dialog v-model="dlgOpen" :title="doc ? `${editable ? 'Check' : 'View'} ${doc.no}` : ''" width="1000px" top="5vh">
      <template v-if="doc">
        <div class="pc-meta">
          <span><span class="cell-sub">Outbound</span> {{ doc.outboundNo }} · shipment #{{ doc.round }}</span>
          <span><span class="cell-sub">Customer</span> {{ doc.customer }}</span>
          <span class="status-pill" :class="PACKING_STATUS_COLOR[doc.status]">{{ doc.status }}</span>
        </div>

        <el-alert v-if="doc.status === 'DISCREPANCY'" type="error" :closable="false" show-icon class="pc-gap"
          :title="`Discrepancy${doc.checkNote ? `: ${doc.checkNote}` : ''} – waiting to be repacked in the Packing List.`" />
        <el-alert v-else-if="doc.status === 'CHECKED'" type="success" :closable="false" show-icon class="pc-gap"
          :title="`Checked by ${doc.checkedBy} on ${fmtDateTime(doc.checkedAt)} – ready to dispatch.`" />

        <div v-if="editable" class="pc-scan">
          <el-input ref="scanInput" v-model="scan" placeholder="Scan or type SKU / batch, then Enter" clearable class="pc-scan-input" @keyup.enter="onScan" />
          <el-input-number v-model="scanQty" :min="1" :step="1" step-strictly :controls="false" class="pc-scan-qty" />
          <el-button type="primary" @click="onScan">Add</el-button>
        </div>
        <div v-if="lastScan" class="pc-last" :class="lastScan.ok ? 'is-pos' : 'is-neg'">{{ lastScan.msg }}</div>

        <el-radio-group v-model="carton" size="small" class="pc-gap">
          <el-radio-button value="all">All cartons</el-radio-button>
          <el-radio-button v-for="c in doc.cartons" :key="c.no" :value="c.no">#{{ c.no }}</el-radio-button>
        </el-radio-group>

        <el-table :data="shown" size="small" row-key="idx">
          <el-table-column label="Carton" width="80">
            <template #default="{ row }">#{{ row.carton }}</template>
          </el-table-column>
          <el-table-column prop="sku" label="SKU" width="100" />
          <el-table-column label="Name" min-width="200">
            <template #default="{ row }">{{ wms.skuName(row.sku) }}</template>
          </el-table-column>
          <el-table-column prop="batch" label="Batch" min-width="120" />
          <el-table-column label="Expiry" width="115">
            <template #default="{ row }">{{ fmtDate(row.exp) }}</template>
          </el-table-column>
          <el-table-column label="Packed" width="90" align="right">
            <template #default="{ row }">{{ fmtQty(row.qty) }}</template>
          </el-table-column>
          <el-table-column label="Counted" width="120">
            <template #default="{ row }">
              <el-input-number v-if="editable" v-model="counts[row.idx]" :min="0" :step="1" step-strictly :controls="false" size="small" class="w-full" />
              <span v-else>{{ fmtQty(counts[row.idx] ?? 0) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Diff" width="80" align="right">
            <template #default="{ row }">
              <b v-if="variance(row.idx) !== 0" class="is-neg">{{ variance(row.idx) > 0 ? '+' : '' }}{{ variance(row.idx) }}</b>
              <span v-else class="is-pos">✓</span>
            </template>
          </el-table-column>
        </el-table>

        <div class="pc-foot">
          <span class="cell-sub">Counted <b>{{ fmtQty(totalCounted) }}</b> of {{ fmtQty(totalPacked) }}<template v-if="mismatches"> · <b class="is-neg">{{ mismatches }} line(s) differ</b></template></span>
          <span v-if="editable" class="pc-foot-btns">
            <el-button size="small" @click="fillAll">Count all as packed</el-button>
            <el-button size="small" @click="resetCounts">Reset counts</el-button>
          </span>
        </div>
      </template>

      <template #footer>
        <el-button @click="dlgOpen = false">{{ editable ? 'Cancel' : 'Close' }}</el-button>
        <template v-if="editable">
          <el-button @click="saveProgress">Save progress</el-button>
          <el-button :type="mismatches ? 'warning' : 'primary'" @click="confirmCheck">{{ mismatches ? 'Confirm with discrepancy' : 'Confirm check' }}</el-button>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.cell-strong {
  font-weight: 600;
  color: var(--gray-900);
}
.cell-sub {
  font-size: 12px;
  color: var(--gray-500);
}
.is-pos {
  color: var(--success);
}
.is-neg {
  color: var(--danger);
}
.w-full {
  width: 100%;
}
.pc-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 24px;
  margin-bottom: 16px;
}
.pc-gap {
  margin-bottom: 12px;
}
.pc-scan {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.pc-scan-input {
  flex: 1;
  min-width: 0;
}
.pc-scan-qty {
  width: 80px;
}
.pc-last {
  font-size: 13px;
  margin-bottom: 12px;
}
.pc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.pc-foot-btns {
  display: flex;
  gap: 8px;
}
</style>
