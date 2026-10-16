<script setup lang="ts">
// Outbound delivery orders: FEFO allocation, picking, (partial) dispatch and the printable delivery order.
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Document, Edit, List, Plus, Printer } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import TransactionFilterBar from '../../components/TransactionFilterBar.vue'
import { useListFilter } from './useListFilter'
import ExpiryTag from './ExpiryTag.vue'
import { expiryLabel, fmtDate, fmtDateTime, fmtQty, OUTBOUND_STATUS_COLOR } from './wmsUi'
import { printDeliveryOrder, printPicklist } from './wmsPrint'
import {
  useWmsStore, itemOutstanding, outboundProgress, outboundReady, outboundStatus,
  type Alloc, type DocLog, type Outbound, type OutboundItem, type OutboundItemStatus, type OutboundStatus, type Result,
} from '../../stores/wmsStore'
import { useAccessStore } from '../../stores/accessStore'
import DocCollabSection from './DocCollabSection.vue'
import { useDocCollabKey } from './useDocCollabKey'

const store = useWmsStore()
const access = useAccessStore()
const route = useRoute()

const STATUSES: OutboundStatus[] = ['PENDING', 'ALLOCATED', 'PARTIAL PICKED', 'READY TO SHIP', 'OUTSTANDING', 'DISPATCHED', 'CLOSED']
const ITEM_STATUS_COLOR: Record<OutboundItemStatus, string> = { PENDING: 'gray', ALLOCATED: 'blue', PICKED: 'amber', SHIPPED: 'green' }

function report(r: Result<unknown>) {
  if (r.ok) ElMessage.success(r.msg)
  else ElMessage.warning(r.msg)
  return r.ok
}

// ---------------------------------------------------------------- list
const page = ref(1)
const pageSize = 10

const sorted = computed(() => [...store.outbound].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id))
const { filters, fieldOptions, filtered, reset, refresh, refreshing } = useListFilter(() => sorted.value, {
  date: (d) => d.date,
  status: (d) => outboundStatus(d),
  secondaryStatus: (d) => d.term,
  fields: [
    { label: 'DO no.', value: 'no', get: (d) => d.no },
    { label: 'Customer PO', value: 'poCust', get: (d) => d.poCust },
    { label: 'Customer', value: 'customer', get: (d) => d.customer },
    { label: 'SKU', value: 'sku', get: (d) => d.items.map((i) => `${i.sku} ${store.skuName(i.sku)}`).join(' ') },
    { label: 'Note', value: 'note', get: (d) => d.note },
  ],
}, page)
const statusOptions = STATUSES.map((st) => ({ label: st, value: st, color: OUTBOUND_STATUS_COLOR[st] }))
const termOptions = [
  { label: 'Beli Putus', value: 'BELI PUTUS', color: 'gray' },
  { label: 'Konsinyasi', value: 'KONSINYASI', color: 'amber' },
]
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

const totalQty = (d: Outbound) => d.items.reduce((a, i) => a + i.qty, 0)
const hasPicked = (d: Outbound) => d.items.some((i) => i.status === 'PICKED' && i.pickedQty > 0)
const canClose = (d: Outbound) => !d.dispatched && d.shipments.length > 0 && !hasPicked(d)
const canDelete = (d: Outbound) => !d.dispatched && !d.shipments.length && !d.items.some((i) => i.status === 'PICKED')
const termColor = (t: string) => (t === 'KONSINYASI' ? 'amber' : 'gray')

async function confirm(msg: string, title: string, btn: string) {
  try {
    await ElMessageBox.confirm(msg, title, { type: 'warning', confirmButtonText: btn })
    return true
  } catch {
    return false
  }
}
async function removeDoc(d: Outbound) {
  if (await confirm(`Delete DO ${d.no}? Its allocations will be released.`, 'Delete outbound', 'Delete')) report(store.deleteOutbound(d.id))
}
async function closeDoc(d: Outbound) {
  const out = outboundProgress(d).outstanding
  if (await confirm(`Close DO ${d.no}? The ${fmtQty(out)} outstanding units will not be fulfilled.`, 'Close outbound', 'Close DO')) report(store.closeOutbound(d.id))
}
function dispatchDoc(d: Outbound) {
  if (report(store.dispatch(d.id)) && pickDocId.value === d.id) initAllPlans()
}

