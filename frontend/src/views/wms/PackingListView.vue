<script setup lang="ts">
// Packing List: pack picked outbound DOs into cartons (documents PL-…), continue drafts, repack lists
// the Checking List rejected, and print them.
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Printer } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import TransactionFilterBar from '../../components/TransactionFilterBar.vue'
import { useListFilter } from './useListFilter'
import { fmtDate, fmtDateTime, fmtQty } from './wmsUi'
import { printPackingList } from './wmsPrint'
import { useWmsStore } from '../../stores/wmsStore'
import { PACKING_STATUSES, PACKING_STATUS_COLOR, packedQty, usePackingStore, type PackingList } from '../../stores/packingStore'
import { useAccessStore } from '../../stores/accessStore'
import PackingDialog from './PackingDialog.vue'

const wms = useWmsStore()
const store = usePackingStore()
const access = useAccessStore()
const dialog = ref<InstanceType<typeof PackingDialog> | null>(null)

// ---------------------------------------------------------------- waiting to be packed
const waiting = computed(() => store.packableOutbound().map((x) => ({
  id: x.doc.id,
  no: x.doc.no,
  customer: x.doc.customer,
  date: x.doc.date,
  round: x.source.round,
  shipped: x.doc.dispatched || x.doc.shipments.some((s) => s.no === x.source.round),
  lines: x.source.lines.length,
  qty: x.source.lines.reduce((a, l) => a + l.qty, 0),
})))

// ---------------------------------------------------------------- list
const page = ref(1)
const pageSize = 10

