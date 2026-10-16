<script setup lang="ts">
// Stock Adjustment: manual +/- corrections per SKU / bin / batch (documents ADJ-…).
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import TransactionFilterBar from '../../components/TransactionFilterBar.vue'
import { useListFilter } from './useListFilter'
import ExpiryTag from './ExpiryTag.vue'
import { fmtDate, fmtQty } from './wmsUi'
import { binAvailCap, normLot, todayISO, useWmsStore, type Adjustment, type AdjustmentLine } from '../../stores/wmsStore'
import { useAccessStore } from '../../stores/accessStore'
import DocCollabSection from './DocCollabSection.vue'
import { useDocCollabKey } from './useDocCollabKey'

const store = useWmsStore()
const access = useAccessStore()

const REASONS = ['Stock opname difference', 'Damaged goods', 'Lost goods', 'Expired / destroyed', 'Sample / promotion', 'Input correction', 'Other']

// ---------------------------------------------------------------- list
const page = ref(1)
const pageSize = 10

const sortedAdjustments = computed(() => [...store.adjustments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
const { filters, fieldOptions, filtered, reset, refresh, refreshing } = useListFilter(() => sortedAdjustments.value, {
  date: (a) => a.date,
  status: (a) => a.reason,
  fields: [
    { label: 'No', value: 'no', get: (a) => a.no },
    { label: 'SKU', value: 'sku', get: (a) => a.lines.map((l) => `${l.sku} ${store.skuName(l.sku)}`).join(' ') },
    { label: 'Bin', value: 'bin', get: (a) => a.lines.map((l) => l.bin).join(' ') },
    { label: 'Batch', value: 'batch', get: (a) => a.lines.map((l) => l.batch).join(' ') },
    { label: 'Note', value: 'note', get: (a) => a.note },
    { label: 'Created by', value: 'createdBy', get: (a) => a.createdBy },
  ],
}, page)
const reasonOptions = REASONS.map((r) => ({ label: r, value: r, color: 'gray' }))
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

const totalOf = (a: Adjustment) => a.lines.reduce((s, l) => s + l.qty, 0)
const signed = (n: number) => (n > 0 ? `+${fmtQty(n)}` : n < 0 ? `-${fmtQty(-n)}` : '0')

// ---------------------------------------------------------------- new adjustment dialog
const dlgOpen = ref(false)
const form = reactive({ date: todayISO(), reason: '', note: '', lines: [] as AdjustmentLine[] })
const emptyLine = (): AdjustmentLine => ({ sku: '', bin: '', batch: '', exp: '', qty: 0 })

const activeSkus = computed(() => store.skus.filter((s) => !s.inactive))
const collab = useDocCollabKey('wms-adjustment')

function openNew() {
  form.date = todayISO()
  form.reason = ''
  form.note = ''
  form.lines = [emptyLine()]
  collab.startCreate()
  dlgOpen.value = true
}
function addLine() {
  form.lines.push(emptyLine())
}
function removeLine(i: number) {
  form.lines.splice(i, 1)
}

const skuOf = (l: AdjustmentLine) => store.sku(l.sku)

/** Bins holding the SKU first, then other storage bins that still have room. */
function binOptions(l: AdjustmentLine) {
  if (!l.sku) return []
  const holding = store.storageBins
    .filter((b) => b.lots.some((x) => x.sku === l.sku && x.qty > 0))
    .map((b) => ({ bin: b.bin, zone: b.zone, holds: b.lots.filter((x) => x.sku === l.sku).reduce((a, x) => a + x.qty, 0), free: binAvailCap(b), frozenBy: store.frozenBy(b.bin) }))
  const others = store.storageBins
    .filter((b) => !b.lots.some((x) => x.sku === l.sku && x.qty > 0) && binAvailCap(b) > 0)
    .map((b) => ({ bin: b.bin, zone: b.zone, holds: 0, free: binAvailCap(b), frozenBy: store.frozenBy(b.bin) }))
  const byBin = (a: { bin: string }, b: { bin: string }) => a.bin.localeCompare(b.bin)
  return [...holding.sort(byBin), ...others.sort(byBin)]
}

/** Lots of the line's SKU in the line's bin. */
function lotsInBin(l: AdjustmentLine) {
  const b = l.bin ? store.bin(l.bin) : undefined
  if (!b || !l.sku) return []
  return b.lots.filter((x) => x.sku === l.sku && x.qty > 0)
}
function existingLot(l: AdjustmentLine) {
  return lotsInBin(l).find((x) => normLot(x.batch) === normLot(l.batch))
}
const batchOptions = (l: AdjustmentLine) => [...new Set(lotsInBin(l).map((x) => normLot(x.batch)))]
const expLocked = (l: AdjustmentLine) => !!existingLot(l)

function lotQty(l: AdjustmentLine) {
  const lot = lotsInBin(l).find((x) => normLot(x.batch) === normLot(l.batch) && normLot(x.exp) === normLot(l.exp))
  return lot?.qty ?? 0
}
const freeToRemove = (l: AdjustmentLine) => (l.sku && l.bin ? store.movableQty(l.bin, l.sku, normLot(l.batch), normLot(l.exp)) : 0)

/** Keep batch / expiry consistent with the SKU flags and what the bin already holds. */
function syncLot(l: AdjustmentLine) {
  const s = skuOf(l)
  if (!s) return
  if (!s.hasBatch) l.batch = '-'
  const lot = existingLot(l)
  if (!s.hasExpiry) l.exp = '-'
  else if (lot) l.exp = normLot(lot.exp)
}
function onSku(l: AdjustmentLine) {
  l.bin = ''
  l.batch = ''
  l.exp = ''
  l.qty = 0
  syncLot(l)
}
function onBin(l: AdjustmentLine) {
  const s = skuOf(l)
  l.batch = s?.hasBatch ? (batchOptions(l)[0] ?? '') : '-'
  l.exp = ''
  syncLot(l)
}
function onBatch(l: AdjustmentLine) {
  l.exp = ''
  syncLot(l)
}

const cleanLines = computed(() => form.lines.map((l) => ({ ...l, batch: normLot(l.batch), exp: normLot(l.exp), qty: Number(l.qty) || 0 })))
const validation = computed(() => store.validateAdjustment(cleanLines.value))
const canSubmit = computed(() => validation.value.ok && !!form.reason)
const formTotal = computed(() => cleanLines.value.reduce((a, l) => a + l.qty, 0))

function submit() {
  const r = store.createAdjustment({ date: form.date, reason: form.reason, note: form.note, lines: cleanLines.value })
  if (r.ok) {
    if (r.data) collab.commit(r.data.no)
    ElMessage.success(r.msg)
    dlgOpen.value = false
  } else {
    ElMessage.warning(r.msg)
  }
}
</script>

<template>
  <div class="page">
    <PageHeader title="Stock Adjustment" subtitle="Correct system stock per bin and batch (documents ADJ-…).">
      <template #actions>
        <el-button v-if="access.can('stock-adjustment', 'create')" type="primary" @click="openNew">+ New adjustment</el-button>
      </template>
    </PageHeader>

    <div class="card">
      <TransactionFilterBar
        v-model="filters"
        :fields="fieldOptions"
        :statuses="reasonOptions"
        :loading="refreshing"
        @reset="reset"
        @refresh="refresh"
      />

      <el-table :data="paged" row-key="no" empty-text="No adjustments yet">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="adj-expand">
              <el-table :data="row.lines" size="small">
                <el-table-column prop="sku" label="SKU" width="110" />
                <el-table-column label="Name" min-width="220">
                  <template #default="{ row: l }">{{ store.skuName(l.sku) }}</template>
                </el-table-column>
                <el-table-column prop="bin" label="Bin" width="120" />
                <el-table-column prop="batch" label="Batch" min-width="120" />
                <el-table-column label="Expiry" width="130">
                  <template #default="{ row: l }">{{ fmtDate(l.exp) }}</template>
                </el-table-column>
                <el-table-column label="Qty" width="120" align="right">
                  <template #default="{ row: l }">
                    <b :class="l.qty < 0 ? 'is-neg' : 'is-pos'">{{ signed(l.qty) }}</b>
                    <span class="cell-sub"> {{ store.skuUnit(l.sku) }}</span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Date" width="130">
          <template #default="{ row }">{{ fmtDate(row.date) }}</template>
        </el-table-column>
        <el-table-column label="No" min-width="160">
          <template #default="{ row }"><span class="cell-strong">{{ row.no }}</span></template>
        </el-table-column>
        <el-table-column label="Reason" min-width="220">
          <template #default="{ row }">
            <div>{{ row.reason }}</div>
            <div v-if="row.note" class="cell-sub">{{ row.note }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Lines" width="80" align="right">
          <template #default="{ row }">{{ row.lines.length }}</template>
        </el-table-column>
        <el-table-column label="Total +/-" width="120" align="right">
          <template #default="{ row }">
            <b :class="totalOf(row) < 0 ? 'is-neg' : totalOf(row) > 0 ? 'is-pos' : ''">{{ signed(totalOf(row)) }}</b>
          </template>
        </el-table-column>
        <el-table-column prop="createdBy" label="Created by" min-width="130" />
      </el-table>

      <PaginationBar v-model:page="page" :page-size="pageSize" :total="filtered.length" />
    </div>

    <el-dialog v-model="dlgOpen" title="New stock adjustment" width="1180px" top="5vh" @closed="collab.closed">
      <el-form label-position="top">
        <div class="adj-head">
          <el-form-item label="Date">
            <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" format="DD MMM YYYY" :clearable="false" class="w-full" />
          </el-form-item>
          <el-form-item label="Reason" required>
            <el-select v-model="form.reason" placeholder="Choose a reason" class="w-full">
              <el-option v-for="r in REASONS" :key="r" :value="r" :label="r" />
            </el-select>
          </el-form-item>
          <el-form-item label="Note" class="adj-note">
            <el-input v-model="form.note" placeholder="Optional note" />
          </el-form-item>
        </div>
      </el-form>

      <el-table :data="form.lines" size="small" class="adj-lines">
        <el-table-column label="SKU" min-width="220">
          <template #default="{ row }">
            <el-select v-model="row.sku" filterable placeholder="SKU" class="w-full" @change="onSku(row)">
              <el-option v-for="s in activeSkus" :key="s.sku" :value="s.sku" :label="`${s.sku} – ${s.name}`" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="Bin" min-width="170">
          <template #default="{ row }">
            <el-select v-model="row.bin" filterable placeholder="Bin" :disabled="!row.sku" class="w-full" @change="onBin(row)">
              <el-option v-for="b in binOptions(row)" :key="b.bin" :value="b.bin" :label="b.bin" :disabled="!!b.frozenBy">
                <div class="opt-row">
                  <span>{{ b.bin }}</span>
                  <span v-if="b.frozenBy" class="cell-sub">frozen ({{ b.frozenBy }})</span>
                  <span v-else-if="b.holds" class="cell-sub">holds {{ fmtQty(b.holds) }} · free {{ fmtQty(b.free) }}</span>
                  <span v-else class="cell-sub">free {{ fmtQty(b.free) }}</span>
                </div>
              </el-option>
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="Batch" min-width="150">
          <template #default="{ row }">
            <el-input v-if="skuOf(row) && !skuOf(row)!.hasBatch" model-value="-" disabled />
            <el-select v-else v-model="row.batch" filterable allow-create default-first-option placeholder="Batch"
              :disabled="!row.bin" class="w-full" @change="onBatch(row)">
              <el-option v-for="b in batchOptions(row)" :key="b" :value="b" :label="b" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="Expiry" min-width="160">
          <template #default="{ row }">
            <el-input v-if="skuOf(row) && !skuOf(row)!.hasExpiry" model-value="-" disabled />
            <div v-else-if="expLocked(row)" class="adj-exp">
              <span>{{ fmtDate(row.exp) }}</span>
              <ExpiryTag :exp="row.exp" />
            </div>
            <el-date-picker v-else v-model="row.exp" type="date" value-format="YYYY-MM-DD" format="DD MMM YYYY"
              placeholder="New batch expiry" :disabled="!row.bin" class="w-full" />
          </template>
        </el-table-column>
        <el-table-column label="Qty in bin" width="130" align="right">
          <template #default="{ row }">
            <template v-if="row.sku && row.bin">
              <div>{{ fmtQty(lotQty(row)) }} <span class="cell-sub">{{ store.skuUnit(row.sku) }}</span></div>
              <div class="cell-sub">free to remove {{ fmtQty(freeToRemove(row)) }}</div>
            </template>
            <span v-else class="cell-sub">-</span>
          </template>
        </el-table-column>
        <el-table-column label="Qty +/-" width="120">
          <template #default="{ row }">
            <el-input-number v-model="row.qty" :step="1" step-strictly :controls="false" size="small" class="w-full"
              :class="row.qty < 0 ? 'qty-neg' : row.qty > 0 ? 'qty-pos' : ''" />
          </template>
        </el-table-column>
        <el-table-column label="" width="56" align="center">
          <template #default="{ $index }">
            <el-button link type="danger" :disabled="form.lines.length <= 1" @click="removeLine($index)">✕</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="adj-foot">
        <el-button @click="addLine">+ Add line</el-button>
        <span class="cell-sub">Positive qty adds stock, negative qty removes it. Net total:
          <b :class="formTotal < 0 ? 'is-neg' : formTotal > 0 ? 'is-pos' : ''">{{ signed(formTotal) }}</b>
        </span>
      </div>

      <el-alert :type="canSubmit ? 'success' : 'warning'" :closable="false" show-icon
        :title="!validation.ok ? validation.msg : !form.reason ? 'Choose a reason.' : 'Ready to apply.'" />

      <DocCollabSection :doc-key="collab.key.value" />

      <template #footer>
        <el-button @click="dlgOpen = false">Cancel</el-button>
        <el-button type="primary" :disabled="!canSubmit" @click="submit">Apply adjustment</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.adj-expand {
  padding: 8px 24px 12px 48px;
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
.w-full {
  width: 100%;
}
.opt-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.adj-head {
  display: grid;
  grid-template-columns: 180px 260px minmax(0, 1fr);
  gap: 0 16px;
}
.adj-exp {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.adj-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 12px 0 16px;
  flex-wrap: wrap;
}
.qty-neg :deep(.el-input__inner) {
  color: var(--danger);
  font-weight: 600;
}
.qty-pos :deep(.el-input__inner) {
  color: var(--success);
  font-weight: 600;
}
@media (max-width: 760px) {
  .adj-head {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
