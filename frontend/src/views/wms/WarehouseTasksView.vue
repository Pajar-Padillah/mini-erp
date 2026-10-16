<script setup lang="ts">
// Warehouse tasks (desktop): assign putaway / picking work to helpers and pickers, follow their
// progress and scan log, print task sheets and QR labels for bins and lots.
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Iphone, Plus, Printer, Tickets, View } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import TransactionFilterBar, { type TransactionFilterState } from '../../components/TransactionFilterBar.vue'
import { currentMonthRange, matchesTransactionDate, matchesTransactionValue } from '../../utils/transactionFilters'
import ExpiryTag from './ExpiryTag.vue'
import { fmtDate, fmtDateTime, fmtQty, INBOUND_STATUS_COLOR, OUTBOUND_STATUS_COLOR } from './wmsUi'
import { printQrLabels, printTaskSheet, type QrLabel } from './taskPrint'
import { TRANSIT_ZONE, inboundStatus, outboundStatus, todayISO, useWmsStore, type Result } from '../../stores/wmsStore'
import {
  TASK_LINE_STATUSES, TASK_STATUSES, TASK_TYPES, binLabelCode, lineBin, lineHasIssue, lotLabelCode, taskActive, taskDuration,
  taskProgress, taskStatus, taskStatusColor, taskStatusLabel, taskTypeColor, taskTypeLabel, useWmsTaskStore,
  type TaskLine, type TaskLinePlan, type TaskType, type WarehouseTask,
} from '../../stores/wmsTaskStore'
import { useAccessStore } from '../../stores/accessStore'
import { docKey } from '../../stores/docCollabStore'
import DocAttachments from '../../components/doc-collab/DocAttachments.vue'
import DocComments from '../../components/doc-collab/DocComments.vue'
import DocCollabSection from './DocCollabSection.vue'
import { useDocCollabKey } from './useDocCollabKey'

const wms = useWmsStore()
const store = useWmsTaskStore()
const access = useAccessStore()
const router = useRouter()

function report(r: Result<unknown>) {
  if (r.ok) ElMessage.success(r.msg)
  else ElMessage.warning(r.msg)
  return r.ok
}

// ---------------------------------------------------------------- KPIs
const kpis = computed(() => {
  const all = store.tasks
  const today = todayISO()
  return [
    { label: 'Open (not started)', value: all.filter((t) => taskStatus(t) === 'NEW').length, hint: 'Waiting for the helper / picker' },
    { label: 'In progress', value: all.filter((t) => taskStatus(t) === 'IN PROGRESS').length, hint: 'Being scanned right now' },
    { label: 'Done today', value: all.filter((t) => !t.cancelled && t.finishedAt?.slice(0, 10) === today).length, hint: 'Finished (fully or partly)' },
    { label: 'With problems', value: all.filter((t) => !t.cancelled && t.lines.some(lineHasIssue)).length, hint: 'Short or problem lines' },
  ]
})

// ---------------------------------------------------------------- list & filters
const fields = [
  { label: 'Task no.', value: 'no' },
  { label: 'Document', value: 'refNo' },
  { label: 'Supplier / customer', value: 'party' },
  { label: 'Assigned to', value: 'assignee' },
  { label: 'SKU', value: 'sku' },
  { label: 'Bin', value: 'bin' },
  { label: 'Created by', value: 'createdBy' },
]
const statuses = TASK_STATUSES.map((s) => ({ label: s.label, value: s.value, color: s.color }))
const types = TASK_TYPES.map((t) => ({ label: t.label, value: t.value, color: t.color }))

function defaultFilters(): TransactionFilterState {
  return { dateRange: currentMonthRange(), status: [], secondaryStatus: [], conditions: [] }
}
const filters = ref<TransactionFilterState>(defaultFilters())
const page = ref(1)
const pageSize = 10
watch(filters, () => { page.value = 1 }, { deep: true })

