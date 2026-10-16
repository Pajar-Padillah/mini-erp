<script setup lang="ts">
// Rack map: bins per zone with fill level, lots inside each bin, and bin / zone maintenance.
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import * as XLSX from 'xlsx'
import PageHeader from '../../components/PageHeader.vue'
import ImportDialog from './ImportDialog.vue'
import {
  BIN_STATUS_LABEL,
  EXPIRY_STATUSES,
  TRANSIT_BIN,
  TRANSIT_ZONE,
  binAvailCap,
  binFillPct,
  binQty,
  binSkuCount,
  binStatus,
  expiryStatus,
  useWmsStore,
  type Bin,
  type BinStatus,
  type ExpiryStatus,
  type Zone,
} from '../../stores/wmsStore'
import { useAccessStore } from '../../stores/accessStore'
import { docKey } from '../../stores/docCollabStore'
import DocCollabSection from './DocCollabSection.vue'
import { useDocCollabKey } from './useDocCollabKey'
import ExpiryTag from './ExpiryTag.vue'
import { expiryColor, expiryLabel, fmtDate, fmtQty } from './wmsUi'

const store = useWmsStore()
const access = useAccessStore()
const router = useRouter()
const route = useRoute()

const STATUS_COLOR: Record<BinStatus, string> = { available: 'green', nearfull: 'amber', full: 'red' }
type StatusFilter = BinStatus | 'all'
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'available', label: BIN_STATUS_LABEL.available },
  { key: 'nearfull', label: BIN_STATUS_LABEL.nearfull },
  { key: 'full', label: BIN_STATUS_LABEL.full },
]

const activeZone = ref<string>(store.zones.find((z) => z.id !== TRANSIT_ZONE)?.id ?? store.zones[0]?.id ?? '')
const statusFilter = ref<StatusFilter>('all')
const search = ref('')

const zoneBins = computed(() => store.bins.filter((b) => b.zone === activeZone.value))
const zoneStats = computed(() => {
  const bins = zoneBins.value
  const units = bins.reduce((a, b) => a + binQty(b), 0)
  const capacity = bins.reduce((a, b) => a + b.capacity, 0)
  return {
    total: bins.length,
    available: bins.filter((b) => binStatus(b) === 'available').length,
    units,
    capacity,
    pct: capacity ? Math.min(100, Math.round((units / capacity) * 100)) : 0,
  }
})
const statusCount = (k: StatusFilter) => (k === 'all' ? zoneBins.value.length : zoneBins.value.filter((b) => binStatus(b) === k).length)

const shownBins = computed(() => {
  const q = search.value.trim().toLowerCase()
  return zoneBins.value
    .filter((b) => statusFilter.value === 'all' || binStatus(b) === statusFilter.value)
    .filter(
      (b) =>
        !q ||
        b.bin.toLowerCase().includes(q) ||
        b.lots.some((l) => l.sku.toLowerCase().includes(q) || store.skuName(l.sku).toLowerCase().includes(q)),
    )
    .sort((a, b) => a.bin.localeCompare(b.bin))
})

const batchCount = (b: Bin) => b.lots.filter((l) => l.qty > 0).length
const EXP_RANK = EXPIRY_STATUSES.map((e) => e.key)
function worstExpiry(b: Bin): ExpiryStatus {
  let worst: ExpiryStatus = 'GOOD'
  b.lots.forEach((l) => {
    if (l.qty <= 0) return
    const st = expiryStatus(l.exp, store.sku(l.sku)?.hasExpiry ?? false)
    if (EXP_RANK.indexOf(st) < EXP_RANK.indexOf(worst)) worst = st
  })
  return worst
}
const fillColor = (pct: number) => (pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--success)')

// ---------- bin detail
const detailCode = ref<string | null>(null)
const detailOpen = computed({
  get: () => detailCode.value !== null,
  set: (v: boolean) => {
    if (!v) detailCode.value = null
  },
})

