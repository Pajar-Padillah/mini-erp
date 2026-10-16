<script setup lang="ts">
// Stock Movement: browse the batch ledger (every stock movement) with the standard list filters.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import TransactionFilterBar from '../../components/TransactionFilterBar.vue'
import { useListFilter } from './useListFilter'
import { fmtDateTime, fmtQty } from './wmsUi'
import { todayISO, useWmsStore, type LedgerType } from '../../stores/wmsStore'

const store = useWmsStore()
const router = useRouter()

const LEDGER_TYPES: LedgerType[] = [
  'INBOUND RECEIVING',
  'INBOUND PUTAWAY',
  'INBOUND CANCELLED',
  'OUTBOUND PICK',
  'DISPATCH',
  'TRANSFER',
  'STOCK ADJUSTMENT',
  'CYCLE COUNT ADJ',
]
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

function defaultRange(): string[] {
  const from = new Date()
  from.setDate(from.getDate() - 30)
  return [todayISO(from), todayISO()]
}
const page = ref(1)
const pageSize = 20

const sortedLedger = computed(() => [...store.ledger].sort((a, b) => b.ts.localeCompare(a.ts) || b.id - a.id))
const { filters, fieldOptions, filtered, reset, refresh, refreshing } = useListFilter(() => sortedLedger.value, {
  date: (e) => todayISO(new Date(e.ts)),
  defaultRange,
  status: (e) => e.type,
  fields: [
    { label: 'SKU', value: 'sku', get: (e) => e.sku },
    { label: 'Product', value: 'name', get: (e) => store.skuName(e.sku) },
    { label: 'Batch', value: 'batch', get: (e) => e.batch },
    { label: 'Ref', value: 'ref', get: (e) => e.ref },
    { label: 'Bin', value: 'bin', get: (e) => `${e.fromBin ?? ''} ${e.toBin ?? ''}` },
    { label: 'Qty', value: 'qty', get: (e) => e.qty },
  ],
}, page)
const typeOptions = LEDGER_TYPES.map((t) => ({ label: t, value: t, color: TYPE_COLOR[t] }))
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

const kpi = computed(() => {
  let inQty = 0
  let outQty = 0
  let moves = 0
  let adj = 0
  filtered.value.forEach((e) => {
    if (e.qty > 0) inQty += e.qty
    if (e.qty < 0) outQty += e.qty
    if (e.type === 'TRANSFER') moves++
    if (e.type === 'STOCK ADJUSTMENT' || e.type === 'CYCLE COUNT ADJ') adj += e.qty
  })
  return { inQty, outQty, moves, adj }
})

function openBatch(sku: string, batch: string, exp: string) {
  router.push({ path: '/inventory/batch-serial', query: { sku, batch, exp } })
}
</script>

<template>
  <div class="page">
    <PageHeader title="Stock Movement" subtitle="Every stock movement per batch: receiving, putaway, picking, transfers and adjustments" />

    <div class="dash-kpis sm-kpis">
      <div class="dash-kpi">
        <div class="dash-kpi-label">In</div>
        <div class="dash-kpi-value sm-pos">+{{ fmtQty(kpi.inQty) }}</div>
        <div class="dash-kpi-hint">Units added in the period</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Out</div>
        <div class="dash-kpi-value sm-neg">{{ fmtQty(kpi.outQty) }}</div>
        <div class="dash-kpi-hint">Units removed in the period</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Moves</div>
        <div class="dash-kpi-value">{{ fmtQty(kpi.moves) }}</div>
        <div class="dash-kpi-hint">Bin-to-bin transfers</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Adjustments</div>
        <div class="dash-kpi-value" :class="kpi.adj > 0 ? 'sm-pos' : kpi.adj < 0 ? 'sm-neg' : ''">{{ kpi.adj > 0 ? '+' : '' }}{{ fmtQty(kpi.adj) }}</div>
        <div class="dash-kpi-hint">Net of stock adjustments &amp; cycle counts</div>
      </div>
    </div>

    <div class="card">
      <TransactionFilterBar
        v-model="filters"
        :fields="fieldOptions"
        :statuses="typeOptions"
        :loading="refreshing"
        @reset="reset"
        @refresh="refresh"
      />

      <el-table :data="paged" row-key="id">
        <el-table-column label="Time" width="170">
          <template #default="{ row }">{{ fmtDateTime(row.ts) }}</template>
        </el-table-column>
        <el-table-column label="Type" width="190">
          <template #default="{ row }"><span class="status-pill" :class="TYPE_COLOR[row.type as LedgerType]">{{ row.type }}</span></template>
        </el-table-column>
        <el-table-column label="Ref" prop="ref" width="160">
          <template #default="{ row }"><span class="mono">{{ row.ref || '-' }}</span></template>
        </el-table-column>
        <el-table-column label="SKU" min-width="220">
          <template #default="{ row }">
            <div class="mono sm-sku">{{ row.sku }}</div>
            <div class="sm-hint">{{ store.skuName(row.sku) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Batch" min-width="130">
          <template #default="{ row }">
            <a class="sm-link" @click="openBatch(row.sku, row.batch, row.exp)">{{ row.batch }}</a>
          </template>
        </el-table-column>
        <el-table-column label="From → To" min-width="200">
          <template #default="{ row }">
            <span class="mono">{{ row.fromBin ?? '–' }}</span>
            <span class="sm-arrow">→</span>
            <span class="mono">{{ row.toBin ?? '–' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Qty" align="right" width="100">
          <template #default="{ row }">
            <b v-if="row.qty > 0" class="sm-pos">+{{ fmtQty(row.qty) }}</b>
            <b v-else-if="row.qty < 0" class="sm-neg">{{ fmtQty(row.qty) }}</b>
            <span v-else class="sm-hint">move</span>
          </template>
        </el-table-column>
        <el-table-column label="Note" prop="note" min-width="220" show-overflow-tooltip />
      </el-table>

      <PaginationBar v-model:page="page" :page-size="pageSize" :total="filtered.length" />
    </div>
  </div>
</template>

<style scoped>
.sm-kpis {
  margin-bottom: 16px;
}
.sm-pos {
  color: #15803d;
}
.sm-neg {
  color: #b91c1c;
}
.sm-hint {
  font-size: 12px;
  color: var(--gray-500);
}
.sm-sku {
  font-weight: 600;
}
.sm-link {
  color: var(--brand);
  cursor: pointer;
  font-weight: 600;
}
.sm-link:hover {
  text-decoration: underline;
}
.sm-arrow {
  margin: 0 6px;
  color: var(--gray-400);
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