// ---------------------------------------------------------------- log dialog
const logDoc = ref<{ no: string; logs: DocLog[] } | null>(null)
const logOpen = ref(false)
function openLog(d: Outbound) {
  logDoc.value = { no: d.no, logs: d.logs }
  logOpen.value = true
}

// ---------------------------------------------------------------- new outbound
// `origIdx` links a line to the existing item while editing; `min` = picked + shipped qty (locks the line).
interface Line { sku: string; qty: number; origIdx: number | null; min: number }
const newLine = (sku = ''): Line => ({ sku, qty: 1, origIdx: null, min: 0 })
const createOpen = ref(false)
const editId = ref<number | null>(null)
const editDoc = computed(() => (editId.value === null ? null : store.outbound.find((d) => d.id === editId.value) ?? null))
const form = reactive({ no: '', poCust: '', customer: '', note: '', items: [newLine()] as Line[] })
const canEdit = (d: Outbound) => !d.dispatched && access.can('outbound-picking', 'create')
/** Original line is allocated and the edit changes its SKU or qty → it will be released and re-allocated. */
function willReallocate(line: Line) {
  const old = line.origIdx !== null ? editDoc.value?.items[line.origIdx] : undefined
  return !!old && old.status === 'ALLOCATED' && (old.sku !== line.sku || old.qty !== Number(line.qty))
}
const customers = computed(() => store.contacts.filter((c) => c.type === 'CUSTOMER'))
const activeSkus = computed(() => store.skus.filter((s) => !s.inactive))
const collab = useDocCollabKey('wms-outbound')

function openCreate(prefillSku = '') {
  editId.value = null
  form.no = ''
  form.poCust = ''
  form.customer = ''
  form.note = ''
  form.items = [newLine(prefillSku)]
  collab.startCreate()
  createOpen.value = true
}
function openEdit(d: Outbound) {
  editId.value = d.id
  form.no = d.no
  form.poCust = d.poCust
  form.customer = d.customer
  form.note = d.note
  form.items = d.items.map((it, i) => ({
    sku: it.sku,
    qty: it.qty,
    origIdx: i,
    min: it.shippedQty + (it.status === 'PICKED' ? it.pickedQty : 0),
  }))
  collab.startEdit(d.no)
  createOpen.value = true
}
function submitEdit(id: number) {
  const r = store.updateOutbound(id, {
    poCust: form.poCust,
    customer: form.customer,
    note: form.note,
    items: form.items.map((l) => ({ sku: l.sku, qty: Number(l.qty) || 0, origIdx: l.origIdx })),
  })
  if (report(r)) createOpen.value = false
}
function submitCreate() {
  if (editId.value !== null) return submitEdit(editId.value)
  const r = store.createOutbound({
    no: form.no,
    poCust: form.poCust,
    customer: form.customer,
    note: form.note,
    items: form.items.map((l) => ({ sku: l.sku, qty: Number(l.qty) || 0 })),
  })
  if (!report(r)) return
  if (r.data) collab.commit(r.data.no)
  createOpen.value = false
}

// ---------------------------------------------------------------- picking dialog
interface AllocRow { key: string; qty: number }
const pickOpen = ref(false)
const pickDocId = ref<number | null>(null)
const pickDoc = computed(() => store.outbound.find((d) => d.id === pickDocId.value) ?? null)
const plans = ref<Record<number, AllocRow[]>>({})