// Deep links: ?bin=A1-R1-B1 opens that bin, ?status=full|available shows those bins in the first zone that has any.
onMounted(() => {
  const code = typeof route.query.bin === 'string' ? route.query.bin : ''
  const status = route.query.status
  const b = code ? store.bin(code) : undefined
  if (b) {
    activeZone.value = b.zone
    detailCode.value = b.bin
  } else if (status === 'full' || status === 'available') {
    statusFilter.value = status
    const zone = store.storageBins.find((x) => binStatus(x) === status)?.zone
    if (zone) activeZone.value = zone
  }
})
const detailBin = computed(() => (detailCode.value ? store.bin(detailCode.value) : undefined))
const detailLots = computed(() =>
  (detailBin.value?.lots ?? [])
    .filter((l) => l.qty > 0)
    .map((l) => ({
      ...l,
      name: store.skuName(l.sku),
      unit: store.skuUnit(l.sku),
      hasExpiry: store.sku(l.sku)?.hasExpiry ?? false,
      reserved: store.reservedOnLot(detailBin.value!.bin, l.batch, l.exp),
    })),
)
const isTransit = computed(() => detailBin.value?.bin === TRANSIT_BIN)

function transferLot(lot: { sku: string; batch: string; exp: string }) {
  if (!detailBin.value) return
  const bin = detailBin.value.bin
  detailCode.value = null
  router.push({ path: '/inventory/stock-transfer', query: { bin, sku: lot.sku, batch: lot.batch, exp: lot.exp } })
}

// ---------- edit bin
const editOpen = ref(false)
const editForm = reactive({ zone: '', capacity: 0 })
function openEdit() {
  if (!detailBin.value) return
  editForm.zone = detailBin.value.zone
  editForm.capacity = detailBin.value.capacity
  editOpen.value = true
}
function saveEdit() {
  const b = detailBin.value
  if (!b) return
  const r = store.saveBin({ zone: editForm.zone, rack: b.rack, code: b.bin, capacity: editForm.capacity }, b.bin)
  if (r.ok) {
    ElMessage.success(r.msg)
    editOpen.value = false
    if (editForm.zone !== activeZone.value) activeZone.value = editForm.zone
  } else {
    ElMessage.warning(r.msg)
  }
}
async function removeBin() {
  const b = detailBin.value
  if (!b) return
  try {
    await ElMessageBox.confirm(`Delete bin ${b.bin}? This cannot be undone.`, 'Delete bin', { type: 'warning', confirmButtonText: 'Delete' })
  } catch {
    return
  }
  const r = store.deleteBin(b.bin)
  if (r.ok) {
    ElMessage.success(r.msg)
    detailCode.value = null
  } else {
    ElMessage.warning(r.msg)
  }
}

// ---------- add bin
const storageZones = computed(() => store.zones.filter((z) => z.id !== TRANSIT_ZONE))
const addOpen = ref(false)
const addForm = reactive({ zone: '', rack: '', code: '', capacity: 100 })
const addCollab = useDocCollabKey('wms-bin')
function openAdd() {
  addForm.zone = activeZone.value !== TRANSIT_ZONE ? activeZone.value : storageZones.value[0]?.id ?? ''
  addForm.rack = ''
  addForm.code = ''
  addForm.capacity = 100
  addCollab.startCreate()
  addOpen.value = true
}
const addPreview = computed(() => {
  const prefix = store.zone(addForm.zone)?.prefix ?? '??'
  return `${prefix}-${addForm.rack.trim().toUpperCase() || 'R?'}-${addForm.code.trim().toUpperCase() || 'B?'}`
})
function saveAdd() {
  const r = store.saveBin({ zone: addForm.zone, rack: addForm.rack, code: addForm.code, capacity: addForm.capacity })
  if (r.ok) {
    if (r.data) addCollab.commit(r.data)
    ElMessage.success(r.msg)
    addOpen.value = false
    activeZone.value = addForm.zone
  } else {
    ElMessage.warning(r.msg)
  }
}