function fieldValue(t: WarehouseTask, field: string): string {
  switch (field) {
    case 'sku': return t.lines.map((l) => `${l.sku} ${wms.skuName(l.sku)}`).join(' ')
    case 'bin': return t.lines.map((l) => `${l.fromBin} ${l.toBin}`).join(' ')
    case 'no': return t.no
    case 'refNo': return t.refNo
    case 'party': return t.party
    case 'assignee': return t.assignee
    case 'createdBy': return t.createdBy
    default: return ''
  }
}
const filtered = computed(() => {
  const { dateRange, status, secondaryStatus, conditions } = filters.value
  return [...store.tasks]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((t) => {
      if (!matchesTransactionDate(t.createdAt, dateRange)) return false
      if (status.length && !status.includes(taskStatus(t))) return false
      if (secondaryStatus.length && !secondaryStatus.includes(t.type)) return false
      return conditions.every((c) => matchesTransactionValue(fieldValue(t, c.field), c))
    })
})
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

async function cancelTask(t: WarehouseTask) {
  try {
    const { value } = await ElMessageBox.prompt(`Cancel task ${t.no}? Lines already confirmed stay recorded (and confirmed picks are executed).`, 'Cancel task', {
      confirmButtonText: 'Cancel task', cancelButtonText: 'Keep', inputPlaceholder: 'Reason (optional)', type: 'warning',
    })
    report(store.cancelTask(t.no, value ?? ''))
  } catch {
    // dismissed
  }
}
async function deleteTask(t: WarehouseTask) {
  try {
    await ElMessageBox.confirm(`Delete task ${t.no} from the list? Stock movements it made stay in the ledger.`, 'Delete task', { type: 'warning', confirmButtonText: 'Delete' })
    if (report(store.deleteTask(t.no)) && detailNo.value === t.no) detailOpen.value = false
  } catch {
    // dismissed
  }
}
async function printTask(t: WarehouseTask) {
  if (!(await printTaskSheet(t, wms.skuName, wms.skuUnit))) ElMessage.warning('Allow pop-ups to print the task sheet.')
}
function openMobile(t?: WarehouseTask) {
  router.push(t ? { path: '/inventory/task-scan', query: { task: t.no } } : '/inventory/task-scan')
}

// ---------------------------------------------------------------- new task
const createOpen = ref(false)
const form = reactive({ type: 'PUTAWAY' as TaskType, refId: null as number | null, assignee: '', note: '' })

const sourceOptions = computed(() => {
  if (form.type === 'PUTAWAY') {
    return store.putawaySources.map((d) => ({ id: d.id, no: d.no, party: d.supplier, status: inboundStatus(d) as string, color: INBOUND_STATUS_COLOR[inboundStatus(d)], busy: store.activeTaskFor('PUTAWAY', d.id) }))
  }
  return store.pickSources.map((d) => ({ id: d.id, no: d.no, party: d.customer, status: outboundStatus(d) as string, color: OUTBOUND_STATUS_COLOR[outboundStatus(d)], busy: store.activeTaskFor('PICK', d.id) }))
})
const preview = computed<{ lines: TaskLinePlan[]; warnings: string[]; error: string }>(() => {
  if (form.refId === null) return { lines: [], warnings: [], error: '' }
  const r = store.previewLines(form.type, form.refId)
  return r.ok && r.data ? { ...r.data, error: '' } : { lines: [], warnings: [], error: r.msg }
})
const previewTotal = computed(() => preview.value.lines.reduce((a, l) => a + l.qty, 0))
const busyTask = computed(() => (form.refId === null ? null : store.activeTaskFor(form.type, form.refId)))
watch(() => form.type, () => { form.refId = null })

const collab = useDocCollabKey('wms-task')

function openCreate() {
  form.type = 'PUTAWAY'
  form.refId = null
  form.assignee = ''
  form.note = ''
  collab.startCreate()
  createOpen.value = true
}
function submitCreate() {
  if (form.refId === null) return ElMessage.warning('Choose the source document.')
  const r = store.createTask({ type: form.type, refId: form.refId, assignee: form.assignee, note: form.note })
  if (!report(r)) return
  if (r.data) collab.commit(r.data.no)
  createOpen.value = false
}

// ---------------------------------------------------------------- detail
const detailOpen = ref(false)
const detailNo = ref('')
const detail = computed(() => store.taskByNo(detailNo.value) ?? null)
function openDetail(t: WarehouseTask) {
  detailNo.value = t.no
  detailOpen.value = true
}
const lineRowClass = ({ row }: { row: TaskLine }) => (row.status === 'PROBLEM' ? 'tk-row-problem' : row.status === 'SHORT' ? 'tk-row-short' : '')
const detailScans = computed(() => {
  const t = detail.value
  if (!t) return []
  return t.lines.flatMap((l, i) => l.scans.map((s) => ({ ...s, line: i + 1, sku: l.sku }))).sort((a, b) => b.ts.localeCompare(a.ts))
})