const sorted = computed(() => [...store.lists].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
const { filters, fieldOptions, filtered, reset, refresh, refreshing } = useListFilter(() => sorted.value, {
  date: (p) => p.date,
  status: (p) => p.status,
  fields: [
    { label: 'No', value: 'no', get: (p) => p.no },
    { label: 'Outbound DO', value: 'outboundNo', get: (p) => p.outboundNo },
    { label: 'Customer', value: 'customer', get: (p) => p.customer },
    { label: 'SKU', value: 'sku', get: (p) => p.lines.map((l) => `${l.sku} ${wms.skuName(l.sku)}`).join(' ') },
    { label: 'Batch', value: 'batch', get: (p) => p.lines.map((l) => l.batch).join(' ') },
    { label: 'Created by', value: 'createdBy', get: (p) => p.createdBy },
  ],
}, page)
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

const linesOf = (p: PackingList, carton: number) => p.lines.filter((l) => l.carton === carton)
const cartonQty = (p: PackingList, carton: number) => linesOf(p, carton).reduce((a, l) => a + l.qty, 0)
const totalWeight = (p: PackingList) => p.cartons.reduce((a, c) => a + (Number(c.weight) || 0), 0)
const canPack = computed(() => access.can('packing-list', 'create'))
const canEdit = (p: PackingList) => (p.status === 'DRAFT' || p.status === 'DISCREPANCY') && access.can('packing-list', 'edit')
const canDelete = (p: PackingList) => p.status === 'DRAFT' && access.can('packing-list', 'delete')

async function removeDoc(p: PackingList) {
  try {
    await ElMessageBox.confirm(`Delete draft ${p.no}?`, 'Delete packing list', { type: 'warning', confirmButtonText: 'Delete' })
  } catch {
    return
  }
  const r = store.remove(p.id)
  ElMessage[r.ok ? 'success' : 'warning'](r.msg)
}

function print(p: PackingList) {
  if (!printPackingList(p)) ElMessage.warning('Allow pop-ups to print the packing list.')
}
</script>

<template>
  <div class="page">
    <PageHeader title="Packing List" subtitle="Pack picked outbound goods into cartons (documents PL-…). Packed lists go to the Checking List.">
      <template #actions>
        <el-button v-if="canPack" type="primary" :disabled="!waiting.length" @click="dialog?.openCreate()">+ New packing list</el-button>
      </template>
    </PageHeader>

    <div v-if="waiting.length" class="card pl-card">
      <div class="pl-title">Waiting to be packed <span class="pl-count">{{ waiting.length }}</span></div>
      <el-table :data="waiting" row-key="id">
        <el-table-column label="Date" width="130">
          <template #default="{ row }">{{ fmtDate(row.date) }}</template>
        </el-table-column>
        <el-table-column label="Outbound DO" min-width="170">
          <template #default="{ row }"><span class="cell-strong">{{ row.no }}</span></template>
        </el-table-column>
        <el-table-column prop="customer" label="Customer" min-width="200" />
        <el-table-column label="Shipment" width="160">
          <template #default="{ row }">
            <div>#{{ row.round }}</div>
            <div class="cell-sub">{{ row.shipped ? 'already dispatched' : 'picked, not dispatched' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Lines" width="80" align="right">
          <template #default="{ row }">{{ row.lines }}</template>
        </el-table-column>
        <el-table-column label="Qty" width="100" align="right">
          <template #default="{ row }">{{ fmtQty(row.qty) }}</template>
        </el-table-column>
        <el-table-column label="" width="110" align="right">
          <template #default="{ row }">
            <el-button v-if="canPack" size="small" type="primary" @click="dialog?.openCreate(row.id)">Pack</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="card">
      <TransactionFilterBar
        v-model="filters"
        :fields="fieldOptions"
        :statuses="PACKING_STATUSES"
        :loading="refreshing"
        @reset="reset"
        @refresh="refresh"
      />

      <el-table :data="paged" row-key="no" empty-text="No packing lists yet">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="pl-expand">
              <div v-for="c in row.cartons" :key="c.no" class="pl-carton">
                <div class="pl-carton-head">
                  <b>Carton #{{ c.no }}</b>
                  <span class="cell-sub">{{ fmtQty(cartonQty(row, c.no)) }} pcs<template v-if="c.weight"> · {{ c.weight }} kg</template><template v-if="c.dims"> · {{ c.dims }} cm</template></span>
                </div>
                <el-table :data="linesOf(row, c.no)" size="small">
                  <el-table-column prop="sku" label="SKU" width="110" />
                  <el-table-column label="Name" min-width="220">
                    <template #default="{ row: l }">{{ wms.skuName(l.sku) }}</template>
                  </el-table-column>
                  <el-table-column prop="batch" label="Batch" min-width="130" />
                  <el-table-column label="Expiry" width="130">
                    <template #default="{ row: l }">{{ fmtDate(l.exp) }}</template>
                  </el-table-column>
                  <el-table-column label="Qty" width="120" align="right">
                    <template #default="{ row: l }"><b>{{ fmtQty(l.qty) }}</b> <span class="cell-sub">{{ wms.skuUnit(l.sku) }}</span></template>
                  </el-table-column>
                </el-table>
              </div>
              <div class="pl-expand-foot cell-sub">
                <span v-if="row.note">Note: {{ row.note }}</span>
                <span v-if="row.checkedBy">Checked by {{ row.checkedBy }}, {{ fmtDateTime(row.checkedAt) }}</span>
                <span v-if="row.checkNote">Check note: {{ row.checkNote }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Date" width="130">
          <template #default="{ row }">{{ fmtDate(row.date) }}</template>
        </el-table-column>
        <el-table-column label="No" min-width="170">
          <template #default="{ row }"><span class="cell-strong">{{ row.no }}</span></template>
        </el-table-column>
        <el-table-column label="Outbound DO" min-width="170">
          <template #default="{ row }">
            <div>{{ row.outboundNo }}</div>
            <div class="cell-sub">Shipment #{{ row.round }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="customer" label="Customer" min-width="190" />
        <el-table-column label="Cartons" width="100" align="right">
          <template #default="{ row }">
            <div>{{ row.cartons.length }}</div>
            <div v-if="totalWeight(row)" class="cell-sub">{{ totalWeight(row).toFixed(1) }} kg</div>
          </template>
        </el-table-column>
        <el-table-column label="Qty" width="100" align="right">
          <template #default="{ row }">{{ fmtQty(packedQty(row)) }}</template>
        </el-table-column>
        <el-table-column label="Status" width="140">
          <template #default="{ row }">
            <span class="status-pill" :class="PACKING_STATUS_COLOR[row.status as PackingList['status']]">{{ row.status }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdBy" label="Created by" min-width="130" />
        <el-table-column label="" width="190" align="right">
          <template #default="{ row }">
            <el-button v-if="canEdit(row)" size="small" :type="row.status === 'DISCREPANCY' ? 'warning' : 'primary'" @click="dialog?.openEdit(row)">
              {{ row.status === 'DISCREPANCY' ? 'Repack' : 'Continue' }}
            </el-button>
            <el-button v-if="canDelete(row)" size="small" :icon="Delete" type="danger" plain title="Delete" @click="removeDoc(row)" />
            <el-button size="small" :icon="Printer" title="Print packing list" @click="print(row)" />
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar v-model:page="page" :page-size="pageSize" :total="filtered.length" />
    </div>

    <PackingDialog ref="dialog" />

  </div>
</template>

<style scoped>
.pl-card {
  margin-bottom: 16px;
}
.pl-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-weight: 600;
  color: var(--gray-900);
}
.pl-count {
  padding: 0 8px;
  border-radius: 999px;
  background: var(--gray-100);
  font-size: 12px;
  color: var(--gray-500);
}
.pl-expand {
  display: grid;
  gap: 12px;
  padding: 8px 24px 12px 48px;
}
.pl-carton-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 4px;
}
.cell-strong {
  font-weight: 600;
  color: var(--gray-900);
}
.cell-sub {
  font-size: 12px;
  color: var(--gray-500);
}
.pl-expand-foot {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
</style>