// ---------- zones
const zonesOpen = ref(false)
const zoneForm = reactive<Zone>({ id: '', name: '', prefix: '' })
const editingZone = ref<string | null>(null)
const zoneRows = computed(() => store.zones.map((z) => ({ ...z, bins: store.bins.filter((b) => b.zone === z.id).length })))
function resetZoneForm() {
  editingZone.value = null
  Object.assign(zoneForm, { id: '', name: '', prefix: '' })
}
function editZone(z: Zone) {
  editingZone.value = z.id
  Object.assign(zoneForm, { id: z.id, name: z.name, prefix: z.prefix })
}
function saveZoneForm() {
  const r = store.saveZone({ ...zoneForm }, editingZone.value ?? undefined)
  if (r.ok) {
    ElMessage.success(r.msg)
    resetZoneForm()
  } else {
    ElMessage.warning(r.msg)
  }
}
function openZones() {
  resetZoneForm()
  zonesOpen.value = true
}
async function removeZone(z: Zone) {
  try {
    await ElMessageBox.confirm(`Delete zone ${z.id} – ${z.name}?`, 'Delete zone', { type: 'warning', confirmButtonText: 'Delete', appendTo: 'body' })
  } catch {
    return
  }
  const r = store.deleteZone(z.id)
  if (r.ok) {
    ElMessage.success(r.msg)
    if (editingZone.value === z.id) resetZoneForm()
    if (activeZone.value === z.id) activeZone.value = storageZones.value[0]?.id ?? store.zones[0]?.id ?? ''
  } else {
    ElMessage.warning(r.msg)
  }
}

