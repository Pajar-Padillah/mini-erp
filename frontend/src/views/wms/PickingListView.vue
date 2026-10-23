<script setup lang="ts">
// Picking List: the pick work queue. Created from a Sales Order (or an outbound DO); allocate FEFO,
// pick each line from its bins and print the pick list. Picked DOs move on to the Packing List.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Printer } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import TransactionFilterBar from '../../components/TransactionFilterBar.vue'
import { useListFilter } from './useListFilter'
import { OUTBOUND_STATUS_COLOR, fmtDate, fmtQty } from './wmsUi'
import { printPicklist } from './wmsPrint'
import { itemOutstanding, outboundProgress, outboundStatus, useWmsStore, type Outbound, type OutboundItem, type OutboundStatus } from '../../stores/wmsStore'
import { useAccessStore } from '../../stores/accessStore'
import PickingFromSoDialog from './PickingFromSoDialog.vue'

const store = useWmsStore()
const access = useAccessStore()
const route = useRoute()
const router = useRouter()
const fromSo = ref<InstanceType<typeof PickingFromSoDialog> | null>(null)

// Deep link from a Sales Order: /inventory/picking-list?so=<id> (also when the tab is already open).
function openFromQuery() {
  const so = Number(route.query.so)
  if (!so || !access.can('picking-list', 'create')) return
  fromSo.value?.show(so)
  router.replace({ query: {} })
}
onMounted(openFromQuery)
watch(() => route.query.so, openFromQuery)

const PICK_STATUSES: OutboundStatus[] = ['PENDING', 'ALLOCATED', 'PARTIAL PICKED', 'READY TO SHIP', 'OUTSTANDING']
const statusOptions = PICK_STATUSES.map((st) => ({ label: st, value: st, color: OUTBOUND_STATUS_COLOR[st] }))

// ---------------------------------------------------------------- list
const page = ref(1)
const pageSize = 10

/** Open DOs: not dispatched and still something to allocate, pick or ship. */
const open = computed(() => [...store.outbound]
  .filter((d) => !d.dispatched && d.items.some((i) => i.status !== 'SHIPPED' && itemOutstanding(i) > 0))
  .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id))
const { filters, fieldOptions, filtered, reset, refresh, refreshing } = useListFilter(() => open.value, {
  date: (d) => d.date,
  status: (d) => outboundStatus(d),
  fields: [
    { label: 'DO no.', value: 'no', get: (d) => d.no },
    { label: 'Sales Order / PO', value: 'poCust', get: (d) => d.poCust },
    { label: 'Customer', value: 'customer', get: (d) => d.customer },
    { label: 'SKU', value: 'sku', get: (d) => d.items.map((i) => `${i.sku} ${store.skuName(i.sku)}`).join(' ') },
    { label: 'Bin', value: 'bin', get: (d) => d.items.flatMap((i) => i.allocations.map((a) => a.bin)).join(' ') },
  ],
}, page)
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

const canExec = computed(() => access.can('picking-list', 'execute'))
const toPick = (d: Outbound) => d.items.filter((i) => i.status === 'ALLOCATED').length
const toAllocate = (d: Outbound) => d.items.filter((i) => i.status === 'PENDING' && itemOutstanding(i) > 0).length
const lineRows = (d: Outbound) => d.items
  .map((it, idx) => ({ it, idx }))
  .filter(({ it }) => it.status !== 'SHIPPED' && itemOutstanding(it) > 0)
const locations = (it: OutboundItem) => (it.status === 'PENDING' ? store.buildFefoPlan(it) : it.allocations.filter((a) => a.qty > 0))
const LINE_COLOR: Record<string, string> = { PENDING: 'gray', ALLOCATED: 'blue', PICKED: 'green' }

function report(r: { ok: boolean; msg: string }) {
  ElMessage[r.ok ? 'success' : 'warning'](r.msg)
  return r.ok
}
function allocate(d: Outbound, idx: number) {
  const it = d.items[idx]
  if (!it) return
  const plan = store.buildFefoPlan(it)
  if (!plan.length) return ElMessage.warning(`${it.sku}: no available stock to allocate.`)
  report(store.allocateItem(d.id, idx, plan))
}
function pick(d: Outbound, idx: number) {
  report(store.executePick(d.id, idx))
}
/** Allocate (FEFO) every pending line, then pick every allocated line of the DO. */
function pickAll(d: Outbound) {
  const msgs: string[] = []
  d.items.forEach((it, idx) => {
    if (it.status !== 'PENDING' || itemOutstanding(it) <= 0) return
    const plan = store.buildFefoPlan(it)
    if (!plan.length) msgs.push(`${it.sku}: no stock`)
    else if (!store.allocateItem(d.id, idx, plan).ok) msgs.push(`${it.sku}: not allocated`)
  })
  let picked = 0
  d.items.forEach((it, idx) => {
    if (it.status !== 'ALLOCATED') return
    const r = store.executePick(d.id, idx)
    if (r.ok) picked++
    else msgs.push(r.msg)
  })
  if (picked && !msgs.length) ElMessage.success(`${d.no}: ${picked} line(s) picked – ready for packing.`)
  else if (picked) ElMessage.warning(`${d.no}: ${picked} line(s) picked. ${msgs.join(' · ')}`)
  else ElMessage.warning(msgs.join(' · ') || 'Nothing to pick.')
}
function print(d: Outbound) {
  if (!printPicklist(d)) ElMessage.warning('Allow pop-ups to print the pick list.')
}
</script>