// ---------------------------------------------------------------- QR labels
const labelsOpen = ref(false)
const labelTab = ref<'bins' | 'lots'>('bins')
const labelZone = ref('')
const binSel = ref<string[]>([])
const lotSel = ref<string[]>([])
const labelZones = computed(() => wms.zones.filter((z) => z.id !== TRANSIT_ZONE))
const labelBins = computed(() => wms.bins.filter((b) => !labelZone.value || b.zone === labelZone.value))
const labelLots = computed(() => {
  const m = new Map<string, { key: string; sku: string; batch: string; exp: string; bins: string[]; qty: number }>()
  wms.stockLots((l) => !labelZone.value || l.zone === labelZone.value).forEach((l) => {
    const key = lotLabelCode(l.sku, l.batch, l.exp)
    const cur = m.get(key) ?? { key, sku: l.sku, batch: l.batch, exp: l.exp, bins: [], qty: 0 }
    cur.bins.push(l.bin)
    cur.qty += l.qty
    m.set(key, cur)
  })
  return [...m.values()].sort((a, b) => a.sku.localeCompare(b.sku) || a.batch.localeCompare(b.batch))
})
function openLabels() {
  binSel.value = []
  lotSel.value = []
  labelZone.value = ''
  labelsOpen.value = true
}
function selectAll(kind: 'bins' | 'lots') {
  if (kind === 'bins') binSel.value = labelBins.value.map((b) => b.bin)
  else lotSel.value = labelLots.value.map((l) => l.key)
}
const labelCount = computed(() => binSel.value.length + lotSel.value.length)
async function printLabels() {
  const labels: QrLabel[] = [
    ...binSel.value.map((code) => ({ code: binLabelCode(code), title: code, sub: wms.bin(code)?.zone ?? '' })),
    ...lotSel.value.map((key) => {
      const l = labelLots.value.find((x) => x.key === key)
      return l
        ? { code: key, title: l.sku, sub: `${wms.skuName(l.sku)} · ${l.batch}${l.exp !== '-' ? ` · ED ${fmtDate(l.exp)}` : ''}` }
        : { code: key, title: key, sub: '' }
    }),
  ]
  if (!labels.length) return ElMessage.warning('Select at least one bin or lot.')
  if (!(await printQrLabels(labels, 'QR labels'))) ElMessage.warning('Allow pop-ups to print the labels.')
}
</script>

