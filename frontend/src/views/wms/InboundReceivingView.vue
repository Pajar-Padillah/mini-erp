<script setup lang="ts">
// Inbound receiving (goods land in transit) and putaway into storage bins.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Document, Edit, Plus, Printer } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import TransactionFilterBar from '../../components/TransactionFilterBar.vue'
import { useListFilter } from './useListFilter'
import ExpiryTag from './ExpiryTag.vue'
import { fmtDate, fmtDateTime, fmtQty, INBOUND_STATUS_COLOR } from './wmsUi'
import { printPutawaySheet } from './wmsPrint'
import {
  useWmsStore, binAvailCap, inboundProgress, inboundStatus, itemPutawayDone, itemPutawayRemaining, TRANSIT_BIN,
  type DocLog, type Inbound, type InboundItem, type InboundStatus,
} from '../../stores/wmsStore'
import { useAccessStore } from '../../stores/accessStore'
import { docKey } from '../../stores/docCollabStore'
import DocCollabSection from './DocCollabSection.vue'
import DocCollabPanel from '../../components/doc-collab/DocCollabPanel.vue'
import { useDocCollabKey } from './useDocCollabKey'

const store = useWmsStore()
const access = useAccessStore()
const route = useRoute()

const STATUSES: InboundStatus[] = ['IN TRANSIT', 'PARTIAL PUTAWAY', 'PUTAWAY COMPLETE']

function printSheet(d: Inbound) {
  if (!printPutawaySheet(d)) ElMessage.warning('Allow pop-ups to print the putaway sheet.')
}

// ---------------------------------------------------------------- list
const page = ref(1)
const pageSize = 10
const expanded = ref<string[]>([])
function toggleExpand(d: Inbound) {
  const key = String(d.id)
  expanded.value = expanded.value.includes(key) ? expanded.value.filter((k) => k !== key) : [...expanded.value, key]
}

const sorted = computed(() => [...store.inbound].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id))
const { filters, fieldOptions, filtered, reset, refresh, refreshing } = useListFilter(() => sorted.value, {
  date: (d) => d.date,
  status: (d) => inboundStatus(d),
  secondaryStatus: (d) => d.source ?? 'SUPPLIER',
  fields: [
    { label: 'Delivery note', value: 'no', get: (d) => d.no },
    { label: 'Supplier', value: 'supplier', get: (d) => d.supplier },
    { label: 'PO ref', value: 'poRef', get: (d) => d.poRef },
    { label: 'SKU', value: 'sku', get: (d) => d.items.map((i) => `${i.sku} ${store.skuName(i.sku)}`).join(' ') },
    { label: 'Batch', value: 'batch', get: (d) => d.items.map((i) => i.batch).join(' ') },
  ],
}, page)
const statusOptions = STATUSES.map((st) => ({ label: st, value: st, color: INBOUND_STATUS_COLOR[st] }))
const sourceOptions = [
  { label: 'Supplier', value: 'SUPPLIER', color: 'blue' },
  { label: 'Transfer', value: 'TRANSFER', color: 'gray' },
]
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

const totalQty = (d: Inbound) => d.items.reduce((a, i) => a + i.qty, 0)

function itemStatus(it: InboundItem): { label: string; color: string } {
  const done = itemPutawayDone(it)
  if (done === 0) return { label: 'IN TRANSIT', color: 'amber' }
  return done < it.qty ? { label: 'PARTIAL', color: 'blue' } : { label: 'PUT AWAY', color: 'green' }
}

async function removeDoc(d: Inbound) {
  try {
    await ElMessageBox.confirm(`Delete inbound ${d.no}? Goods still in transit will be cancelled.`, 'Delete inbound', { type: 'warning', confirmButtonText: 'Delete' })
  } catch {
    return
  }
  const r = store.deleteInbound(d.id)
  if (r.ok) ElMessage.success(r.msg)
  else ElMessage.warning(r.msg)
}

// ---------------------------------------------------------------- log dialog
const logDoc = ref<{ no: string; logs: DocLog[] } | null>(null)
const logOpen = ref(false)
function openLog(d: Inbound) {
  logDoc.value = { no: d.no, logs: d.logs }
  logOpen.value = true
}