// ---------- import / export bins
const importOpen = ref(false)
function exportBins() {
  const data = [...store.storageBins]
    .sort((a, b) => a.zone.localeCompare(b.zone) || a.bin.localeCompare(b.bin))
    .map((b) => ({
      Zone: b.zone,
      Rack: b.rack,
      'Bin code': b.bin,
      Capacity: b.capacity,
      'Qty on hand': binQty(b),
      'Fill %': binFillPct(b),
      Status: BIN_STATUS_LABEL[binStatus(b)],
      SKUs: binSkuCount(b),
      Batches: batchCount(b),
    }))
  if (!data.length) {
    ElMessage.warning('Nothing to export.')
    return
  }
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = Object.keys(data[0]!).map((k) => ({ wch: Math.max(10, k.length + 4) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Bins')
  XLSX.writeFile(wb, `bins-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
</script>

<template>
  <div class="page rack-page">
    <PageHeader title="Rack Map" subtitle="Bins per zone with fill level, stored lots and expiry warnings">
      <template #actions>
        <el-button v-if="access.can('rack-map', 'edit')" @click="openZones">Manage zones</el-button>
        <el-button @click="exportBins">Export bins</el-button>
        <el-button v-if="access.can('rack-map', 'import')" @click="importOpen = true">Import bins</el-button>
        <el-button v-if="access.can('rack-map', 'create')" type="primary" @click="openAdd">+ Add bin</el-button>
      </template>
    </PageHeader>

    <section class="dash-card">
      <el-tabs v-model="activeZone" class="zone-tabs">
        <el-tab-pane v-for="z in store.zones" :key="z.id" :name="z.id" :label="z.id" />
      </el-tabs>

      <div class="zone-summary">
        <div class="zone-meta">
          <div class="zone-name">{{ store.zone(activeZone)?.name ?? activeZone }}</div>
          <div class="zone-stats">
            <strong>{{ zoneStats.available }}</strong> available / {{ zoneStats.total }} bins ·
            {{ fmtQty(zoneStats.units) }} / {{ fmtQty(zoneStats.capacity) }} units
          </div>
        </div>
        <div class="zone-fill">
          <div class="fill-track">
            <div class="fill-bar" :style="{ width: `${zoneStats.pct}%`, background: fillColor(zoneStats.pct) }" />
          </div>
          <span class="zone-pct">{{ zoneStats.pct }}% full</span>
        </div>
      </div>

      <div class="toolbar">
        <div class="pills">
          <button
            v-for="f in STATUS_FILTERS"
            :key="f.key"
            type="button"
            class="pill"
            :class="{ 'is-active': statusFilter === f.key }"
            @click="statusFilter = f.key"
          >
            {{ f.label }} <span class="pill-count">{{ statusCount(f.key) }}</span>
          </button>
        </div>
        <el-input v-model="search" class="search" placeholder="Search bin, SKU or product" :prefix-icon="Search" clearable />
      </div>

      <div v-if="shownBins.length" class="bin-grid">
        <button v-for="b in shownBins" :key="b.bin" type="button" class="bin-card" @click="detailCode = b.bin">
          <div class="bin-head">
            <span class="bin-code">{{ b.bin }}</span>
            <span class="status-pill" :class="STATUS_COLOR[binStatus(b)]">{{ BIN_STATUS_LABEL[binStatus(b)] }}</span>
          </div>
          <div class="bin-tags">
            <span v-if="store.isFrozen(b.bin)" class="status-pill blue" :title="`Frozen by cycle count ${store.frozenBy(b.bin)}`">🔒 Frozen</span>
            <span v-if="worstExpiry(b) !== 'GOOD'" class="status-pill" :class="expiryColor(worstExpiry(b))">{{ expiryLabel(worstExpiry(b)) }}</span>
          </div>
          <div class="bin-sub">{{ binSkuCount(b) }} SKU · {{ batchCount(b) }} batch</div>
          <div class="fill-track gradient">
            <div class="fill-mask" :style="{ left: `${binFillPct(b)}%` }" />
          </div>
          <div class="bin-qty">
            <span>{{ fmtQty(binQty(b)) }} / {{ fmtQty(b.capacity) }}</span>
            <span>{{ binFillPct(b) }}%</span>
          </div>
        </button>
      </div>
      <el-empty v-else description="No bins match these filters" :image-size="80" />
    </section>

    <!-- Bin detail -->
    <el-dialog v-model="detailOpen" :title="detailBin ? `Bin ${detailBin.bin}` : 'Bin'" width="1040px" destroy-on-close>
      <template v-if="detailBin">
        <div class="detail-head">
          <div>
            <div class="detail-zone">{{ store.zone(detailBin.zone)?.name ?? detailBin.zone }} · Rack {{ detailBin.rack }}</div>
            <div class="detail-tags">
              <span class="status-pill" :class="STATUS_COLOR[binStatus(detailBin)]">{{ BIN_STATUS_LABEL[binStatus(detailBin)] }}</span>
              <span v-if="store.isFrozen(detailBin.bin)" class="status-pill blue">🔒 Frozen by {{ store.frozenBy(detailBin.bin) }}</span>
            </div>
          </div>
          <div class="detail-fill">
            <div class="fill-track gradient">
              <div class="fill-mask" :style="{ left: `${binFillPct(detailBin)}%` }" />
            </div>
            <div class="bin-qty">
              <span>{{ fmtQty(binQty(detailBin)) }} / {{ fmtQty(detailBin.capacity) }} ({{ binFillPct(detailBin) }}%)</span>
              <span>{{ fmtQty(binAvailCap(detailBin)) }} remaining</span>
            </div>
          </div>
        </div>

        <el-table :data="detailLots" size="small" empty-text="This bin is empty">
          <el-table-column prop="sku" label="SKU" width="90" />
          <el-table-column prop="name" label="Name" min-width="180" show-overflow-tooltip />
          <el-table-column prop="batch" label="Batch" min-width="110" />
          <el-table-column label="Expiry date" width="115">
            <template #default="{ row }">{{ fmtDate(row.exp) }}</template>
          </el-table-column>
          <el-table-column label="Expiry" min-width="160">
            <template #default="{ row }"><ExpiryTag :exp="row.exp" :has-expiry="row.hasExpiry" show-days /></template>
          </el-table-column>
          <el-table-column label="Qty" align="right" width="100">
            <template #default="{ row }">{{ fmtQty(row.qty) }} {{ row.unit }}</template>
          </el-table-column>
          <el-table-column label="Reserved" align="right" width="90">
            <template #default="{ row }">{{ row.reserved ? fmtQty(row.reserved) : '-' }}</template>
          </el-table-column>
          <el-table-column v-if="!isTransit" label="" width="100" align="right">
            <template #default="{ row }">
              <el-button v-if="access.can('stock-transfer', 'create')" size="small" @click="transferLot(row)">Transfer</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>
      <template #footer>
        <el-button v-if="access.can('rack-map', 'delete')" type="danger" plain :disabled="isTransit" @click="removeBin">Delete bin</el-button>
        <el-button v-if="access.can('rack-map', 'edit')" :disabled="isTransit" @click="openEdit">Edit bin</el-button>
        <el-button type="primary" @click="detailCode = null">Close</el-button>
      </template>
    </el-dialog>

    <!-- Edit bin -->
    <el-dialog v-model="editOpen" :title="`Edit bin ${detailBin?.bin ?? ''}`" width="560px" top="5vh" append-to-body>
      <el-form label-position="top" @submit.prevent="saveEdit">
        <el-form-item label="Zone">
          <el-select v-model="editForm.zone" style="width: 100%">
            <el-option v-for="z in storageZones" :key="z.id" :label="z.name" :value="z.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Capacity (units)">
          <el-input-number v-model="editForm.capacity" :min="1" :step="10" controls-position="right" style="width: 100%" />
        </el-form-item>
      </el-form>
      <DocCollabSection v-if="detailBin" :doc-key="docKey('wms-bin', detailBin.bin)" />
      <template #footer>
        <el-button @click="editOpen = false">Cancel</el-button>
        <el-button type="primary" @click="saveEdit">Save</el-button>
      </template>
    </el-dialog>

    <!-- Add bin -->
    <el-dialog v-model="addOpen" title="Add bin" width="560px" top="5vh" @closed="addCollab.closed">
      <el-form label-position="top" @submit.prevent="saveAdd">
        <el-form-item label="Zone">
          <el-select v-model="addForm.zone" style="width: 100%">
            <el-option v-for="z in storageZones" :key="z.id" :label="z.name" :value="z.id" />
          </el-select>
        </el-form-item>
        <div class="form-row">
          <el-form-item label="Rack">
            <el-input v-model="addForm.rack" placeholder="e.g. R3" />
          </el-form-item>
          <el-form-item label="Bin code">
            <el-input v-model="addForm.code" placeholder="e.g. B1" />
          </el-form-item>
        </div>
        <el-form-item label="Capacity (units)">
          <el-input-number v-model="addForm.capacity" :min="1" :step="10" controls-position="right" style="width: 100%" />
        </el-form-item>
        <div class="preview">Full bin code: <strong>{{ addPreview }}</strong></div>
      </el-form>
      <DocCollabSection :doc-key="addCollab.key.value" />
      <template #footer>
        <el-button @click="addOpen = false">Cancel</el-button>
        <el-button type="primary" @click="saveAdd">Add bin</el-button>
      </template>
    </el-dialog>

    <!-- Manage zones -->
    <el-dialog v-model="zonesOpen" title="Manage zones" width="680px">
      <el-table :data="zoneRows" size="small">
        <el-table-column prop="id" label="Zone" width="130" />
        <el-table-column prop="name" label="Name" min-width="220" show-overflow-tooltip />
        <el-table-column prop="prefix" label="Prefix" width="80" />
        <el-table-column prop="bins" label="Bins" width="70" align="right" />
        <el-table-column label="" width="120" align="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="editZone(row)">Edit</el-button>
            <el-button
              size="small"
              link
              type="danger"
              :disabled="row.id === TRANSIT_ZONE || row.bins > 0 || !access.can('rack-map', 'delete')"
              :title="row.id === TRANSIT_ZONE ? 'The transit zone cannot be deleted' : row.bins ? 'Zone still has bins' : ''"
              @click="removeZone(row)"
            >Delete</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="zone-form">
        <h4>{{ editingZone ? `Edit ${editingZone}` : 'Add zone' }}</h4>
        <el-form label-position="top" @submit.prevent="saveZoneForm">
          <div class="form-row three">
            <el-form-item label="Zone code">
              <el-input v-model="zoneForm.id" placeholder="e.g. Zone D" :disabled="!!editingZone" />
            </el-form-item>
            <el-form-item label="Name">
              <el-input v-model="zoneForm.name" placeholder="e.g. Zone D – Returns" />
            </el-form-item>
            <el-form-item label="Bin prefix">
              <el-input v-model="zoneForm.prefix" placeholder="e.g. D1" />
            </el-form-item>
          </div>
        </el-form>
        <div class="zone-form-actions">
          <el-button v-if="editingZone" @click="resetZoneForm">Cancel edit</el-button>
          <el-button type="primary" @click="saveZoneForm">{{ editingZone ? 'Save zone' : 'Add zone' }}</el-button>
        </div>
      </div>
    </el-dialog>

    <ImportDialog v-model="importOpen" kind="bin" />
  </div>
</template>

<style scoped>
.rack-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.rack-page :deep(.page-header) {
  margin-bottom: 0;
}
.zone-tabs :deep(.el-tabs__header) {
  margin-bottom: 14px;
}
.zone-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
  margin-bottom: 16px;
}
.zone-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--gray-900);
}
.zone-stats {
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--gray-500);
}
.zone-stats strong {
  color: var(--gray-900);
}
.zone-fill {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 1 320px;
  min-width: 200px;
}
.zone-fill .fill-track {
  flex: 1;
}
.zone-pct {
  font-size: 13px;
  font-weight: 600;
  color: var(--gray-700);
  white-space: nowrap;
}
.fill-track {
  position: relative;
  height: 8px;
  border-radius: 999px;
  background: var(--gray-100);
  overflow: hidden;
}
.fill-bar {
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s;
}
/* Gradient track: the full green→amber→red scale, masked from the fill point to the end. */
.fill-track.gradient {
  background: linear-gradient(90deg, var(--success) 0%, var(--warning) 70%, var(--danger) 100%);
}
.fill-mask {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  background: var(--gray-100);
  transition: left 0.3s;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid var(--border-soft);
  border-radius: 999px;
  background: var(--bg-card);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--gray-700);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.pill:hover:not(.is-active) {
  background: var(--brand-light);
}
.pill:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.pill.is-active {
  border-color: var(--brand);
  background: var(--brand);
  color: #ffffff;
}
.pill-count {
  font-size: 11.5px;
  opacity: 0.75;
}
.search {
  width: 280px;
  max-width: 100%;
}
.bin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px;
}
.bin-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}
.bin-card:hover {
  border-color: var(--brand);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}
.bin-card:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.bin-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.bin-code {
  font-size: 14px;
  font-weight: 700;
  color: var(--gray-900);
}
.bin-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.bin-tags:empty {
  display: none;
}
.bin-sub {
  font-size: 12.5px;
  color: var(--gray-500);
}
.bin-qty {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--gray-500);
}
.detail-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.detail-zone {
  font-size: 14px;
  font-weight: 600;
  color: var(--gray-900);
}
.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.detail-fill {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 0 1 340px;
  min-width: 220px;
}
.form-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 12px;
}
.form-row.three {
  grid-template-columns: 1fr 1.6fr 0.8fr;
}
.preview {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--brand-light);
  font-size: 13px;
  color: var(--gray-700);
}
.preview strong {
  color: var(--brand);
}
.zone-form {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border-soft);
}
.zone-form h4 {
  margin: 0 0 10px;
  font-size: 14px;
  color: var(--gray-900);
}
.zone-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
@media (max-width: 600px) {
  .form-row,
  .form-row.three {
    grid-template-columns: minmax(0, 1fr);
  }
  .search {
    width: 100%;
  }
}
</style>
