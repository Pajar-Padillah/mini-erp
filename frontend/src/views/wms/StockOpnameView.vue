<script setup lang="ts">
// Stock Opname (cycle count): bins in scope are frozen until every counted line matches the system.
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import TransactionFilterBar from '../../components/TransactionFilterBar.vue'
import { useListFilter } from './useListFilter'
import { fmtDate, fmtDateTime, fmtQty } from './wmsUi'
import { TRANSIT_ZONE, ccProgress, todayISO, useWmsStore, type CycleCount, type CycleCountLine, type DocLog } from '../../stores/wmsStore'
import { useAccessStore } from '../../stores/accessStore'
import { docKey } from '../../stores/docCollabStore'
import DocCollabSection from './DocCollabSection.vue'
import { useDocCollabKey } from './useDocCollabKey'

const store = useWmsStore()
const access = useAccessStore()

const STATUS_COLOR: Record<CycleCount['status'], string> = { 'IN PROGRESS': 'amber', DONE: 'green' }

// ---------------------------------------------------------------- list
const page = ref(1)
const pageSize = 10

const rackLabel = (r: string) => r.replace('|', ' · ')
function scopeLabel(cc: CycleCount): string {
  const parts: string[] = []
  if (cc.zones.length) parts.push(`Zones: ${cc.zones.join(', ')}`)
  if (cc.racks.length) parts.push(`Racks: ${cc.racks.map(rackLabel).join(', ')}`)
  if (cc.bins.length) parts.push(`Bins: ${cc.bins.join(', ')}`)
  return parts.length ? parts.join(' / ') : 'All storage bins'
}
const binCount = (cc: CycleCount) => new Set(cc.lines.map((l) => l.bin)).size