// ---------------------------------------------------------------- new inbound
// `origIdx` links a line to the existing item while editing; `done` = qty already put away (locks the line).
interface Line { sku: string; qty: number; batch: string; exp: string; origIdx: number | null; done: number }
const newLine = (): Line => ({ sku: '', qty: 1, batch: '', exp: '', origIdx: null, done: 0 })
const createOpen = ref(false)
const editId = ref<number | null>(null)
const editDoc = computed(() => (editId.value === null ? null : store.inbound.find((d) => d.id === editId.value) ?? null))
const form = reactive({ no: '', poRef: '', supplier: '', date: '', items: [newLine()] as Line[] })
const canEdit = (d: Inbound) => d.source !== 'TRANSFER' && access.can('inbound-receiving', 'edit')
const suppliers = computed(() => store.contacts.filter((c) => c.type === 'SUPPLIER'))
const activeSkus = computed(() => store.skus.filter((s) => !s.inactive))
const collab = useDocCollabKey('wms-inbound')

function openCreate() {
  editId.value = null
  form.no = ''
  form.poRef = ''
  form.supplier = ''
  form.date = ''
  form.items = [newLine()]
  collab.startCreate()
  createOpen.value = true
}
function openEdit(d: Inbound) {
  editId.value = d.id
  form.no = d.no
  form.poRef = d.poRef
  form.supplier = d.supplier
  form.date = d.date
  form.items = d.items.map((it, i) => ({
    sku: it.sku,
    qty: it.qty,
    batch: it.batch === '-' ? '' : it.batch,
    exp: it.exp === '-' ? '' : it.exp,
    origIdx: i,
    done: itemPutawayDone(it),
  }))
  collab.startEdit(d.no)
  createOpen.value = true
}
function onLineSku(line: Line) {
  const s = store.sku(line.sku)
  if (!s?.hasBatch) line.batch = ''
  if (!s?.hasExpiry) line.exp = ''
}
const disablePast = (d: Date) => {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return d.getTime() <= t.getTime()
}
function submitCreate() {
  if (editId.value !== null) return submitEdit(editId.value)
  const r = store.createInbound({
    no: form.no,
    poRef: form.poRef,
    supplier: form.supplier,
    items: form.items.map((l) => ({ sku: l.sku, qty: Number(l.qty) || 0, batch: l.batch, exp: l.exp })),
  })
  if (!r.ok) return ElMessage.warning(r.msg)
  collab.commit(r.data?.no ?? form.no.trim().toUpperCase())
  ElMessage.success(r.msg)
  createOpen.value = false
}

function submitEdit(id: number) {
  const oldNo = store.inbound.find((d) => d.id === id)?.no
  const r = store.updateInbound(id, {
    no: form.no,
    poRef: form.poRef,
    supplier: form.supplier,
    date: form.date,
    items: form.items.map((l) => ({ sku: l.sku, qty: Number(l.qty) || 0, batch: l.batch, exp: l.exp, origIdx: l.origIdx })),
  })
  if (!r.ok) return ElMessage.warning(r.msg)
  const newNo = r.data?.no ?? store.inbound.find((d) => d.id === id)?.no
  if (oldNo && newNo) collab.rename(oldNo, newNo)
  ElMessage.success(r.msg)
  createOpen.value = false
}

// ---------------------------------------------------------------- putaway dialog
interface PlanRow { bin: string; qty: number }
const putawayOpen = ref(false)
const putawayDocId = ref<number | null>(null)
const putawayDoc = computed(() => store.inbound.find((d) => d.id === putawayDocId.value) ?? null)
const plans = ref<Record<number, PlanRow[]>>({})

