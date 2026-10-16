<script setup lang="ts">
// Stock Balance: SKU master + stock per SKU, with the lots (bin / batch / expiry) of each SKU in the expanded row.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, Printer } from '@element-plus/icons-vue'
import * as XLSX from 'xlsx'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import TransactionFilterBar from '../../components/TransactionFilterBar.vue'
import { useListFilter } from './useListFilter'
import ExpiryTag from './ExpiryTag.vue'
import ImportDialog from './ImportDialog.vue'
import CategoryManagerDialog from './CategoryManagerDialog.vue'
import type { ImportKind } from './wmsImport'
import { fmtDate, fmtQty, fmtRp } from './wmsUi'
import { printStockSheet } from './wmsPrint'
import { EXPIRY_STATUSES, TRANSIT_ZONE, expiryStatus, useWmsStore, type ExpiryStatus, type Sku } from '../../stores/wmsStore'
import { useAccessStore } from '../../stores/accessStore'
import DocCollabSection from './DocCollabSection.vue'
import { useDocCollabKey } from './useDocCollabKey'

const store = useWmsStore()
const access = useAccessStore()
const router = useRouter()
const route = useRoute()

// ---------- filters
const page = ref(1)
const pageSize = 15

const expTime = (exp: string) => (!exp || exp === '-' ? Number.POSITIVE_INFINITY : new Date(exp).getTime())

/** Shelf lots (excluding transit) of a SKU. */
function shelfLots(code: string) {
  return store.stockLots((l) => l.sku === code && l.zone !== TRANSIT_ZONE)
}
function skuExpiryStatuses(s: Sku): Set<ExpiryStatus> {
  if (!s.hasExpiry) return new Set<ExpiryStatus>(['GOOD'])
  return new Set(shelfLots(s.sku).map((l) => expiryStatus(l.exp, true)))
}

const rows = computed(() =>
  store.skus.map((s) => {
    const m = store.skuMetrics(s.sku)
    return { ...s, categoryName: store.category(s.category)?.name ?? s.category, ...m }
  }),
)
type Row = (typeof rows.value)[number]

const { filters, fieldOptions, filtered, reset, refresh, refreshing } = useListFilter(() => rows.value, {
  status: (r) => (r.inactive ? 'INACTIVE' : 'ACTIVE'),
  secondaryStatus: (r) => [...skuExpiryStatuses(r)],
  fields: [
    { label: 'SKU', value: 'sku', get: (r) => r.sku },
    { label: 'Name', value: 'name', get: (r) => r.name },
    { label: 'Category', value: 'category', get: (r) => `${r.category} ${r.categoryName}` },
    { label: 'Unit', value: 'unit', get: (r) => r.unit },
    { label: 'On hand', value: 'onHand', get: (r) => r.onHand },
    { label: 'Available', value: 'available', get: (r) => r.available },
  ],
}, page)
// Deep link (?sku=FG-01), e.g. from the dashboard drill-down: filter the list to that SKU.
watch(() => route.query.sku, (sku) => {
  if (typeof sku === 'string' && sku) filters.value = { ...filters.value, conditions: [{ field: 'sku', operator: '=', value: sku }] }
}, { immediate: true })
const activeOptions = [
  { label: 'Active', value: 'ACTIVE', color: 'green' },
  { label: 'Inactive', value: 'INACTIVE', color: 'gray' },
]
const expiryOptions = EXPIRY_STATUSES.map((e) => ({ label: e.label, value: e.key, color: e.color }))