function initPlan(idx: number) {
  const it = pickDoc.value?.items[idx]
  if (!it || it.status !== 'PENDING') {
    plans.value[idx] = []
    return
  }
  const cands = store.fefoCandidates(it).cands
  plans.value[idx] = store.buildFefoPlan(it).map((a) => ({
    key: cands.find((c) => c.bin === a.bin && c.batch === a.batch && c.exp === a.exp)?.key ?? '',
    qty: a.qty,
  }))
}
function initAllPlans() {
  plans.value = {}
  pickDoc.value?.items.forEach((_, i) => initPlan(i))
}
function openPick(d: Outbound) {
  pickDocId.value = d.id
  initAllPlans()
  pickOpen.value = true
}
function addRow(idx: number) {
  const rows = plans.value[idx] ?? (plans.value[idx] = [])
  rows.push({ key: '', qty: 0 })
}
function toAllocs(it: OutboundItem, idx: number): Alloc[] | null {
  const cands = store.fefoCandidates(it).cands
  const out: Alloc[] = []
  for (const r of plans.value[idx] ?? []) {
    const c = cands.find((x) => x.key === r.key)
    if (!c) return null
    out.push({ bin: c.bin, batch: c.batch, exp: c.exp, qty: Number(r.qty) || 0 })
  }
  return out
}
function validation(it: OutboundItem, idx: number): Result {
  const allocs = toAllocs(it, idx)
  if (!allocs) return { ok: false, msg: 'Choose a lot for every row.' }
  return store.validateAllocation(it, allocs)
}
const plannedTotal = (idx: number) => (plans.value[idx] ?? []).reduce((a, r) => a + (Number(r.qty) || 0), 0)

function allocate(idx: number) {
  const doc = pickDoc.value
  const it = doc?.items[idx]
  if (!doc || !it) return
  const allocs = toAllocs(it, idx)
  if (!allocs) return ElMessage.warning('Choose a lot for every row.')
  if (report(store.allocateItem(doc.id, idx, allocs))) initAllPlans()
}
function release(idx: number) {
  if (pickDoc.value && report(store.unallocateItem(pickDoc.value.id, idx))) initAllPlans()
}
function pick(idx: number) {
  if (pickDoc.value && report(store.executePick(pickDoc.value.id, idx))) initAllPlans()
}

// ---------------------------------------------------------------- print delivery order / pick list
function printDo(d: Outbound) {
  if (!d.shipments.length) return ElMessage.warning('This DO has no shipment yet.')
  if (!printDeliveryOrder(d)) ElMessage.warning('Allow pop-ups to print the delivery order.')
}
function printPick(d: Outbound) {
  if (!printPicklist(d)) ElMessage.warning('Allow pop-ups to print the pick list.')
}

// ---------------------------------------------------------------- deep links (?sku=, ?new=1)
onMounted(() => {
  const s = typeof route.query.sku === 'string' ? route.query.sku : ''
  if (s) openCreate(store.sku(s) ? s : '')
  else if (route.query.new === '1' && access.can('outbound-picking', 'create')) openCreate()
})
</script>