function initPlan(idx: number) {
  const it = putawayDoc.value?.items[idx]
  plans.value[idx] = it ? store.buildPutawayPlan(it).map((r) => ({ ...r })) : []
}
function openPutaway(d: Inbound) {
  putawayDocId.value = d.id
  plans.value = {}
  d.items.forEach((_, i) => initPlan(i))
  putawayOpen.value = true
}
function addPlanRow(idx: number) {
  const it = putawayDoc.value?.items[idx]
  if (!it) return
  const rows = plans.value[idx] ?? (plans.value[idx] = [])
  const planned = rows.reduce((a, r) => a + (Number(r.qty) || 0), 0)
  rows.push({ bin: '', qty: Math.max(0, itemPutawayRemaining(it) - planned) })
}
function removePlanRow(idx: number, i: number) {
  plans.value[idx]?.splice(i, 1)
}
function planOf(idx: number): PlanRow[] {
  return (plans.value[idx] ?? []).map((r) => ({ bin: r.bin, qty: Number(r.qty) || 0 }))
}
function validation(it: InboundItem, idx: number) {
  const rows = planOf(idx)
  if (rows.some((r) => !r.bin)) return { ok: false, msg: 'Choose a bin for every row.' }
  return store.validatePutaway(it, rows)
}
const plannedTotal = (idx: number) => planOf(idx).reduce((a, r) => a + r.qty, 0)

function binLabel(code: string, targetZone: string): string {
  const b = store.bin(code)
  if (!b) return code
  return `${b.zone === targetZone ? '★ ' : ''}${b.bin} [${b.zone}] · free cap ${fmtQty(binAvailCap(b))}${store.isFrozen(b.bin) ? ' 🔒' : ''}`
}

function executePutaway(idx: number) {
  const doc = putawayDoc.value
  const it = doc?.items[idx]
  if (!doc || !it) return
  const v = validation(it, idx)
  if (!v.ok) return ElMessage.warning(v.msg)
  const r = store.executePutaway(doc.id, idx, planOf(idx))
  if (!r.ok) return ElMessage.warning(r.msg)
  ElMessage.success(r.msg)
  // Bin capacities changed: refresh the plans of the remaining items.
  doc.items.forEach((_, i) => initPlan(i))
}

// ---------------------------------------------------------------- deep links (?no=, ?new=1)
function applyQuery() {
  if (route.query.new === '1' && access.can('inbound-receiving', 'create')) return openCreate()
  const no = typeof route.query.no === 'string' ? route.query.no : ''
  if (!no) return
  filters.value = { ...filters.value, dateRange: [], conditions: [{ field: 'no', operator: '=', value: no }] }
  const doc = store.inbound.find((d) => d.no === no)
  if (!doc) return
  expanded.value = [String(doc.id)]
  if (inboundStatus(doc) !== 'PUTAWAY COMPLETE') openPutaway(doc)
}
onMounted(applyQuery)
watch(() => route.query.no, applyQuery)
</script>