<template>
  <div class="page">
    <PageHeader title="Warehouse Tasks" subtitle="Assign putaway and picking work to helpers / pickers. They execute it on the phone: scan bin → scan item → confirm qty.">
      <template #actions>
        <el-button :icon="Iphone" @click="openMobile()">Open Mobile Scan</el-button>
        <el-button :icon="Tickets" @click="openLabels">Print QR labels</el-button>
        <el-button v-if="access.can('warehouse-tasks', 'create')" type="primary" :icon="Plus" @click="openCreate">New task</el-button>
      </template>
    </PageHeader>

    <div class="static-stats">
      <div v-for="k in kpis" :key="k.label" class="card static-stat">
        <div class="static-stat-label">{{ k.label }}</div>
        <div class="static-stat-value">{{ k.value }}</div>
        <div class="static-stat-hint">{{ k.hint }}</div>
      </div>
    </div>

    <div class="card">
      <TransactionFilterBar
        v-model="filters"
        :fields="fields"
        :statuses="statuses"
        :secondary-statuses="types"
        secondary-status-label="Type"
        @reset="filters = defaultFilters()"
        @refresh="() => {}"
      />

      <el-table :data="paged" row-key="no" empty-text="No tasks yet – create one with “New task”.">
        <el-table-column label="Task no." min-width="150">
          <template #default="{ row }">
            <el-link type="primary" :underline="false" class="tk-strong" @click="openDetail(row)">{{ row.no }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="Type" width="105">
          <template #default="{ row }"><span class="status-pill" :class="taskTypeColor(row.type)">{{ taskTypeLabel(row.type) }}</span></template>
        </el-table-column>
        <el-table-column label="Document" min-width="180">
          <template #default="{ row }">
            <div class="tk-strong">{{ row.refNo }}</div>
            <div class="tk-hint">{{ row.party }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Assigned to" prop="assignee" min-width="130" />
        <el-table-column label="Lines" width="90" align="center">
          <template #default="{ row }">
            {{ taskProgress(row).closedLines }}/{{ taskProgress(row).totalLines }}
            <div v-if="taskProgress(row).issues" class="tk-hint tk-warn">{{ taskProgress(row).issues }} issue(s)</div>
          </template>
        </el-table-column>
        <el-table-column label="Progress" width="140">
          <template #default="{ row }">
            <el-progress :percentage="taskProgress(row).pct" :show-text="false" :stroke-width="6" :status="taskProgress(row).pct === 100 ? 'success' : undefined" />
            <div class="tk-hint">{{ fmtQty(taskProgress(row).doneQty) }}/{{ fmtQty(taskProgress(row).totalQty) }} units</div>
          </template>
        </el-table-column>
        <el-table-column label="Created" width="160">
          <template #default="{ row }">
            <div>{{ fmtDateTime(row.createdAt) }}</div>
            <div class="tk-hint">{{ row.createdBy }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Duration" width="105">
          <template #default="{ row }">{{ taskDuration(row) }}</template>
        </el-table-column>
        <el-table-column label="Status" width="140">
          <template #default="{ row }">
            <span class="status-pill" :class="taskStatusColor(taskStatus(row))">{{ taskStatusLabel(taskStatus(row)) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="" width="180" align="right" fixed="right">
          <template #default="{ row }">
            <div class="tk-actions">
              <el-button size="small" :icon="View" title="Detail & scan log" @click="openDetail(row)" />
              <el-button v-if="taskActive(row)" size="small" :icon="Iphone" title="Open in mobile scan" @click="openMobile(row)" />
              <el-button size="small" :icon="Printer" title="Print task sheet" @click="printTask(row)" />
              <template v-if="access.can('warehouse-tasks', 'delete')">
              <el-button v-if="taskActive(row)" size="small" type="danger" plain @click="cancelTask(row)">Cancel</el-button>
              <el-button v-else size="small" :icon="Delete" type="danger" plain title="Delete" @click="deleteTask(row)" />
              </template>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar v-model:page="page" :page-size="pageSize" :total="filtered.length" />
    </div>

    <!-- New task -->
    <el-dialog v-model="createOpen" title="New warehouse task" width="860px" top="5vh" @closed="collab.closed">
      <el-form label-position="top" class="tk-form-grid">
        <el-form-item label="Task type" required>
          <el-radio-group v-model="form.type">
            <el-radio-button v-for="t in TASK_TYPES" :key="t.value" :value="t.value">{{ t.label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="form.type === 'PUTAWAY' ? 'Inbound document (goods in transit)' : 'Outbound DO (not dispatched)'" required>
          <el-select v-model="form.refId" filterable placeholder="Choose document" style="width: 100%" no-data-text="No open documents">
            <el-option v-for="d in sourceOptions" :key="d.id" :label="`${d.no} – ${d.party}`" :value="d.id">
              <div class="tk-opt">
                <span>{{ d.no }} <span class="tk-muted">{{ d.party }}</span></span>
                <span v-if="d.busy" class="tk-muted">task {{ d.busy.no }}</span>
                <span v-else class="status-pill" :class="d.color">{{ d.status }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="Assign to" required>
          <el-select v-model="form.assignee" filterable placeholder="Helper / picker" style="width: 100%">
            <el-option v-for="w in store.workers" :key="w" :label="w" :value="w" />
          </el-select>
        </el-form-item>
        <el-form-item label="Note for the worker">
          <el-input v-model="form.note" placeholder="Optional, e.g. use the forklift" />
        </el-form-item>
      </el-form>

      <div v-if="busyTask" class="tk-banner red">Task {{ busyTask.no }} ({{ busyTask.assignee }}) is still active for this document – finish or cancel it first.</div>
      <div v-else-if="preview.error" class="tk-banner red">{{ preview.error }}</div>
      <template v-else-if="form.refId !== null">
        <div class="tk-section-head">
          <span>Planned lines</span>
          <span class="tk-hint">{{ preview.lines.length }} line(s) · {{ new Set(preview.lines.map((l) => l.sku)).size }} SKU · {{ fmtQty(previewTotal) }} units</span>
        </div>
        <el-table :data="preview.lines" size="small" max-height="300" empty-text="Nothing to do for this document">
          <el-table-column type="index" label="#" width="44" />
          <el-table-column label="Item" min-width="200">
            <template #default="{ row }">
              <div class="tk-strong">{{ row.sku }}</div>
              <div class="tk-hint">{{ wms.skuName(row.sku) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="Batch" prop="batch" width="125" />
          <el-table-column label="Expiry" width="140">
            <template #default="{ row }"><ExpiryTag :exp="row.exp" :has-expiry="row.exp !== '-'" /></template>
          </el-table-column>
          <el-table-column label="From" prop="fromBin" width="105" />
          <el-table-column label="To" width="105">
            <template #default="{ row }"><span class="tk-strong">{{ row.toBin }}</span></template>
          </el-table-column>
          <el-table-column label="Qty" width="100" align="right">
            <template #default="{ row }">{{ fmtQty(row.qty) }} {{ wms.skuUnit(row.sku) }}</template>
          </el-table-column>
        </el-table>
        <div v-if="preview.warnings.length" class="tk-banner amber tk-mt">{{ preview.warnings.join(' · ') }}</div>
        <div class="tk-hint tk-mt">
          {{ form.type === 'PUTAWAY'
            ? 'Bins are suggested best-fit in the category zone. The helper scans the destination bin and the lot label for every line.'
            : 'Pending lines are allocated FEFO when the task is created. The picker scans the source bin and the lot label for every line.' }}
        </div>
      </template>

      <DocCollabSection :doc-key="collab.key.value" />

      <template #footer>
        <el-button @click="createOpen = false">Cancel</el-button>
        <el-button type="primary" :disabled="!preview.lines.length || !!busyTask || !form.assignee" @click="submitCreate">Create task</el-button>
      </template>
    </el-dialog>

    <!-- Detail -->
    <el-dialog v-model="detailOpen" :title="detail ? `Task ${detail.no}` : 'Task'" width="980px" top="5vh">
      <template v-if="detail">
        <div class="tk-detail-head">
          <span class="status-pill" :class="taskTypeColor(detail.type)">{{ taskTypeLabel(detail.type) }}</span>
          <span class="status-pill" :class="taskStatusColor(taskStatus(detail))">{{ taskStatusLabel(taskStatus(detail)) }}</span>
          <span class="tk-hint">{{ taskProgress(detail).pct }}% · {{ fmtQty(taskProgress(detail).doneQty) }}/{{ fmtQty(taskProgress(detail).totalQty) }} units</span>
        </div>
        <div class="tk-meta">
          <div><div class="tk-meta-label">Document</div><div class="tk-strong">{{ detail.refNo }}</div><div class="tk-hint">{{ detail.party }}</div></div>
          <div><div class="tk-meta-label">Assigned to</div><div class="tk-strong">{{ detail.assignee }}</div></div>
          <div><div class="tk-meta-label">Created</div><div>{{ fmtDateTime(detail.createdAt) }}</div><div class="tk-hint">{{ detail.createdBy }}</div></div>
          <div><div class="tk-meta-label">Start → finish</div><div>{{ fmtDateTime(detail.startedAt) }} → {{ fmtDateTime(detail.finishedAt) }}</div><div class="tk-hint">{{ taskDuration(detail) }}</div></div>
        </div>
        <div v-if="detail.note" class="tk-banner amber">Note: {{ detail.note }}</div>

        <el-tabs>
          <el-tab-pane label="Lines">
            <el-table :data="detail.lines" size="small" :row-class-name="lineRowClass">
              <el-table-column type="index" label="#" width="44" />
              <el-table-column label="Item" min-width="190">
                <template #default="{ row }">
                  <div class="tk-strong">{{ row.sku }}</div>
                  <div class="tk-hint">{{ wms.skuName(row.sku) }}</div>
                </template>
              </el-table-column>
              <el-table-column label="Batch / expiry" width="150">
                <template #default="{ row }">
                  <div>{{ row.batch }}</div>
                  <div class="tk-hint">{{ fmtDate(row.exp) }}</div>
                </template>
              </el-table-column>
              <el-table-column label="Bin" width="150">
                <template #default="{ row }">
                  <span class="tk-hint">{{ row.fromBin }} →</span> <span class="tk-strong">{{ row.toBin }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Done / plan" width="110" align="right">
                <template #default="{ row }">{{ fmtQty(row.done) }} / {{ fmtQty(row.qty) }}</template>
              </el-table-column>
              <el-table-column label="Status" min-width="150">
                <template #default="{ row }">
                  <span class="status-pill" :class="TASK_LINE_STATUSES[row.status as keyof typeof TASK_LINE_STATUSES].color">{{ TASK_LINE_STATUSES[row.status as keyof typeof TASK_LINE_STATUSES].label }}</span>
                  <div v-if="row.problem" class="tk-hint tk-error">{{ row.problem }}</div>
                </template>
              </el-table-column>
              <el-table-column label="Scans" width="80" align="center">
                <template #default="{ row }">
                  {{ row.scans.filter((s: { ok: boolean }) => s.ok).length }}
                  <span v-if="row.scans.some((s: { ok: boolean }) => !s.ok)" class="tk-error">/ {{ row.scans.filter((s: { ok: boolean }) => !s.ok).length }}✗</span>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane :label="`Scan log (${detailScans.length})`">
            <el-table :data="detailScans" size="small" max-height="360" empty-text="No scans yet">
              <el-table-column label="Time" width="160">
                <template #default="{ row }">{{ fmtDateTime(row.ts) }}</template>
              </el-table-column>
              <el-table-column label="By" prop="by" width="130" />
              <el-table-column label="Line" width="120">
                <template #default="{ row }">{{ row.line }}. {{ row.sku }}</template>
              </el-table-column>
              <el-table-column label="Step" prop="step" width="70" />
              <el-table-column label="Code" min-width="170">
                <template #default="{ row }"><code>{{ row.code }}</code></template>
              </el-table-column>
              <el-table-column label="Result" min-width="220">
                <template #default="{ row }">
                  <span :class="row.ok ? 'tk-ok' : 'tk-error'">{{ row.ok ? '✓' : '✗' }} {{ row.msg }}</span>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="Timeline">
            <el-timeline class="tk-timeline">
              <el-timeline-item v-for="(l, i) in [...detail.logs].reverse()" :key="i" :timestamp="`${fmtDateTime(l.ts)} · ${l.by}`" placement="top">
                <div class="tk-strong">{{ l.action }}</div>
                <div v-if="l.note" class="tk-hint">{{ l.note }}</div>
              </el-timeline-item>
            </el-timeline>
          </el-tab-pane>
          <el-tab-pane label="Attachments">
            <DocAttachments :doc-key="docKey('wms-task', detail.no)" />
          </el-tab-pane>
          <el-tab-pane label="Comments">
            <DocComments :doc-key="docKey('wms-task', detail.no)" />
          </el-tab-pane>
        </el-tabs>
      </template>
      <template #footer>
        <div v-if="detail" class="tk-footer">
          <span class="tk-hint">Worker scans bin {{ detail.type === 'PUTAWAY' ? '(destination)' : '(source)' }}:
            {{ [...new Set(detail.lines.map((l) => lineBin(detail!, l)))].join(', ') }}</span>
          <div>
            <el-button v-if="taskActive(detail) && access.can('warehouse-tasks', 'delete')" type="danger" plain @click="cancelTask(detail)">Cancel task</el-button>
            <el-button :icon="Printer" @click="printTask(detail)">Print</el-button>
            <el-button v-if="taskActive(detail)" type="primary" :icon="Iphone" @click="openMobile(detail)">Open Mobile Scan</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- QR labels -->
    <el-dialog v-model="labelsOpen" title="Print QR labels" width="820px" top="6vh">
      <div class="tk-label-bar">
        <el-select v-model="labelZone" clearable placeholder="All zones" style="width: 220px">
          <el-option v-for="z in labelZones" :key="z.id" :label="z.id" :value="z.id" />
          <el-option :label="TRANSIT_ZONE" :value="TRANSIT_ZONE" />
        </el-select>
        <span class="tk-hint">Bin labels encode <code>BIN:&lt;bin&gt;</code>, lot labels <code>LOT:&lt;sku&gt;|&lt;batch&gt;|&lt;expiry&gt;</code>.</span>
      </div>
      <el-tabs v-model="labelTab">
        <el-tab-pane :label="`Bins (${binSel.length})`" name="bins">
          <div class="tk-label-actions">
            <el-button size="small" @click="selectAll('bins')">Select all</el-button>
            <el-button size="small" @click="binSel = []">Clear</el-button>
          </div>
          <el-checkbox-group v-model="binSel" class="tk-check-grid">
            <el-checkbox v-for="b in labelBins" :key="b.bin" :value="b.bin" border>
              <span class="tk-strong">{{ b.bin }}</span> <span class="tk-muted">{{ b.zone }}</span>
            </el-checkbox>
          </el-checkbox-group>
        </el-tab-pane>
        <el-tab-pane :label="`SKU / lots (${lotSel.length})`" name="lots">
          <div class="tk-label-actions">
            <el-button size="small" @click="selectAll('lots')">Select all</el-button>
            <el-button size="small" @click="lotSel = []">Clear</el-button>
          </div>
          <el-checkbox-group v-model="lotSel" class="tk-lot-list">
            <el-checkbox v-for="l in labelLots" :key="l.key" :value="l.key" border class="tk-lot">
              <span class="tk-strong">{{ l.sku }}</span>
              <span class="tk-muted">{{ l.batch }} · {{ fmtDate(l.exp) }} · {{ fmtQty(l.qty) }} in {{ l.bins.join(', ') }}</span>
            </el-checkbox>
          </el-checkbox-group>
          <div v-if="!labelLots.length" class="tk-hint">No stock in this zone.</div>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="labelsOpen = false">Close</el-button>
        <el-button type="primary" :icon="Printer" :disabled="!labelCount" @click="printLabels">Print {{ labelCount }} label(s)</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tk-strong {
  font-weight: 600;
  color: var(--gray-900);
}
.tk-hint {
  font-size: 12px;
  color: var(--gray-500);
}
.tk-muted {
  font-size: 12px;
  color: var(--gray-400);
}
.tk-warn {
  color: #b45309;
}
.tk-error {
  color: #b91c1c;
}
.tk-ok {
  color: #15803d;
}
.tk-mt {
  margin-top: 10px;
}
.tk-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 4px;
}
.tk-actions .el-button + .el-button {
  margin-left: 0;
}
.tk-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}
.tk-opt {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.tk-section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-weight: 600;
  color: var(--gray-900);
  margin: 4px 0 8px;
}
.tk-banner {
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 13px;
  margin-bottom: 12px;
}
.tk-banner.red {
  background: var(--danger-light);
  color: #b91c1c;
}
.tk-banner.amber {
  background: var(--warning-light);
  color: #8a6100;
}
.tk-detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.tk-meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}
.tk-meta > div {
  background: var(--gray-50);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-size: 13px;
}
.tk-meta-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--gray-500);
  margin-bottom: 2px;
}
.tk-timeline {
  max-height: 380px;
  overflow-y: auto;
  padding: 4px 4px 0;
}
.tk-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  text-align: left;
}
.tk-footer > div {
  display: flex;
  flex-shrink: 0;
}
:deep(.tk-row-problem) {
  --el-table-tr-bg-color: var(--danger-light);
}
:deep(.tk-row-short) {
  --el-table-tr-bg-color: var(--warning-light);
}
.tk-label-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.tk-label-actions {
  margin-bottom: 10px;
}
.tk-check-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}
.tk-check-grid .el-checkbox,
.tk-lot-list .el-checkbox {
  margin-right: 0;
}
.tk-lot-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 360px;
  overflow-y: auto;
}
.tk-lot :deep(.el-checkbox__label) {
  display: flex;
  gap: 8px;
  align-items: baseline;
}
@media (max-width: 760px) {
  .tk-form-grid,
  .tk-meta {
    grid-template-columns: 1fr;
  }
  .tk-footer {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