// Sorting is done before pagination, so the whole result is sorted.
const sortState = ref<{ prop: string; order: 'ascending' | 'descending' | null }>({ prop: '', order: null })
function onSort({ prop, order }: { prop: string; order: 'ascending' | 'descending' | null }) {
  sortState.value = { prop, order }
}
const sorted = computed(() => {
  const { prop, order } = sortState.value
  if (!prop || !order) return filtered.value
  const dir = order === 'ascending' ? 1 : -1
  return [...filtered.value].sort((a, b) => {
    const va = (a as Record<string, unknown>)[prop]
    const vb = (b as Record<string, unknown>)[prop]
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    return String(va ?? '').localeCompare(String(vb ?? '')) * dir
  })
})
const paged = computed(() => sorted.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const totalValue = computed(() => filtered.value.reduce((a, r) => a + r.value, 0))

function lotsOf(code: string) {
  return store.stockLots((l) => l.sku === code).sort((a, b) => expTime(a.exp) - expTime(b.exp) || a.bin.localeCompare(b.bin))
}

function openBatch(sku: string, batch: string, exp: string) {
  router.push({ path: '/inventory/batch-serial', query: { sku, batch, exp } })
}
function openBin(bin: string) {
  router.push({ path: '/inventory/rack-map', query: { bin } })
}

// ---------- SKU dialog
const dialogOpen = ref(false)
const editingCode = ref<string | undefined>()
const manualCode = ref(false)
const form = ref<Sku>(blankSku())
const collab = useDocCollabKey('wms-sku')

function blankSku(): Sku {
  return { sku: '', name: '', category: store.categories[0]?.id ?? '', unit: 'Pcs', price: 0, sellPrice: 0, hasBatch: true, hasExpiry: true, inactive: false }
}
function openNew() {
  editingCode.value = undefined
  manualCode.value = false
  form.value = blankSku()
  form.value.sku = store.nextSkuCode(form.value.category)
  collab.startCreate()
  dialogOpen.value = true
}
function openEdit(row: Row) {
  const s = store.sku(row.sku)
  if (!s) return
  editingCode.value = s.sku
  manualCode.value = false
  form.value = { ...s, inactive: !!s.inactive }
  collab.startEdit(s.sku)
  dialogOpen.value = true
}
watch(() => [form.value.category, manualCode.value] as const, () => {
  if (!editingCode.value && !manualCode.value && dialogOpen.value) form.value.sku = store.nextSkuCode(form.value.category)
})
const codeLocked = computed(() => !manualCode.value)

function saveSku() {
  const r = store.saveSku({ ...form.value }, editingCode.value)
  if (r.ok) {
    const code = form.value.sku.trim().toUpperCase()
    if (editingCode.value) collab.rename(editingCode.value, code)
    else collab.commit(code)
    ElMessage.success(r.msg)
    dialogOpen.value = false
  } else ElMessage.warning(r.msg)
}
async function deleteSku() {
  const code = editingCode.value
  if (!code) return
  try {
    await ElMessageBox.confirm(`Delete SKU ${code} – ${store.skuName(code)}? This cannot be undone.`, 'Delete SKU', { type: 'warning', confirmButtonText: 'Delete' })
  } catch {
    return
  }
  const r = store.deleteSku(code)
  if (r.ok) {
    ElMessage.success(r.msg)
    dialogOpen.value = false
  } else ElMessage.warning(r.msg)
}

// ---------- import / categories / export
const importOpen = ref(false)
const importKind = ref<ImportKind>('sku')
function openImport(kind: string | number | object) {
  importKind.value = kind as ImportKind
  importOpen.value = true
}
const categoriesOpen = ref(false)

function exportExcel() {
  const data = sorted.value.map((r) => ({
    SKU: r.sku,
    Name: r.name,
    Category: r.category,
    'Category name': r.categoryName,
    Unit: r.unit,
    'Purchase price': r.price,
    'Sell price': r.sellPrice,
    'Batch (Y/N)': r.hasBatch ? 'Y' : 'N',
    'Expiry (Y/N)': r.hasExpiry ? 'Y' : 'N',
    Active: r.inactive ? 'N' : 'Y',
    'On hand': r.onHand,
    'In transit': r.transit,
    Allocated: r.allocated,
    Available: r.available,
    'Stock value': r.value,
  }))
  if (!data.length) {
    ElMessage.warning('Nothing to export.')
    return
  }
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = Object.keys(data[0]!).map((k) => ({ wch: k === 'Name' ? 36 : Math.max(10, k.length + 2) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Stock balance')
  XLSX.writeFile(wb, `stock-balance-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// Inventory sheet for a physical check: every lot on the shelves (transit excluded).
function printSheet() {
  const lots = store.stockLots((l) => l.zone !== TRANSIT_ZONE)
  if (!printStockSheet(lots, 'All storage bins (excluding transit)')) ElMessage.warning('Allow pop-ups to print the stock sheet.')
}
</script>

<template>
  <div class="page">
    <PageHeader title="Stock Balance" subtitle="SKU master with on-hand, allocated and available stock per SKU">
      <template #actions>
        <el-button :icon="Printer" @click="printSheet">Stock sheet</el-button>
        <el-button v-if="access.can('stock-balance', 'edit')" @click="categoriesOpen = true">Categories</el-button>
        <el-dropdown v-if="access.can('stock-balance', 'import')" trigger="click" @command="openImport">
          <el-button>Import <el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="sku">SKU master</el-dropdown-item>
              <el-dropdown-item command="opening">Opening balance</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button @click="exportExcel">Export</el-button>
        <el-button v-if="access.can('stock-balance', 'create')" type="primary" @click="openNew">+ New SKU</el-button>
      </template>
    </PageHeader>

    <div class="card">
      <TransactionFilterBar
        v-model="filters"
        :fields="fieldOptions"
        :statuses="activeOptions"
        :secondary-statuses="expiryOptions"
        secondary-status-label="Expiry"
        hide-date
        :loading="refreshing"
        @reset="reset"
        @refresh="refresh"
      />

      <div class="sb-summary">
        <b>{{ filtered.length }}</b> SKUs · Total stock value <b>{{ fmtRp(totalValue) }}</b>
      </div>

      <el-table :data="paged" row-key="sku" @sort-change="onSort">
        <el-table-column type="expand" width="40">
          <template #default="{ row }">
            <div class="sb-lots">
              <div v-if="!lotsOf(row.sku).length" class="sb-empty">No stock in any bin.</div>
              <el-table v-else :data="lotsOf(row.sku)" size="small">
                <el-table-column label="Bin" min-width="140">
                  <template #default="{ row: l }">
                    <span class="mono">{{ l.bin }}</span>
                    <span v-if="l.zone === TRANSIT_ZONE" class="status-pill amber sb-ml">TRANSIT</span>
                  </template>
                </el-table-column>
                <el-table-column label="Zone" prop="zone" min-width="110" />
                <el-table-column label="Batch" min-width="130">
                  <template #default="{ row: l }">
                    <a v-if="l.batch !== '-'" class="sb-link" @click="openBatch(row.sku, l.batch, l.exp)">{{ l.batch }}</a>
                    <a v-else class="sb-link muted" @click="openBatch(row.sku, l.batch, l.exp)">-</a>
                  </template>
                </el-table-column>
                <el-table-column label="Expiry date" min-width="110">
                  <template #default="{ row: l }">{{ fmtDate(l.exp) }}</template>
                </el-table-column>
                <el-table-column label="Expiry status" min-width="150">
                  <template #default="{ row: l }"><ExpiryTag :exp="l.exp" :has-expiry="row.hasExpiry" show-days /></template>
                </el-table-column>
                <el-table-column label="Qty" align="right" width="90">
                  <template #default="{ row: l }">{{ fmtQty(l.qty) }}</template>
                </el-table-column>
                <el-table-column label="Reserved" align="right" width="90">
                  <template #default="{ row: l }">{{ fmtQty(store.reservedOnLot(l.bin, l.batch, l.exp)) }}</template>
                </el-table-column>
                <el-table-column label="" width="150" align="right">
                  <template #default="{ row: l }">
                    <el-button size="small" link type="primary" @click="openBin(l.bin)">Open in rack map</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="SKU" prop="sku" sortable="custom" width="110">
          <template #default="{ row }">
            <a class="sb-link mono" @click="openEdit(row)">{{ row.sku }}</a>
          </template>
        </el-table-column>
        <el-table-column label="Name" prop="name" sortable="custom" min-width="240">
          <template #default="{ row }">
            {{ row.name }}
            <span v-if="row.inactive" class="status-pill gray sb-ml">INACTIVE</span>
          </template>
        </el-table-column>
        <el-table-column label="Category" prop="categoryName" sortable="custom" min-width="160" />
        <el-table-column label="Config" min-width="210">
          <template #default="{ row }">
            <span style="white-space: nowrap"><span class="status-pill" :class="row.hasBatch ? 'blue' : 'gray'">{{ row.hasBatch ? 'BATCH' : 'NO-BATCH' }}</span>
            <span class="status-pill sb-ml" :class="row.hasExpiry ? 'amber' : 'gray'">{{ row.hasExpiry ? 'EXP' : 'NO-EXP' }}</span></span>
          </template>
        </el-table-column>
        <el-table-column label="On hand" prop="onHand" sortable="custom" align="right" width="120">
          <template #default="{ row }">
            <div>{{ fmtQty(row.onHand) }} <span class="muted">{{ row.unit }}</span></div>
            <div v-if="row.transit" class="sb-hint">+{{ fmtQty(row.transit) }} in transit</div>
          </template>
        </el-table-column>
        <el-table-column label="Allocated" prop="allocated" sortable="custom" align="right" width="110">
          <template #default="{ row }">{{ fmtQty(row.allocated) }}</template>
        </el-table-column>
        <el-table-column label="Available" prop="available" sortable="custom" align="right" width="110">
          <template #default="{ row }"><b :class="{ 'is-neg': row.available <= 0 }">{{ fmtQty(row.available) }}</b></template>
        </el-table-column>
        <el-table-column label="Stock value" prop="value" sortable="custom" align="right" min-width="150">
          <template #default="{ row }">
            <div>{{ fmtRp(row.value) }}</div>
            <div class="sb-hint">Buy {{ fmtRp(row.price) }}</div>
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar v-model:page="page" :page-size="pageSize" :total="filtered.length" />
    </div>

    <el-dialog v-model="dialogOpen" :title="editingCode ? `Edit SKU ${editingCode}` : 'New SKU'" width="600px" top="5vh" @closed="collab.closed">
      <el-form label-position="top" class="sb-form">
        <el-form-item label="Category">
          <el-select v-model="form.category" style="width: 100%">
            <el-option v-for="c in store.categories" :key="c.id" :label="`${c.name} (${c.prefix})`" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="SKU code">
          <div class="sb-code-row">
            <el-input v-model="form.sku" :disabled="codeLocked" class="mono" />
            <el-checkbox v-model="manualCode">Manual code</el-checkbox>
          </div>
        </el-form-item>
        <el-form-item label="Name">
          <el-input v-model="form.name" placeholder="Product name" />
        </el-form-item>
        <div class="sb-grid">
          <el-form-item label="Unit">
            <el-input v-model="form.unit" placeholder="Pcs, Kg, Roll…" />
          </el-form-item>
          <el-form-item label="Purchase price (Rp)">
            <el-input-number v-model="form.price" :min="0" :step="1000" controls-position="right" style="width: 100%" />
          </el-form-item>
          <el-form-item label="Sell price (Rp)">
            <el-input-number v-model="form.sellPrice" :min="0" :step="1000" controls-position="right" style="width: 100%" />
          </el-form-item>
        </div>
        <div class="sb-flags">
          <el-checkbox v-model="form.hasBatch">Has batch</el-checkbox>
          <el-checkbox v-model="form.hasExpiry">Has expiry</el-checkbox>
          <span v-if="editingCode" class="sb-active">
            <el-switch
              :model-value="!form.inactive"
              active-text="Active"
              @update:model-value="(v: string | number | boolean) => (form.inactive = !v)"
            />
          </span>
        </div>
      </el-form>
      <DocCollabSection :doc-key="collab.key.value" />
      <template #footer>
        <el-button v-if="editingCode && access.can('stock-balance', 'delete')" type="danger" plain class="sb-del" @click="deleteSku">Delete</el-button>
        <el-button @click="dialogOpen = false">Cancel</el-button>
        <el-button type="primary" :disabled="!access.can('stock-balance', editingCode ? 'edit' : 'create')" @click="saveSku">Save</el-button>
      </template>
    </el-dialog>

    <ImportDialog v-model="importOpen" :kind="importKind" />
    <CategoryManagerDialog v-model="categoriesOpen" />
  </div>
</template>

<style scoped>
.sb-summary {
  margin: 14px 0 8px;
  font-size: 13px;
  color: var(--gray-600);
}
.sb-lots {
  padding: 8px 16px 12px 48px;
  background: var(--gray-50);
}
.sb-empty {
  font-size: 13px;
  color: var(--gray-500);
  padding: 8px 0;
}
.sb-link {
  color: var(--brand);
  cursor: pointer;
  font-weight: 600;
}
.sb-link:hover {
  text-decoration: underline;
}
.sb-ml {
  margin-left: 6px;
}
.sb-hint {
  font-size: 11px;
  color: var(--gray-500);
}
.muted {
  color: var(--gray-500);
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.is-neg {
  color: #b91c1c;
}
.sb-code-row {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
}
.sb-code-row .el-input {
  flex: 1;
}
.sb-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.sb-flags {
  display: flex;
  align-items: center;
  gap: 16px;
}
.sb-active {
  margin-left: auto;
}
.sb-del {
  float: left;
}
@media (max-width: 640px) {
  .sb-grid {
    grid-template-columns: 1fr;
  }
}
</style>