<template>
  <div class="page">
    <PageHeader title="Outbound Picking (FEFO)" subtitle="Delivery orders are allocated first-expired-first-out, picked from bins and dispatched in one or more shipments.">
      <template #actions>
        <el-button v-if="access.can('outbound-picking', 'create')" type="primary" :icon="Plus" @click="openCreate()">New outbound</el-button>
      </template>
    </PageHeader>

    <div class="card">
      <TransactionFilterBar
        v-model="filters"
        :fields="fieldOptions"
        :statuses="statusOptions"
        :secondary-statuses="termOptions"
        secondary-status-label="Term"
        :loading="refreshing"
        @reset="reset"
        @refresh="refresh"
      />

      <el-table :data="paged" row-key="id" empty-text="No outbound documents">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="wms-expand">
              <el-table :data="row.items" size="small">
                <el-table-column label="SKU" prop="sku" width="90" />
                <el-table-column label="Name" min-width="190">
                  <template #default="{ row: it }">{{ store.skuName(it.sku) }}</template>
                </el-table-column>
                <el-table-column label="Qty" width="100" align="right">
                  <template #default="{ row: it }">{{ fmtQty(it.qty) }} {{ store.skuUnit(it.sku) }}</template>
                </el-table-column>
                <el-table-column label="Status" width="110">
                  <template #default="{ row: it }">
                    <span class="status-pill" :class="ITEM_STATUS_COLOR[it.status as OutboundItemStatus]">{{ it.status }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="Allocations" min-width="300">
                  <template #default="{ row: it }">
                    <span v-if="!it.allocations.length" class="wms-muted">-</span>
                    <div v-for="(a, ai) in it.allocations" :key="ai" class="wms-alloc">
                      <span class="wms-chip">{{ a.bin }} · {{ a.batch }} · {{ fmtQty(a.qty) }}</span>
                      <ExpiryTag :exp="a.exp" :has-expiry="a.exp !== '-'" />
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="Shipped" width="90" align="right">
                  <template #default="{ row: it }">{{ fmtQty(it.shippedQty) }}</template>
                </el-table-column>
              </el-table>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Date" width="115">
          <template #default="{ row }">{{ fmtDate(row.date) }}</template>
        </el-table-column>
        <el-table-column label="DO no." min-width="150">
          <template #default="{ row }"><span class="wms-strong">{{ row.no }}</span></template>
        </el-table-column>
        <el-table-column label="Customer PO" prop="poCust" min-width="120" />
        <el-table-column label="Customer" min-width="170">
          <template #default="{ row }">
            <div>{{ row.customer }}</div>
            <span class="status-pill" :class="termColor(row.term)">{{ row.term }}</span>
          </template>
        </el-table-column>
        <el-table-column label="# SKU" width="70" align="center">
          <template #default="{ row }">{{ row.items.length }}</template>
        </el-table-column>
        <el-table-column label="Total qty" width="95" align="right">
          <template #default="{ row }">{{ fmtQty(totalQty(row)) }}</template>
        </el-table-column>
        <el-table-column label="Status" width="145">
          <template #default="{ row }">
            <span class="status-pill" :class="OUTBOUND_STATUS_COLOR[outboundStatus(row)]">{{ outboundStatus(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Progress" width="140">
          <template #default="{ row }">
            <el-progress :percentage="outboundProgress(row).pct" :show-text="false" :stroke-width="6" :status="outboundProgress(row).pct === 100 ? 'success' : undefined" />
            <div class="wms-hint">{{ fmtQty(outboundProgress(row).doneQty) }}/{{ fmtQty(outboundProgress(row).totalQty) }} units</div>
            <div v-if="row.shipments.length && outboundProgress(row).outstanding > 0" class="wms-hint wms-warn">
              {{ fmtQty(outboundProgress(row).outstanding) }} outstanding
            </div>
          </template>
        </el-table-column>
        <el-table-column label="" width="250" align="right" fixed="right">
          <template #default="{ row }">
            <div class="wms-actions">
              <el-button v-if="!row.dispatched && access.can('outbound-picking', 'execute')" size="small" type="primary" @click="openPick(row)">Pick</el-button>
              <el-button v-if="outboundReady(row) && access.can('outbound-picking', 'execute')" size="small" type="success" @click="dispatchDoc(row)">Dispatch</el-button>
              <el-button v-if="canClose(row) && access.can('outbound-picking', 'execute')" size="small" @click="closeDoc(row)">Close</el-button>
              <el-button v-if="canEdit(row)" size="small" :icon="Edit" title="Edit" @click="openEdit(row)" />
              <el-button v-if="!row.dispatched" size="small" :icon="List" title="Print pick list" @click="printPick(row)" />
              <el-button v-if="row.shipments.length" size="small" :icon="Printer" title="Print delivery order" @click="printDo(row)" />
              <el-button size="small" :icon="Document" title="Activity log" @click="openLog(row)" />
              <el-button v-if="canDelete(row) && access.can('outbound-picking', 'delete')" size="small" :icon="Delete" type="danger" plain title="Delete" @click="removeDoc(row)" />
            </div>
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar v-model:page="page" :page-size="pageSize" :total="filtered.length" />
    </div>

    <!-- New outbound -->
    <el-dialog v-model="createOpen" :title="editDoc ? `Edit DO ${editDoc.no}` : 'New outbound'" width="820px" top="5vh" @closed="collab.closed">
      <div v-if="editDoc" class="wms-info">
        Lines already picked or shipped keep their product and cannot go below the picked/shipped qty.
        Changing the product or qty of an allocated line releases its allocation and re-allocates FEFO.
      </div>
      <el-form label-position="top" class="wms-form-grid">
        <el-form-item :label="editDoc ? 'DO no.' : 'DO no. (optional)'">
          <el-input v-model="form.no" :disabled="!!editDoc" placeholder="Auto-generated if empty" />
          <div v-if="editDoc" class="wms-hint">The DO number cannot change.</div>
        </el-form-item>
        <el-form-item label="Customer PO" required>
          <el-input v-model="form.poCust" placeholder="e.g. PO-CANTIK-120" />
        </el-form-item>
        <el-form-item label="Customer" required>
          <el-select v-model="form.customer" filterable placeholder="Choose customer" style="width: 100%">
            <el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.name">
              <div class="wms-opt"><span>{{ c.name }}</span><span class="wms-muted">{{ c.term ?? 'BELI PUTUS' }}</span></div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="Note" class="wms-span-all">
          <el-input v-model="form.note" placeholder="Optional note" />
        </el-form-item>
      </el-form>

      <div class="wms-lines-head">Items</div>
      <template v-for="(line, i) in form.items" :key="i">
        <div class="wms-line">
          <el-select v-model="line.sku" filterable placeholder="Product" class="wms-line-sku" :disabled="line.min > 0">
            <el-option v-if="line.sku && !activeSkus.some((s) => s.sku === line.sku)" :label="`${store.skuName(line.sku)} (${line.sku})`" :value="line.sku" />
            <el-option v-for="s in activeSkus" :key="s.sku" :label="`${s.name} (${s.sku})`" :value="s.sku">
              <div class="wms-opt">
                <span>{{ s.name }} <span class="wms-muted">{{ s.sku }}</span></span>
                <span class="wms-muted">available {{ fmtQty(store.availableQty(s.sku)) }} {{ s.unit }}</span>
              </div>
            </el-option>
          </el-select>
          <el-input-number v-model="line.qty" :min="Math.max(1, line.min)" :controls="false" class="wms-line-qty" />
          <span class="wms-unit">{{ line.sku ? store.skuUnit(line.sku) : '' }}</span>
          <span v-if="line.sku" class="wms-hint" :class="{ 'wms-warn': store.availableQty(line.sku) < line.qty }">
            available {{ fmtQty(store.availableQty(line.sku)) }}
          </span>
          <el-button
            :icon="Delete"
            text
            type="danger"
            :disabled="form.items.length === 1 || line.min > 0"
            :title="line.min > 0 ? 'Already picked/shipped – cannot be removed' : 'Remove line'"
            @click="form.items.splice(i, 1)"
          />
        </div>
        <div v-if="line.min > 0" class="wms-hint wms-line-lock">
          🔒 {{ fmtQty(line.min) }} {{ store.skuUnit(line.sku) }} already picked/shipped – product is locked; qty must stay ≥ {{ fmtQty(line.min) }}.
        </div>
        <div v-else-if="willReallocate(line)" class="wms-hint wms-line-lock wms-warn">
          Allocation will be released and re-allocated (FEFO) on save.
        </div>
      </template>
      <el-button :icon="Plus" size="small" @click="form.items.push(newLine())">Add line</el-button>
      <div class="wms-hint wms-mt">Stock is allocated automatically (FEFO). Lines without enough stock wait as PENDING until stock arrives.</div>

      <DocCollabSection :doc-key="collab.key.value" />

      <template #footer>
        <el-button @click="createOpen = false">Cancel</el-button>
        <el-button type="primary" @click="submitCreate">{{ editDoc ? 'Save changes' : 'Create DO' }}</el-button>
      </template>
    </el-dialog>

    <!-- Picking -->
    <el-dialog v-model="pickOpen" :title="pickDoc ? `Picking – ${pickDoc.no}` : 'Picking'" width="940px" top="5vh">
      <template v-if="pickDoc">
        <div class="wms-info">
          {{ pickDoc.customer }} · PO {{ pickDoc.poCust }} ·
          <span class="status-pill" :class="OUTBOUND_STATUS_COLOR[outboundStatus(pickDoc)]">{{ outboundStatus(pickDoc) }}</span>
        </div>
        <div v-for="(it, idx) in pickDoc.items" :key="idx" class="wms-item-card">
          <div class="wms-item-head">
            <div>
              <div class="wms-strong">{{ it.sku }} – {{ store.skuName(it.sku) }}</div>
              <div class="wms-hint">
                <span class="status-pill" :class="ITEM_STATUS_COLOR[it.status]">{{ it.status }}</span>
                Available {{ fmtQty(store.fefoCandidates(it).totalAvail) }} {{ store.skuUnit(it.sku) }}
              </div>
            </div>
            <div class="wms-qty-chips">
              <span class="wms-chip">Order {{ fmtQty(it.qty) }}</span>
              <span class="wms-chip green">Shipped {{ fmtQty(it.shippedQty) }}</span>
              <span class="wms-chip amber">Outstanding {{ fmtQty(itemOutstanding(it)) }}</span>
            </div>
          </div>

          <!-- PENDING: editable FEFO allocation -->
          <template v-if="it.status === 'PENDING' && !pickDoc.dispatched">
            <div v-for="(row, ri) in plans[idx] ?? []" :key="ri" class="wms-plan-row">
              <el-select v-model="row.key" filterable placeholder="Lot" class="wms-plan-bin">
                <el-option
                  v-for="c in store.fefoCandidates(it).cands"
                  :key="c.key"
                  :value="c.key"
                  :disabled="c.availQty <= 0"
                  :label="`${c.bin} · ${c.batch} · ${c.exp === '-' ? 'No expiry' : expiryLabel(c.expStatus)} · free ${fmtQty(c.availQty)}`"
                />
              </el-select>
              <el-input-number v-model="row.qty" :min="0" :controls="false" class="wms-plan-qty" />
              <el-button :icon="Delete" text type="danger" @click="plans[idx]?.splice(ri, 1)" />
            </div>
            <div v-if="!store.fefoCandidates(it).cands.length" class="wms-hint wms-warn">No stock on the shelves for this SKU.</div>
            <div class="wms-plan-actions">
              <el-button size="small" @click="initPlan(idx)">Auto FEFO</el-button>
              <el-button size="small" :icon="Plus" @click="addRow(idx)">Location</el-button>
              <span class="wms-hint">Planned {{ fmtQty(plannedTotal(idx)) }} / {{ fmtQty(itemOutstanding(it)) }}</span>
              <span class="wms-spacer" />
              <span v-if="!validation(it, idx).ok" class="wms-error">{{ validation(it, idx).msg }}</span>
              <el-button type="primary" size="small" :disabled="!validation(it, idx).ok" @click="allocate(idx)">Allocate</el-button>
            </div>
          </template>

          <!-- ALLOCATED: ready to pick -->
          <template v-else-if="it.status === 'ALLOCATED'">
            <el-table :data="it.allocations" size="small">
              <el-table-column label="Bin" prop="bin" width="130" />
              <el-table-column label="Batch" prop="batch" width="140" />
              <el-table-column label="Expiry" width="120">
                <template #default="{ row: a }">{{ fmtDate(a.exp) }}</template>
              </el-table-column>
              <el-table-column label="" min-width="130">
                <template #default="{ row: a }"><ExpiryTag :exp="a.exp" :has-expiry="a.exp !== '-'" show-days /></template>
              </el-table-column>
              <el-table-column label="Qty" width="100" align="right">
                <template #default="{ row: a }">{{ fmtQty(a.qty) }}</template>
              </el-table-column>
            </el-table>
            <div class="wms-plan-actions">
              <span class="wms-spacer" />
              <el-button size="small" @click="release(idx)">Release</el-button>
              <el-button size="small" type="primary" @click="pick(idx)">Execute pick</el-button>
            </div>
          </template>

          <!-- PICKED / SHIPPED: read-only -->
          <template v-else>
            <div class="wms-done">
              <span class="wms-hint">{{ it.status === 'PICKED' ? `Picked ${fmtQty(it.pickedQty)} – ready to ship:` : 'Shipped from:' }}</span>
              <span v-for="(a, ai) in it.status === 'PICKED' ? it.allocations : it.shippedAllocs" :key="ai" class="wms-alloc">
                <span class="wms-chip">{{ a.bin }} · {{ a.batch }} · {{ fmtQty(a.qty) }}</span>
                <ExpiryTag :exp="a.exp" :has-expiry="a.exp !== '-'" />
              </span>
              <span v-if="it.status === 'PENDING'" class="wms-hint">Not fulfilled (DO closed).</span>
            </div>
          </template>
        </div>
      </template>
      <template #footer>
        <div class="wms-footer">
          <span class="wms-hint">Dispatch ships every picked line. Quantities not picked yet stay outstanding and can follow in a later shipment (or the DO can be closed short).</span>
          <div>
            <el-button @click="pickOpen = false">Close</el-button>
            <el-button type="success" :disabled="!pickDoc || !outboundReady(pickDoc)" @click="pickDoc && dispatchDoc(pickDoc)">Dispatch</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- Log -->
    <el-dialog v-model="logOpen" :title="logDoc ? `Activity log – ${logDoc.no}` : 'Activity log'" width="620px">
      <el-table v-if="logDoc" :data="[...logDoc.logs].reverse()" size="small" empty-text="No activity yet">
        <el-table-column label="Time" width="170">
          <template #default="{ row }">{{ fmtDateTime(row.ts) }}</template>
        </el-table-column>
        <el-table-column label="By" prop="by" width="110" />
        <el-table-column label="Action" min-width="200">
          <template #default="{ row }">
            <div>{{ row.action }}</div>
            <div v-if="row.note" class="wms-hint">{{ row.note }}</div>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<style scoped>
.wms-expand {
  padding: 6px 16px 10px 48px;
}
.wms-strong {
  font-weight: 600;
  color: var(--gray-900);
}
.wms-hint {
  font-size: 12px;
  color: var(--gray-500);
}
.wms-warn {
  color: #b45309;
}
.wms-muted {
  color: var(--gray-400);
  font-size: 12px;
}
.wms-mt {
  margin-top: 10px;
}
.wms-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 4px;
}
.wms-actions .el-button + .el-button {
  margin-left: 0;
}
.wms-alloc {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: 8px;
}
.wms-chip {
  display: inline-block;
  font-size: 12px;
  padding: 1px 8px;
  margin: 2px 4px 2px 0;
  border-radius: 999px;
  background: var(--brand-light);
  color: var(--brand-dark);
  white-space: nowrap;
}
.wms-chip.green {
  background: var(--success-light);
  color: #15803d;
}
.wms-chip.amber {
  background: var(--warning-light);
  color: #b45309;
}
.wms-info {
  background: var(--brand-light);
  color: var(--brand-dark);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  margin-bottom: 14px;
  font-size: 13px;
}
.wms-form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 14px;
}
.wms-span-all {
  grid-column: 1 / -1;
}
.wms-lines-head {
  font-weight: 600;
  color: var(--gray-900);
  margin: 4px 0 8px;
}
.wms-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.wms-line-sku {
  flex: 1 1 300px;
  min-width: 220px;
}
.wms-line-lock {
  margin: -4px 0 8px 2px;
}
.wms-line-qty {
  width: 100px;
}
.wms-unit {
  width: 56px;
  font-size: 12px;
  color: var(--gray-500);
}
.wms-opt {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.wms-item-card {
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  padding: 12px 14px;
  margin-bottom: 12px;
}
.wms-item-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.wms-item-head .status-pill {
  margin-right: 6px;
}
.wms-qty-chips {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
}
.wms-plan-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.wms-plan-bin {
  flex: 1;
}
.wms-plan-qty {
  width: 110px;
}
.wms-plan-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.wms-spacer {
  flex: 1;
}
.wms-error {
  font-size: 12px;
  color: #b91c1c;
}
.wms-done {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
.wms-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  text-align: left;
}
.wms-footer > div {
  display: flex;
  flex-shrink: 0;
}
@media (max-width: 760px) {
  .wms-form-grid {
    grid-template-columns: 1fr;
  }
  .wms-footer {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