<template>
  <div class="page">
    <PageHeader title="Inbound Receiving & Putaway" subtitle="Receive supplier deliveries into transit, then put the goods away into storage bins.">
      <template #actions>
        <el-button v-if="access.can('inbound-receiving', 'create')" type="primary" :icon="Plus" @click="openCreate">New inbound</el-button>
      </template>
    </PageHeader>

    <div class="card">
      <TransactionFilterBar
        v-model="filters"
        :fields="fieldOptions"
        :statuses="statusOptions"
        :secondary-statuses="sourceOptions"
        secondary-status-label="Source"
        :loading="refreshing"
        @reset="reset"
        @refresh="refresh"
      />

      <el-table :data="paged" :row-key="(r: Inbound) => String(r.id)" :expand-row-keys="expanded" empty-text="No inbound documents">
        <el-table-column type="expand" width="1" class-name="wms-expand-col">
          <template #default="{ row }">
            <div class="wms-expand">
              <el-table :data="row.items" size="small">
                <el-table-column label="SKU" prop="sku" width="100" />
                <el-table-column label="Name" min-width="200">
                  <template #default="{ row: it }">{{ store.skuName(it.sku) }}</template>
                </el-table-column>
                <el-table-column label="Qty" width="110" align="right">
                  <template #default="{ row: it }">{{ fmtQty(it.qty) }} {{ store.skuUnit(it.sku) }}</template>
                </el-table-column>
                <el-table-column label="Batch" prop="batch" width="130" />
                <el-table-column label="Expiry" width="210">
                  <template #default="{ row: it }">
                    <div class="wms-exp">
                      <span>{{ fmtDate(it.exp) }}</span>
                      <ExpiryTag :exp="it.exp" :has-expiry="it.exp !== '-'" />
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="Put away" width="100" align="right">
                  <template #default="{ row: it }">{{ fmtQty(itemPutawayDone(it)) }}</template>
                </el-table-column>
                <el-table-column label="Locations" min-width="200">
                  <template #default="{ row: it }">
                    <span v-if="!it.putaways.length" class="wms-muted">-</span>
                    <span v-for="p in it.putaways" :key="p.bin" class="wms-chip">{{ p.bin }} · {{ fmtQty(p.qty) }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="Status" width="120">
                  <template #default="{ row: it }">
                    <span class="status-pill" :class="itemStatus(it).color">{{ itemStatus(it).label }}</span>
                  </template>
                </el-table-column>
              </el-table>
              <div class="wms-expand-collab">
                <DocCollabPanel :doc-key="docKey('wms-inbound', row.no)" />
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Date" width="115">
          <template #default="{ row }">{{ fmtDate(row.date) }}</template>
        </el-table-column>
        <el-table-column label="Delivery note" min-width="160">
          <template #default="{ row }">
            <div class="wms-doc-toggle" title="Show details" @click="toggleExpand(row)">
              <div class="wms-strong wms-doc-link">{{ row.no }}</div>
              <div v-if="row.poRef" class="wms-hint">PO {{ row.poRef }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Supplier" min-width="180">
          <template #default="{ row }">
            <span>{{ row.supplier }}</span>
            <span v-if="row.source === 'TRANSFER'" class="status-pill blue wms-ml">TRANSFER</span>
          </template>
        </el-table-column>
        <el-table-column label="# SKU" width="70" align="center">
          <template #default="{ row }">{{ row.items.length }}</template>
        </el-table-column>
        <el-table-column label="Total qty" width="95" align="right">
          <template #default="{ row }">{{ fmtQty(totalQty(row)) }}</template>
        </el-table-column>
        <el-table-column label="Status" width="160">
          <template #default="{ row }">
            <span class="status-pill" :class="INBOUND_STATUS_COLOR[inboundStatus(row)]">{{ inboundStatus(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Progress" width="170">
          <template #default="{ row }">
            <el-progress :percentage="inboundProgress(row).pct" :show-text="false" :stroke-width="6" :status="inboundProgress(row).pct === 100 ? 'success' : undefined" />
            <div class="wms-hint">{{ fmtQty(inboundProgress(row).doneQty) }}/{{ fmtQty(inboundProgress(row).totalQty) }} units</div>
          </template>
        </el-table-column>
        <el-table-column label="" width="260" align="right" fixed="right">
          <template #default="{ row }">
            <div class="wms-actions">
              <el-button v-if="inboundStatus(row) !== 'PUTAWAY COMPLETE' && access.can('inbound-receiving', 'execute')" size="small" type="primary" @click="openPutaway(row)">Putaway</el-button>
              <el-button v-if="canEdit(row)" size="small" :icon="Edit" title="Edit" @click="openEdit(row)" />
              <el-button size="small" :icon="Printer" title="Print putaway sheet" @click="printSheet(row)" />
              <el-button size="small" :icon="Document" title="Activity log" @click="openLog(row)" />
              <el-button v-if="access.can('inbound-receiving', 'delete')" size="small" :icon="Delete" type="danger" plain title="Delete" @click="removeDoc(row)" />
            </div>
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar v-model:page="page" :page-size="pageSize" :total="filtered.length" />
    </div>

    <!-- New inbound -->
    <el-dialog v-model="createOpen" :title="editDoc ? `Edit inbound ${editDoc.no}` : 'New inbound'" width="900px" top="5vh" @closed="collab.closed">
      <div v-if="editDoc" class="wms-info">
        Qty changes are re-posted to Transit <b>{{ TRANSIT_BIN }}</b>. Lines that are already put away keep their product, batch and expiry,
        cannot be removed, and their qty cannot go below the put-away qty.
      </div>
      <div v-else class="wms-info">Goods land in Transit <b>{{ TRANSIT_BIN }}</b> until they are put away into a storage bin.</div>
      <el-form label-position="top" class="wms-form-grid">
        <el-form-item label="Delivery note no." required>
          <el-input v-model="form.no" placeholder="e.g. SJ-2026-0101" @input="(v: string) => (form.no = v.toUpperCase())" />
        </el-form-item>
        <el-form-item label="PO reference (optional)">
          <el-input v-model="form.poRef" placeholder="e.g. PO/AOR/0040" />
        </el-form-item>
        <el-form-item label="Supplier" required>
          <el-select v-model="form.supplier" filterable placeholder="Choose supplier" style="width: 100%">
            <el-option v-for="c in suppliers" :key="c.id" :label="c.name" :value="c.name" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="editDoc" label="Received date" required>
          <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" :clearable="false" style="width: 100%" />
        </el-form-item>
      </el-form>

      <div class="wms-lines-head">Items</div>
      <template v-for="(line, i) in form.items" :key="i">
        <div class="wms-line">
          <el-select v-model="line.sku" filterable placeholder="Product" class="wms-line-sku" :disabled="line.done > 0" @change="onLineSku(line)">
            <el-option v-if="line.sku && !activeSkus.some((s) => s.sku === line.sku)" :label="`${store.skuName(line.sku)} (${line.sku})`" :value="line.sku" />
            <el-option v-for="s in activeSkus" :key="s.sku" :label="`${s.name} (${s.sku})`" :value="s.sku">
              <div class="wms-opt"><span>{{ s.name }}</span><span class="wms-muted">{{ s.sku }}</span></div>
            </el-option>
          </el-select>
          <el-input-number v-model="line.qty" :min="Math.max(1, line.done)" :controls="false" class="wms-line-qty" placeholder="Qty" />
          <span class="wms-unit">{{ line.sku ? store.skuUnit(line.sku) : '' }}</span>
          <el-input v-model="line.batch" :disabled="line.done > 0 || !store.sku(line.sku)?.hasBatch" placeholder="Batch" class="wms-line-batch" />
          <el-date-picker
            v-model="line.exp"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="Expiry"
            :disabled="line.done > 0 || !store.sku(line.sku)?.hasExpiry"
            :disabled-date="disablePast"
            class="wms-line-exp"
          />
          <span class="wms-line-tag"><ExpiryTag v-if="line.exp" :exp="line.exp" show-days /></span>
          <el-button
            :icon="Delete"
            text
            type="danger"
            :disabled="form.items.length === 1 || line.done > 0"
            :title="line.done > 0 ? 'Already put away – cannot be removed' : 'Remove line'"
            @click="form.items.splice(i, 1)"
          />
        </div>
        <div v-if="line.done > 0" class="wms-hint wms-line-lock">
          🔒 {{ fmtQty(line.done) }} {{ store.skuUnit(line.sku) }} already put away – product, batch and expiry are locked; qty must stay ≥ {{ fmtQty(line.done) }}.
        </div>
      </template>
      <el-button :icon="Plus" size="small" @click="form.items.push(newLine())">Add line</el-button>

      <DocCollabSection :doc-key="collab.key.value" />

      <template #footer>
        <el-button @click="createOpen = false">Cancel</el-button>
        <el-button type="primary" @click="submitCreate">{{ editDoc ? 'Save changes' : 'Receive into transit' }}</el-button>
      </template>
    </el-dialog>

    <!-- Putaway -->
    <el-dialog v-model="putawayOpen" :title="putawayDoc ? `Putaway – ${putawayDoc.no}` : 'Putaway'" width="920px" top="5vh">
      <template v-if="putawayDoc">
        <div class="wms-info">
          {{ putawayDoc.supplier }}<template v-if="putawayDoc.poRef"> · PO {{ putawayDoc.poRef }}</template> · received {{ fmtDate(putawayDoc.date) }}
          · <span class="status-pill" :class="INBOUND_STATUS_COLOR[inboundStatus(putawayDoc)]">{{ inboundStatus(putawayDoc) }}</span>
        </div>
        <div v-for="(it, idx) in putawayDoc.items" :key="idx" class="wms-item-card">
          <div class="wms-item-head">
            <div>
              <div class="wms-strong">{{ it.sku }} – {{ store.skuName(it.sku) }}</div>
              <div class="wms-hint">
                Batch {{ it.batch }} · Exp {{ fmtDate(it.exp) }}
                <ExpiryTag :exp="it.exp" :has-expiry="it.exp !== '-'" show-days />
              </div>
            </div>
            <div class="wms-qty-chips">
              <span class="wms-chip">Total {{ fmtQty(it.qty) }} {{ store.skuUnit(it.sku) }}</span>
              <span class="wms-chip green">Done {{ fmtQty(itemPutawayDone(it)) }}</span>
              <span class="wms-chip amber">Remaining {{ fmtQty(itemPutawayRemaining(it)) }}</span>
            </div>
          </div>

          <template v-if="itemPutawayRemaining(it) > 0">
            <div class="wms-hint wms-rec">
              Target zone <b>{{ store.putawayCandidates(it).targetZone }}</b> ·
              Recommended bin:
              <b v-if="store.putawayCandidates(it).best">{{ store.putawayCandidates(it).best!.bin }} (free {{ fmtQty(store.putawayCandidates(it).best!.availCap) }})</b>
              <span v-else>none fits everything – split across bins</span>
            </div>
            <div v-for="(row, ri) in plans[idx] ?? []" :key="ri" class="wms-plan-row">
              <el-select v-model="row.bin" filterable placeholder="Bin" class="wms-plan-bin">
                <el-option
                  v-for="b in store.storageBins"
                  :key="b.bin"
                  :value="b.bin"
                  :label="binLabel(b.bin, store.putawayCandidates(it).targetZone)"
                  :disabled="store.isFrozen(b.bin)"
                />
              </el-select>
              <el-input-number v-model="row.qty" :min="0" :controls="false" class="wms-plan-qty" />
              <el-button :icon="Delete" text type="danger" @click="removePlanRow(idx, ri)" />
            </div>
            <div class="wms-plan-actions">
              <el-button size="small" @click="initPlan(idx)">Auto best-fit</el-button>
              <el-button size="small" :icon="Plus" @click="addPlanRow(idx)">Location</el-button>
              <span class="wms-hint">Planned {{ fmtQty(plannedTotal(idx)) }} / {{ fmtQty(itemPutawayRemaining(it)) }}</span>
              <span class="wms-spacer" />
              <span v-if="!validation(it, idx).ok" class="wms-error">{{ validation(it, idx).msg }}</span>
              <el-button type="primary" size="small" :disabled="!validation(it, idx).ok || !access.can('inbound-receiving', 'execute')" @click="executePutaway(idx)">Execute putaway</el-button>
            </div>
          </template>
          <div v-if="it.putaways.length" class="wms-done">
            <span class="wms-hint">Put away:</span>
            <span v-for="p in it.putaways" :key="p.bin" class="wms-chip" :title="`${fmtDateTime(p.at)} by ${p.by}`">{{ p.bin }} · {{ fmtQty(p.qty) }}</span>
          </div>
        </div>
      </template>
      <template #footer>
        <el-button @click="putawayOpen = false">Close</el-button>
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
.wms-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
.wms-actions .el-button + .el-button {
  margin-left: 0;
}

:deep(.wms-expand-col .cell) {
  display: none;
}
.wms-doc-toggle {
  cursor: pointer;
}
.wms-doc-toggle:hover .wms-doc-link {
  color: var(--el-color-primary);
  text-decoration: underline;
}

.wms-expand {
  padding: 6px 16px 10px 16px;
}
.wms-expand-collab {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-soft);
  max-width: 760px;
}
.wms-expand-collab .wms-strong {
  margin-bottom: 6px;
}
.wms-strong {
  font-weight: 600;
  color: var(--gray-900);
}
.wms-hint {
  font-size: 12px;
  color: var(--gray-500);
}
.wms-muted {
  color: var(--gray-400);
  font-size: 12px;
}
.wms-ml {
  margin-left: 6px;
}
.wms-exp {
  display: flex;
  align-items: center;
  gap: 6px;
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
  flex: 1 1 240px;
  min-width: 200px;
}
.wms-line-qty {
  width: 90px;
}
.wms-unit {
  width: 56px;
  font-size: 12px;
  color: var(--gray-500);
}
.wms-line-batch {
  width: 130px;
}
/* Element Plus gives date editors a fixed 220px width; keep the line on one row. */
.wms-line .wms-line-exp.el-date-editor {
  width: 150px;
}
.wms-line-tag {
  flex: 1 0 auto;
  min-width: 0;
}
.wms-line-lock {
  margin: -4px 0 8px 2px;
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
.wms-qty-chips {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
}
.wms-rec {
  margin-bottom: 8px;
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
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-soft);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
@media (max-width: 760px) {
  .wms-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