<template>
  <div class="page">
    <PageHeader title="Picking List" subtitle="Sales Order → pick bin by bin (FEFO). Picked goods move on to the Packing List.">
      <template #actions>
        <el-button v-if="access.can('picking-list', 'create')" type="primary" @click="fromSo?.show()">+ From Sales Order</el-button>
      </template>
    </PageHeader>

    <div class="card">
      <TransactionFilterBar
        v-model="filters"
        :fields="fieldOptions"
        :statuses="statusOptions"
        :loading="refreshing"
        @reset="reset"
        @refresh="refresh"
      />

      <el-table :data="paged" row-key="id" empty-text="No open outbound to pick">
        <el-table-column type="expand">
          <template #default="{ row: d }">
            <div class="pk-expand">
              <el-table :data="lineRows(d)" size="small">
                <el-table-column label="SKU" min-width="220">
                  <template #default="{ row: { it } }">
                    <div class="cell-strong">{{ it.sku }}</div>
                    <div class="cell-sub">{{ store.skuName(it.sku) }}</div>
                  </template>
                </el-table-column>
                <el-table-column label="To pick" width="110" align="right">
                  <template #default="{ row: { it } }">{{ fmtQty(itemOutstanding(it)) }} <span class="cell-sub">{{ store.skuUnit(it.sku) }}</span></template>
                </el-table-column>
                <el-table-column label="Status" width="120">
                  <template #default="{ row: { it } }"><span class="status-pill" :class="LINE_COLOR[it.status]">{{ it.status }}</span></template>
                </el-table-column>
                <el-table-column label="Bin · batch · qty" min-width="300">
                  <template #default="{ row: { it } }">
                    <div v-if="!locations(it).length" class="is-neg cell-sub">No available stock</div>
                    <div v-for="(a, ai) in locations(it)" :key="ai" class="pk-loc">
                      <b>{{ a.bin }}</b>
                      <span>{{ a.batch }}</span>
                      <span class="cell-sub">exp {{ fmtDate(a.exp) }}</span>
                      <b>{{ fmtQty(a.qty) }}</b>
                      <span v-if="it.status === 'PENDING'" class="cell-sub">(proposed)</span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="" width="120" align="right">
                  <template #default="{ row: { it, idx } }">
                    <template v-if="canExec">
                      <el-button v-if="it.status === 'PENDING'" size="small" @click="allocate(d, idx)">Allocate</el-button>
                      <el-button v-else-if="it.status === 'ALLOCATED'" size="small" type="primary" @click="pick(d, idx)">Pick</el-button>
                    </template>
                    <span v-if="it.status === 'PICKED'" class="is-pos">✓ picked</span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Date" width="130">
          <template #default="{ row }">{{ fmtDate(row.date) }}</template>
        </el-table-column>
        <el-table-column label="DO no." min-width="160">
          <template #default="{ row }">
            <span class="cell-strong">{{ row.no }}</span>
            <div v-if="row.shipments.length" class="cell-sub">{{ row.shipments.length }} shipment(s) sent</div>
          </template>
        </el-table-column>
        <el-table-column label="Sales Order / PO" min-width="160">
          <template #default="{ row }">{{ row.poCust || '-' }}</template>
        </el-table-column>
        <el-table-column prop="customer" label="Customer" min-width="200" />
        <el-table-column label="To do" min-width="150">
          <template #default="{ row }">
            <div v-if="toAllocate(row)" class="cell-sub">{{ toAllocate(row) }} to allocate</div>
            <div v-if="toPick(row)" class="cell-sub">{{ toPick(row) }} to pick</div>
            <div v-if="!toAllocate(row) && !toPick(row)" class="cell-sub is-pos">Picked – go to Packing List</div>
          </template>
        </el-table-column>
        <el-table-column label="Progress" width="150">
          <template #default="{ row }">
            <el-progress :percentage="outboundProgress(row).pct" :stroke-width="6" />
          </template>
        </el-table-column>
        <el-table-column label="Status" width="150">
          <template #default="{ row }">
            <span class="status-pill" :class="OUTBOUND_STATUS_COLOR[outboundStatus(row)]">{{ outboundStatus(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="" width="150" align="right">
          <template #default="{ row }">
            <el-button v-if="canExec && (toAllocate(row) || toPick(row))" size="small" type="primary" @click="pickAll(row)">Pick all</el-button>
            <el-button size="small" :icon="Printer" title="Print pick list" @click="print(row)" />
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar v-model:page="page" :page-size="pageSize" :total="filtered.length" />
    </div>

    <PickingFromSoDialog ref="fromSo" />
  </div>
</template>

<style scoped>
.pk-expand {
  padding: 8px 24px 12px 48px;
}
.pk-loc {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}
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
</style>