const sortedCounts = computed(() => [...store.cycleCounts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
const { filters, fieldOptions, filtered, reset, refresh, refreshing } = useListFilter(() => sortedCounts.value, {
  date: (cc) => cc.date,
  status: (cc) => cc.status,
  fields: [
    { label: 'Code', value: 'code', get: (cc) => cc.code },
    { label: 'Bin', value: 'bin', get: (cc) => cc.lines.map((l) => l.bin).join(' ') },
    { label: 'SKU', value: 'sku', get: (cc) => cc.lines.map((l) => l.sku ?? '').join(' ') },
    { label: 'Scope', value: 'scope', get: (cc) => scopeLabel(cc) },
    { label: 'Created by', value: 'createdBy', get: (cc) => cc.createdBy },
  ],
}, page)
const statusOptions = [
  { label: 'In progress', value: 'IN PROGRESS', color: 'amber' },
  { label: 'Done', value: 'DONE', color: 'green' },
]
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

// ---------------------------------------------------------------- log dialog
const logOpen = ref(false)
const logTitle = ref('')
const logRows = ref<DocLog[]>([])
function showLog(cc: CycleCount) {
  logTitle.value = `Log – ${cc.code}`
  logRows.value = [...cc.logs].reverse()
  logOpen.value = true
}

// ---------------------------------------------------------------- start dialog
const startOpen = ref(false)
const form = reactive({ date: todayISO(), zones: [] as string[], racks: [] as string[], bins: [] as string[] })

const storageZones = computed(() => store.zones.filter((z) => z.id !== TRANSIT_ZONE))
const rackOptions = computed(() => {
  const set = new Set<string>()
  store.storageBins
    .filter((b) => !form.zones.length || form.zones.includes(b.zone))
    .forEach((b) => set.add(`${b.zone}|${b.rack}`))
  return [...set].sort()
})
const binOptions = computed(() =>
  store.storageBins
    .filter((b) => (!form.zones.length || form.zones.includes(b.zone)) && (!form.racks.length || form.racks.includes(`${b.zone}|${b.rack}`)))
    .map((b) => ({ bin: b.bin, zone: b.zone, frozen: store.isFrozen(b.bin), frozenBy: store.frozenBy(b.bin) }))
    .sort((a, b) => a.bin.localeCompare(b.bin)))

// Drop selections that fall out of the narrowed option lists.
watch(rackOptions, (opts) => { form.racks = form.racks.filter((r) => opts.includes(r)) })
watch(binOptions, (opts) => { form.bins = form.bins.filter((b) => opts.some((o) => o.bin === b)) })

const preview = computed(() => {
  const all = store.cycleCountScope(form)
  const free = all.filter((b) => !store.isFrozen(b.bin))
  const lines = free.reduce((a, b) => a + Math.max(1, b.lots.filter((l) => l.qty > 0).length), 0)
  const rows = all.map((b) => ({ bin: b.bin, zone: b.zone, frozenBy: store.frozenBy(b.bin), last: store.lastCycleCount(b.bin) }))
  const never = rows.filter((r) => !r.last).length
  return { total: all.length, bins: free.length, frozen: all.length - free.length, lines, rows, never }
})

const collab = useDocCollabKey('wms-cycle-count')

function openStart() {
  form.date = todayISO()
  form.zones = []
  form.racks = []
  form.bins = []
  collab.startCreate()
  startOpen.value = true
}
function submitStart() {
  const r = store.startCycleCount({ date: form.date, zones: [...form.zones], racks: [...form.racks], bins: [...form.bins] })
  if (r.ok) {
    if (r.data) collab.commit(r.data.code)
    ElMessage.success(r.msg)
    startOpen.value = false
    if (r.data) openSession(r.data)
  } else {
    ElMessage.warning(r.msg)
  }
}

// ---------------------------------------------------------------- session detail
const sessionId = ref<number | null>(null)
const sessionOpen = ref(false)
const session = computed(() => store.cycleCounts.find((c) => c.id === sessionId.value) ?? null)
const sessionProg = computed(() => (session.value ? ccProgress(session.value) : null))
const readOnly = computed(() => session.value?.status === 'DONE' || !access.can('stock-opname', 'edit'))
function openSession(cc: CycleCount) {
  sessionId.value = cc.id
  sessionOpen.value = true
}

const diffOf = (l: CycleCountLine) => (l.countQty === null ? null : l.countQty - l.sysQty)
function lastCountedText(binCode: string, excludeId: number) {
  const last = store.lastCycleCount(binCode, excludeId)
  return last ? `last counted ${fmtDate(last.date)} (${last.code})` : 'never counted before'
}

function onCount(i: number, v: number | null | undefined) {
  if (!session.value) return
  const r = store.setCount(session.value.id, i, v === undefined || v === null ? null : v)
  if (!r.ok) ElMessage.warning(r.msg)
  else if (r.msg) ElMessage.success(r.msg)
}
function approve(i: number) {
  if (!session.value) return
  const r = store.approveCountAdjustment(session.value.id, i)
  if (r.ok) ElMessage.success(r.msg)
  else ElMessage.warning(r.msg)
}

// ---------------------------------------------------------------- print count sheet
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c))
function printSheet(cc: CycleCount) {
  const rows = cc.lines.map((l) => {
    const last = store.lastCycleCount(l.bin, cc.id)
    const diff = diffOf(l)
    return `<tr>
      <td><b>${esc(l.bin)}</b><div class="sub">${esc(l.zone)}</div></td>
      <td>${last ? `${esc(fmtDate(last.date))}<div class="sub">${esc(last.code)}</div>` : '-'}</td>
      <td>${esc(l.sku ?? '-')}</td>
      <td>${l.sku ? esc(store.skuName(l.sku)) : '<i>(empty bin – verify)</i>'}</td>
      <td>${esc(l.batch)}</td>
      <td>${esc(fmtDate(l.exp))}</td>
      <td class="num">${esc(fmtQty(l.sysQty))}</td>
      <td class="num">${l.countQty === null ? '' : esc(fmtQty(l.countQty))}</td>
      <td class="num">${diff === null ? '' : esc(diff > 0 ? `+${diff}` : String(diff))}</td>
    </tr>`
  }).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Count sheet ${esc(cc.code)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #12324e; margin: 24px; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #6d879c; margin-bottom: 16px; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #b7c7d4; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #eaf0f5; font-size: 11px; text-transform: uppercase; }
  td.num, th.num { text-align: right; }
  td.num:nth-last-child(2) { min-width: 70px; }
  .sub { color: #6d879c; font-size: 10px; }
  .sign { display: flex; gap: 24px; margin-top: 40px; }
  .sign div { flex: 1; border: 1px solid #b7c7d4; height: 90px; padding: 8px; display: flex; flex-direction: column; justify-content: space-between; }
  .sign span { border-top: 1px solid #b7c7d4; padding-top: 4px; color: #6d879c; }
  @media print { body { margin: 10mm; } button { display: none; } }
</style></head><body>
<h1>Stock Opname – Count Sheet ${esc(cc.code)}</h1>
<div class="meta">Date: ${esc(fmtDate(cc.date))} · Scope: ${esc(scopeLabel(cc))} · ${binCount(cc)} bin(s), ${cc.lines.length} line(s) · Status: ${esc(cc.status)}<br>
Created by ${esc(cc.createdBy)} on ${esc(fmtDateTime(cc.createdAt))} · Printed ${esc(fmtDateTime(new Date().toISOString()))}</div>
<table><thead><tr>
  <th>Bin</th><th>Last counted</th><th>SKU</th><th>Name</th><th>Batch</th><th>Expiry</th><th class="num">System qty</th><th class="num">Counted qty</th><th class="num">Difference</th>
</tr></thead><tbody>${rows}</tbody></table>
<div class="sign">
  <div><b>Counted by</b><span>Name / signature / date</span></div>
  <div><b>Checked by</b><span>Name / signature / date</span></div>
  <div><b>Approved by</b><span>Name / signature / date</span></div>
</div>
<script>window.onload = function () { window.print() }<\/script>
</body></html>`
  const w = window.open('', '_blank')
  if (!w) {
    ElMessage.warning('Allow pop-ups to print the count sheet.')
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
}
</script>

<template>
  <div class="page">
    <PageHeader title="Stock Opname (Cycle Count)" subtitle="Count bins physically; bins in a running count are frozen until every line matches.">
      <template #actions>
        <el-button v-if="access.can('stock-opname', 'create')" type="primary" @click="openStart">Start cycle count</el-button>
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

      <el-table :data="paged" empty-text="No cycle counts yet">
        <el-table-column label="Code" min-width="170">
          <template #default="{ row }">
            <div class="cell-strong">{{ row.code }}</div>
            <div class="cell-sub">{{ fmtDate(row.date) }} · {{ row.createdBy }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Scope" min-width="220">
          <template #default="{ row }">
            <div class="cell-scope">{{ scopeLabel(row) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Bins" width="70" align="right">
          <template #default="{ row }">{{ binCount(row) }}</template>
        </el-table-column>
        <el-table-column label="Progress" min-width="200">
          <template #default="{ row }">
            <el-progress :percentage="ccProgress(row).pct" :stroke-width="8" :status="row.status === 'DONE' ? 'success' : undefined" />
            <div class="cell-sub">
              {{ ccProgress(row).matched }}/{{ ccProgress(row).total }} matched · {{ ccProgress(row).counted }} counted
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Status" width="130">
          <template #default="{ row }">
            <span class="status-pill" :class="STATUS_COLOR[row.status as CycleCount['status']]">{{ row.status }}</span>
          </template>
        </el-table-column>
        <el-table-column label="" width="210" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openSession(row)">{{ row.status === 'DONE' ? 'View' : 'Continue' }}</el-button>
            <el-button link type="primary" @click="printSheet(row)">Print</el-button>
            <el-button link type="primary" @click="showLog(row)">Log</el-button>
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar v-model:page="page" :page-size="pageSize" :total="filtered.length" />
    </div>

    <!-- log -->
    <el-dialog v-model="logOpen" :title="logTitle" width="560px">
      <el-timeline v-if="logRows.length">
        <el-timeline-item v-for="(l, i) in logRows" :key="i" :timestamp="`${fmtDateTime(l.ts)} · ${l.by}`">
          <b>{{ l.action }}</b>
          <div v-if="l.note" class="cell-sub">{{ l.note }}</div>
        </el-timeline-item>
      </el-timeline>
      <div v-else class="cell-sub">No log entries.</div>
    </el-dialog>

    <!-- start -->
    <el-dialog v-model="startOpen" title="Start cycle count" width="720px" top="5vh" @closed="collab.closed">
      <el-alert type="info" :closable="false" show-icon class="cc-alert"
        title="Every bin in scope is frozen: no putaway, picking or transfer until each line's counted qty matches the system (or the difference is approved)." />
      <el-form label-position="top">
        <div class="cc-grid">
          <el-form-item label="Count date">
            <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" format="DD MMM YYYY" :clearable="false" class="w-full" />
          </el-form-item>
          <el-form-item label="Zones">
            <el-select v-model="form.zones" multiple collapse-tags collapse-tags-tooltip placeholder="All storage zones" class="w-full">
              <el-option v-for="z in storageZones" :key="z.id" :value="z.id" :label="z.id">
                <span>{{ z.id }}</span> <span class="cell-sub">{{ z.name }}</span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item label="Racks">
            <el-select v-model="form.racks" multiple collapse-tags collapse-tags-tooltip placeholder="All racks" class="w-full">
              <el-option v-for="r in rackOptions" :key="r" :value="r" :label="rackLabel(r)" />
            </el-select>
          </el-form-item>
          <el-form-item label="Bins">
            <el-select v-model="form.bins" multiple filterable collapse-tags collapse-tags-tooltip placeholder="All bins" class="w-full">
              <el-option v-for="b in binOptions" :key="b.bin" :value="b.bin" :label="b.bin">
                <div class="opt-row">
                  <span>{{ b.bin }} <span class="cell-sub">{{ b.zone }}</span></span>
                  <span v-if="b.frozen" class="cell-sub">already in {{ b.frozenBy }}</span>
                </div>
              </el-option>
            </el-select>
          </el-form-item>
        </div>
      </el-form>

      <div class="cc-preview">
        <div class="cc-preview-stats">
          <div><span class="cell-sub">Bins in scope</span><b>{{ preview.bins }}</b></div>
          <div><span class="cell-sub">Lines to count</span><b>{{ preview.lines }}</b></div>
          <div><span class="cell-sub">Already frozen (skipped)</span><b :class="{ 'is-warn': preview.frozen }">{{ preview.frozen }}</b></div>
          <div><span class="cell-sub">Never counted</span><b>{{ preview.never }}</b></div>
        </div>
        <el-table v-if="preview.rows.length" :data="preview.rows" size="small" max-height="220">
          <el-table-column prop="bin" label="Bin" min-width="110" />
          <el-table-column prop="zone" label="Zone" min-width="90" />
          <el-table-column label="Last counted" min-width="160">
            <template #default="{ row }">
              <template v-if="row.last">{{ fmtDate(row.last.date) }} <span class="cell-sub">{{ row.last.code }}</span></template>
              <span v-else class="cell-sub">Never</span>
            </template>
          </el-table-column>
          <el-table-column label="" min-width="140">
            <template #default="{ row }">
              <span v-if="row.frozenBy" class="status-pill amber">In {{ row.frozenBy }}</span>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="cell-sub">No bins match this scope.</div>
      </div>

      <DocCollabSection :doc-key="collab.key.value" />

      <template #footer>
        <el-button @click="startOpen = false">Cancel</el-button>
        <el-button type="primary" :disabled="!preview.bins" @click="submitStart">Start &amp; freeze {{ preview.bins }} bin(s)</el-button>
      </template>
    </el-dialog>

    <!-- session detail -->
    <el-dialog v-model="sessionOpen" :title="session ? `Cycle count ${session.code}` : 'Cycle count'" width="1080px" top="5vh">
      <template v-if="session && sessionProg">
        <div class="cc-session-head">
          <div>
            <span class="status-pill" :class="STATUS_COLOR[session.status]">{{ session.status }}</span>
            <span class="cell-sub cc-session-meta">{{ fmtDate(session.date) }} · {{ scopeLabel(session) }} · {{ session.createdBy }}</span>
          </div>
          <div class="cc-session-prog">
            <el-progress :percentage="sessionProg.pct" :stroke-width="8" :status="readOnly ? 'success' : undefined" />
            <span class="cell-sub">{{ sessionProg.matched }}/{{ sessionProg.total }} matched · {{ sessionProg.counted }} counted</span>
          </div>
        </div>
        <el-alert v-if="!readOnly" type="warning" :closable="false" show-icon class="cc-alert"
          title="These bins stay frozen until every line matches. Enter the physical count; approve differences to correct the system stock." />

        <el-table :data="session.lines" max-height="60vh" size="small">
          <el-table-column label="Bin" min-width="150">
            <template #default="{ row }">
              <div class="cell-strong">{{ row.bin }}</div>
              <div class="cell-sub">{{ lastCountedText(row.bin, session.id) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="Product" min-width="220">
            <template #default="{ row }">
              <template v-if="row.sku">
                <div class="cell-strong">{{ row.sku }}</div>
                <div class="cell-sub">{{ store.skuName(row.sku) }}</div>
              </template>
              <span v-else class="cell-sub"><i>(empty bin – verify)</i></span>
            </template>
          </el-table-column>
          <el-table-column label="Batch" min-width="130">
            <template #default="{ row }">
              <div>{{ row.batch }}</div>
              <div class="cell-sub">{{ fmtDate(row.exp) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="System qty" width="100" align="right">
            <template #default="{ row }">{{ fmtQty(row.sysQty) }}</template>
          </el-table-column>
          <el-table-column label="Counted qty" width="130" align="right">
            <template #default="{ row, $index }">
              <span v-if="readOnly">{{ row.countQty === null ? '-' : fmtQty(row.countQty) }}</span>
              <el-input-number v-else :model-value="row.countQty ?? undefined" :min="0" :step="1" step-strictly :controls="false"
                size="small" class="cc-count" placeholder="–" @change="(v: number | undefined) => onCount($index, v)" />
            </template>
          </el-table-column>
          <el-table-column label="Difference" width="100" align="right">
            <template #default="{ row }">
              <span v-if="diffOf(row) === null" class="cell-sub">-</span>
              <span v-else-if="diffOf(row) === 0" class="cell-sub">0</span>
              <b v-else :class="(diffOf(row) ?? 0) < 0 ? 'is-neg' : 'is-warn'">{{ (diffOf(row) ?? 0) > 0 ? '+' : '' }}{{ diffOf(row) }}</b>
            </template>
          </el-table-column>
          <el-table-column label="Status" min-width="200">
            <template #default="{ row, $index }">
              <div class="cc-status">
                <span v-if="row.countQty === null" class="status-pill gray">Not counted</span>
                <span v-else-if="row.countQty === row.sysQty" class="status-pill green">MATCH</span>
                <span v-else class="status-pill red">DIFFERENCE</span>
                <span v-if="row.adjusted" class="cell-sub">adjusted</span>
                <el-button v-if="!readOnly && row.countQty !== null && row.countQty !== row.sysQty" size="small" type="warning" plain
                  @click="approve($index)">Approve adjustment</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <DocCollabSection :doc-key="docKey('wms-cycle-count', session.code)" />
      </template>
      <template #footer>
        <el-button v-if="session" @click="printSheet(session)">Print count sheet</el-button>
        <el-button type="primary" @click="sessionOpen = false">Close</el-button>
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
.cell-scope {
  font-size: 13px;
  line-height: 1.4;
}
.w-full {
  width: 100%;
}
.opt-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.cc-alert {
  margin-bottom: 16px;
}
.cc-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}
.cc-preview {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  background: var(--gray-50);
}
.cc-preview-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.cc-preview-stats > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cc-preview-stats b {
  font-size: 18px;
  color: var(--gray-900);
}
.is-warn {
  color: var(--warning) !important;
}
.is-neg {
  color: var(--danger);
}
.cc-session-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.cc-session-meta {
  margin-left: 8px;
}
.cc-session-prog {
  min-width: 260px;
}
.cc-count {
  width: 100%;
}
.cc-status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
@media (max-width: 760px) {
  .cc-grid,
  .cc-preview-stats {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
