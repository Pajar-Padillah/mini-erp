<script setup lang="ts">
// Mobile task scan: the helper / picker executes a warehouse task line by line on the phone –
// scan the bin, scan the item / lot label, confirm the qty. Works with a hardware scanner
// (types the code + Enter) or the phone camera (BarcodeDetector API, when available).
// "Lookup" mode (?mode=lookup) is a read-only scan: scan a bin or SKU / lot label to see its stock.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Camera, CircleCheck, Warning } from '@element-plus/icons-vue'
import ExpiryTag from './ExpiryTag.vue'
import ScanLookupResult, { type LookupTarget } from './ScanLookupResult.vue'
import { fmtDate, fmtDateTime, fmtQty } from './wmsUi'
import { useWmsStore } from '../../stores/wmsStore'
import {
  PROBLEM_REASONS, TASK_LINE_STATUSES, lineBin, lineHasIssue, lineOpen, lineRemaining, taskActive, taskDuration, taskProgress,
  parseScan, taskStatus, taskStatusColor, taskStatusLabel, taskTypeColor, taskTypeLabel, useWmsTaskStore, type WarehouseTask,
} from '../../stores/wmsTaskStore'
import { useAccessStore } from '../../stores/accessStore'

const wms = useWmsStore()
const store = useWmsTaskStore()
const access = useAccessStore()
const route = useRoute()
const router = useRouter()

const WORKER_KEY = 'mini-erp.wms.taskScan.worker'
function readWorker(): string {
  try {
    return localStorage.getItem(WORKER_KEY) ?? ''
  } catch {
    return ''
  }
}
const worker = ref(readWorker())
watch(worker, (w) => {
  try {
    localStorage.setItem(WORKER_KEY, w)
  } catch {
    // ignore storage failures
  }
})

// ---------------------------------------------------------------- mode (Tasks | Lookup)
type Mode = 'tasks' | 'lookup'
const mode = ref<Mode>(route.query.mode === 'lookup' ? 'lookup' : 'tasks')
function setMode(m: Mode) {
  if (m === mode.value) return
  stopCamera()
  banner.value = null
  mode.value = m
  const query = { ...route.query }
  if (m === 'lookup') query.mode = 'lookup'
  else delete query.mode
  router.replace({ query })
  if (m === 'lookup') focusLookup()
  else focusInput()
}
watch(
  () => route.query.mode,
  (q) => {
    const m: Mode = q === 'lookup' ? 'lookup' : 'tasks'
    if (m !== mode.value) setMode(m)
  },
)

// ---------------------------------------------------------------- feedback
type Tone = 'ok' | 'err' | 'info'
const banner = ref<{ tone: Tone; msg: string } | null>(null)
function buzz(ok: boolean) {
  try {
    navigator.vibrate?.(ok ? 60 : [80, 60, 80])
  } catch {
    // vibration not available
  }
}
// One banner (plus a vibration) is the feedback; toasts would pile up on a phone screen while scanning.
function feedback(ok: boolean, msg: string) {
  banner.value = { tone: ok ? 'ok' : 'err', msg }
  buzz(ok)
}
/** Camera / hardware scanners often read the same label twice in a row. */
let lastScan = { code: '', at: 0 }
function isDoubleRead(code: string): boolean {
  const now = Date.now()
  const dup = code === lastScan.code && now - lastScan.at < 1500
  lastScan = { code, at: now }
  return dup
}

// ---------------------------------------------------------------- task list
const listTab = ref<'active' | 'history'>('active')
const myTasks = computed(() => (worker.value ? store.tasksOf(worker.value) : []))
const activeTasks = computed(() => myTasks.value.filter(taskActive).sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
const historyTasks = computed(() =>
  myTasks.value.filter((t) => !taskActive(t)).sort((a, b) => (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt)).slice(0, 30),
)
const listed = computed(() => (listTab.value === 'active' ? activeTasks.value : historyTasks.value))

// ---------------------------------------------------------------- open task
const openNo = ref('')
const task = computed<WarehouseTask | null>(() => (openNo.value ? store.taskByNo(openNo.value) ?? null : null))
const lineIdx = ref<number | null>(null)
const line = computed(() => (task.value && lineIdx.value !== null ? task.value.lines[lineIdx.value] ?? null : null))
const step = computed(() => (line.value ? store.nextStep(line.value) : 'BIN'))
const expectedBin = computed(() => (task.value && line.value ? lineBin(task.value, line.value) : ''))
const progress = computed(() => (task.value ? taskProgress(task.value) : null))
const notMine = computed(() => !!task.value && !!worker.value && task.value.assignee !== worker.value)

const scanCode = ref('')
const qty = ref(0)
const shortNote = ref('')
const scanInput = ref<HTMLInputElement | null>(null)
const qtyInput = ref<HTMLInputElement | null>(null)

/** Keep the selected line on an open one (first open line by default). */
function syncLine() {
  const t = task.value
  if (!t || !taskActive(t)) {
    lineIdx.value = null
    return
  }
  const cur = lineIdx.value !== null ? t.lines[lineIdx.value] : undefined
  if (!cur || !lineOpen(cur)) {
    const i = t.lines.findIndex(lineOpen)
    lineIdx.value = i >= 0 ? i : null
  }
}
function prepareStep() {
  scanCode.value = ''
  if (line.value && step.value === 'QTY') {
    qty.value = lineRemaining(line.value)
    shortNote.value = ''
    stopCamera()
  }
  focusInput()
}
function focusInput() {
  nextTick(() => {
    if (step.value === 'QTY') qtyInput.value?.select()
    else if (!cameraOn.value) scanInput.value?.focus()
  })
}

function openTask(no: string) {
  const t = store.taskByNo(no)
  if (!t) {
    feedback(false, `Task ${no} not found.`)
    return
  }
  if (!worker.value) worker.value = t.assignee
  openNo.value = no
  lineIdx.value = null
  banner.value = null
  syncLine()
  prepareStep()
  if (route.query.task !== no) router.replace({ query: { ...route.query, task: no } })
}
function closeTask() {
  stopCamera()
  openNo.value = ''
  lineIdx.value = null
  banner.value = null
  const query = { ...route.query }
  delete query.task
  router.replace({ query })
}
function selectLine(i: number) {
  const t = task.value
  const ln = t?.lines[i]
  if (!t || !ln || !lineOpen(ln) || !taskActive(t)) return
  lineIdx.value = i
  banner.value = null
  prepareStep()
}
function startTask() {
  if (!task.value) return
  const r = store.startTask(task.value.no, worker.value || undefined)
  feedback(r.ok, r.ok ? 'Task started – scan the first bin.' : r.msg)
  syncLine()
  prepareStep()
}

// ---------------------------------------------------------------- scanning
function submitScan(raw = scanCode.value) {
  const t = task.value
  const code = raw.trim()
  if (!t || lineIdx.value === null || !code) return
  if (isDoubleRead(code)) return
  const r = store.scan(t.no, lineIdx.value, code, worker.value || undefined)
  feedback(r.ok, r.msg)
  scanCode.value = ''
  if (r.ok) prepareStep()
  else focusInput()
}
function rescan() {
  if (!task.value || lineIdx.value === null) return
  store.resetScans(task.value.no, lineIdx.value)
  banner.value = { tone: 'info', msg: 'Scan the bin again.' }
  prepareStep()
}
function adjustQty(d: number) {
  if (!line.value) return
  qty.value = Math.max(0, Math.min(lineRemaining(line.value), (Number(qty.value) || 0) + d))
}
const isShort = computed(() => !!line.value && (Number(qty.value) || 0) < lineRemaining(line.value))
const busy = ref(false)
function confirmLine() {
  const t = task.value
  if (!t || lineIdx.value === null || busy.value) return
  busy.value = true
  try {
    const r = store.executeLine(t.no, lineIdx.value, Number(qty.value) || 0, shortNote.value, worker.value || undefined)
    feedback(r.ok, r.msg)
    if (!r.ok) return
    syncLine()
    prepareStep()
    if (!taskActive(t)) feedback(true, `Task ${t.no} ${taskStatusLabel(taskStatus(t)).toLowerCase()}. Thank you!`)
  } finally {
    busy.value = false
  }
}

// ---------------------------------------------------------------- problem
const problemOpen = ref(false)
const problemReason = ref(PROBLEM_REASONS[0] ?? '')
const problemNote = ref('')
function openProblem() {
  problemReason.value = PROBLEM_REASONS[0] ?? ''
  problemNote.value = ''
  problemOpen.value = true
}
function submitProblem() {
  const t = task.value
  if (!t || lineIdx.value === null) return
  const note = [problemReason.value, problemNote.value.trim()].filter(Boolean).join(' – ')
  const r = store.reportProblem(t.no, lineIdx.value, note, worker.value || undefined)
  feedback(r.ok, r.msg)
  if (!r.ok) return
  problemOpen.value = false
  stopCamera()
  syncLine()
  prepareStep()
}

// ---------------------------------------------------------------- camera (BarcodeDetector)
interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike
const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
const cameraSupported = !!Detector && !!navigator.mediaDevices?.getUserMedia

const cameraOn = ref(false)
const video = ref<HTMLVideoElement | null>(null)
let stream: MediaStream | null = null
let detectTimer: number | undefined
let detecting = false

/** Shared by both modes: every detected code is handed to `onCode` (task scan or lookup). */
async function startCamera(onCode: (code: string) => void) {
  if (!Detector || cameraOn.value) return
  let detector: BarcodeDetectorLike
  try {
    detector = new Detector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'data_matrix'] })
  } catch {
    detector = new Detector()
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
  } catch {
    feedback(false, 'Camera not available or permission denied. Use the scanner or type the code.')
    return
  }
  cameraOn.value = true
  await nextTick()
  if (!video.value) return stopCamera()
  video.value.srcObject = stream
  try {
    await video.value.play()
  } catch {
    // autoplay restrictions – the stream still renders once the user interacts
  }
  detectTimer = window.setInterval(async () => {
    if (detecting || !video.value || video.value.readyState < 2) return
    detecting = true
    try {
      const codes = await detector.detect(video.value)
      const code = codes[0]?.rawValue
      if (code) onCode(code)
    } catch {
      // frame not ready
    } finally {
      detecting = false
    }
  }, 250)
}
function stopCamera() {
  window.clearInterval(detectTimer)
  detectTimer = undefined
  stream?.getTracks().forEach((tr) => tr.stop())
  stream = null
  if (video.value) video.value.srcObject = null
  cameraOn.value = false
}
function toggleCamera() {
  if (cameraOn.value) {
    stopCamera()
    if (mode.value === 'lookup') focusLookup()
    else focusInput()
  } else void startCamera(mode.value === 'lookup' ? (c) => lookup(c, true) : (c) => submitScan(c))
}

// ---------------------------------------------------------------- lookup (read-only)
const RECENT_KEY = 'mini-erp.wms.scanLookup.recent'
function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}
const recent = ref<string[]>(readRecent())
watch(recent, (r) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(r))
  } catch {
    // ignore storage failures
  }
})
const lookupCode = ref('')
const lookupInput = ref<HTMLInputElement | null>(null)
const lookupTarget = ref<LookupTarget | null>(null)
function focusLookup() {
  nextTick(() => {
    if (!cameraOn.value) lookupInput.value?.focus()
  })
}
const findBin = (code: string) => wms.bins.find((b) => b.bin.toUpperCase() === code.toUpperCase())
const findSku = (code: string) => wms.skus.find((s) => s.sku.toUpperCase() === code.toUpperCase())
function resolveLookup(raw: string): LookupTarget | null {
  const p = parseScan(raw)
  if (p.kind === 'BIN') {
    const b = findBin(p.bin)
    return b ? { kind: 'BIN', bin: b.bin } : null
  }
  if (p.kind === 'LOT') {
    const s = findSku(p.sku)
    return s ? { kind: 'SKU', sku: s.sku, batch: p.batch, exp: p.exp } : null
  }
  const b = findBin(p.code)
  if (b) return { kind: 'BIN', bin: b.bin }
  const s = findSku(p.code)
  return s ? { kind: 'SKU', sku: s.sku } : null
}
function lookup(raw = lookupCode.value, fromCamera = false) {
  const code = raw.trim()
  lookupCode.value = ''
  if (!code) return
  if (fromCamera && isDoubleRead(code)) return
  const target = resolveLookup(code)
  if (!target) {
    lookupTarget.value = null
    feedback(false, `Code ${code} is not a known bin or SKU.`)
    focusLookup()
    return
  }
  banner.value = null
  buzz(true)
  lookupTarget.value = target
  const key = target.kind === 'BIN' ? target.bin : target.sku
  recent.value = [key, ...recent.value.filter((c) => c.toUpperCase() !== key.toUpperCase())].slice(0, 6)
  focusLookup()
}
function onVisibility() {
  if (document.hidden) stopCamera()
}

// ---------------------------------------------------------------- deep link (?task=NO)
function openFromQuery() {
  const no = typeof route.query.task === 'string' ? route.query.task : ''
  if (no && no !== openNo.value) openTask(no)
}
onMounted(() => {
  openFromQuery()
  if (mode.value === 'lookup') focusLookup()
  document.addEventListener('visibilitychange', onVisibility)
})
watch(() => route.query.task, openFromQuery)
onBeforeUnmount(() => {
  stopCamera()
  document.removeEventListener('visibilitychange', onVisibility)
})

const stepState = (s: 'BIN' | 'ITEM' | 'QTY') => {
  const order = ['BIN', 'ITEM', 'QTY']
  const cur = order.indexOf(step.value)
  const me = order.indexOf(s)
  return me < cur ? 'done' : me === cur ? 'now' : ''
}
const summary = computed(() => {
  const t = task.value
  if (!t) return null
  return {
    done: t.lines.filter((l) => l.status === 'DONE').length,
    short: t.lines.filter((l) => l.status === 'SHORT').length,
    problem: t.lines.filter((l) => l.status === 'PROBLEM').length,
  }
})
</script>

<template>
  <div class="page">
    <div class="ts-wrap">
      <!-- Header -->
      <div class="ts-head">
        <div class="ts-mode" role="tablist">
          <button type="button" role="tab" :aria-selected="mode === 'tasks'" :class="{ on: mode === 'tasks' }" @click="setMode('tasks')">Tasks</button>
          <button type="button" role="tab" :aria-selected="mode === 'lookup'" :class="{ on: mode === 'lookup' }" @click="setMode('lookup')">Lookup</button>
        </div>
        <div v-if="mode === 'lookup'" class="ts-head-row">
          <div class="ts-head-title">
            <div class="ts-title">Scan Lookup</div>
            <div class="ts-sub">Scan a bin or SKU / lot label to see its stock</div>
          </div>
        </div>
        <div v-else class="ts-head-row">
          <el-button v-if="task" :icon="ArrowLeft" circle class="ts-back" @click="closeTask" />
          <div class="ts-head-title">
            <div class="ts-title">{{ task ? task.no : 'Mobile Task Scan' }}</div>
            <div class="ts-sub">{{ task ? `${task.refNo} · ${task.party}` : 'Putaway & picking with scan' }}</div>
          </div>
        </div>
        <el-select v-if="mode === 'tasks' && !task" v-model="worker" filterable placeholder="Who are you?" size="large" class="ts-worker">
          <el-option v-for="w in store.workers" :key="w" :label="w" :value="w" />
        </el-select>
      </div>

      <div v-if="banner" class="ts-banner" :class="banner.tone">
        <el-icon v-if="banner.tone === 'ok'"><CircleCheck /></el-icon>
        <el-icon v-else-if="banner.tone === 'err'"><Warning /></el-icon>
        <span>{{ banner.msg }}</span>
      </div>

      <!-- ============ Lookup (read-only) ============ -->
      <template v-if="mode === 'lookup'">
        <div class="ts-card ts-work">
          <div v-show="cameraOn" class="ts-video-box">
            <video ref="video" class="ts-video" playsinline muted />
            <div class="ts-video-frame" />
          </div>
          <form class="ts-scan-form" @submit.prevent="lookup()">
            <input
              ref="lookupInput"
              v-model="lookupCode"
              class="ts-scan-input"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              placeholder="Scan / type bin or SKU"
            />
            <el-button type="primary" size="large" native-type="submit">Find</el-button>
          </form>
          <el-button v-if="cameraSupported" size="large" class="ts-btn" :icon="Camera" @click="toggleCamera">
            {{ cameraOn ? 'Stop camera' : 'Scan with camera' }}
          </el-button>
          <div v-if="recent.length" class="ts-recent">
            <span class="ts-muted">Recent</span>
            <button v-for="c in recent" :key="c" type="button" class="ts-chip" @click="lookup(c)">{{ c }}</button>
          </div>
        </div>
        <ScanLookupResult v-if="lookupTarget" :target="lookupTarget" @lookup="lookup($event)" />
        <div v-else class="ts-card ts-empty">Scan a bin label (e.g. <b>BIN:A1-R1-B1</b>), an SKU code or a lot label to see what is stored where.</div>
      </template>

      <!-- ============ Task list ============ -->
      <template v-else-if="!task">
        <div v-if="!worker" class="ts-card ts-empty">Choose your name to see your tasks.</div>
        <template v-else>
          <el-radio-group v-model="listTab" size="large" class="ts-tabs">
            <el-radio-button value="active">Active ({{ activeTasks.length }})</el-radio-button>
            <el-radio-button value="history">History</el-radio-button>
          </el-radio-group>
          <button v-for="t in listed" :key="t.no" type="button" class="ts-card ts-task" :class="{ running: taskStatus(t) === 'IN PROGRESS' }" @click="openTask(t.no)">
            <div class="ts-task-top">
              <span class="status-pill" :class="taskTypeColor(t.type)">{{ taskTypeLabel(t.type) }}</span>
              <span class="ts-mono">{{ t.no }}</span>
              <span class="ts-spacer" />
              <span class="status-pill" :class="taskStatusColor(taskStatus(t))">{{ taskStatusLabel(taskStatus(t)) }}</span>
            </div>
            <div class="ts-task-doc">{{ t.refNo }} <span class="ts-muted">· {{ t.party }}</span></div>
            <el-progress :percentage="taskProgress(t).pct" :stroke-width="6" :show-text="false" :status="taskProgress(t).pct === 100 ? 'success' : undefined" />
            <div class="ts-task-meta">
              <span>{{ taskProgress(t).closedLines }}/{{ taskProgress(t).totalLines }} lines · {{ fmtQty(taskProgress(t).totalQty) }} units</span>
              <span>{{ fmtDateTime(t.createdAt) }}</span>
            </div>
            <div v-if="t.note" class="ts-note">Note: {{ t.note }}</div>
          </button>
          <div v-if="!listed.length" class="ts-card ts-empty">
            {{ listTab === 'active' ? 'No active tasks. Wait for the admin to assign putaway / picking work.' : 'No finished tasks yet.' }}
          </div>
        </template>
      </template>

      <!-- ============ Open task ============ -->
      <template v-else>
        <div class="ts-card ts-info">
          <div class="ts-task-top">
            <span class="status-pill" :class="taskTypeColor(task.type)">{{ taskTypeLabel(task.type) }}</span>
            <span class="status-pill" :class="taskStatusColor(taskStatus(task))">{{ taskStatusLabel(taskStatus(task)) }}</span>
            <span class="ts-spacer" />
            <span class="ts-muted">{{ task.assignee }}</span>
          </div>
          <el-progress v-if="progress" :percentage="progress.pct" :stroke-width="10" :status="progress.pct === 100 ? 'success' : undefined" />
          <div v-if="progress" class="ts-task-meta">
            <span>{{ progress.closedLines }}/{{ progress.totalLines }} lines · {{ fmtQty(progress.doneQty) }}/{{ fmtQty(progress.totalQty) }} units</span>
            <span>{{ taskDuration(task) }}</span>
          </div>
          <div v-if="task.note" class="ts-note">Note: {{ task.note }}</div>
          <div v-if="notMine" class="ts-note">This task is assigned to {{ task.assignee }}.</div>
        </div>

        <!-- Not started yet -->
        <div v-if="taskStatus(task) === 'NEW'" class="ts-card ts-center">
          <div class="ts-big-text">{{ task.lines.length }} line(s) to {{ task.type === 'PUTAWAY' ? 'put away' : 'pick' }}</div>
          <p class="ts-muted">For every line: go to the bin, scan the bin label, scan the item / lot label and confirm the qty.</p>
          <el-button type="primary" size="large" class="ts-btn" @click="startTask">Start task</el-button>
        </div>

        <!-- Finished -->
        <div v-else-if="!taskActive(task)" class="ts-card ts-center">
          <el-icon class="ts-done-icon" :class="taskStatus(task) === 'DONE' ? 'ok' : 'warn'"><CircleCheck /></el-icon>
          <div class="ts-big-text">Task {{ taskStatusLabel(taskStatus(task)).toLowerCase() }}</div>
          <div class="ts-muted">{{ fmtDateTime(task.finishedAt) }} · {{ taskDuration(task) }}</div>
          <div v-if="summary" class="ts-summary">
            <div><b>{{ summary.done }}</b><span>Done</span></div>
            <div><b>{{ summary.short }}</b><span>Short</span></div>
            <div><b>{{ summary.problem }}</b><span>Problem</span></div>
            <div><b>{{ fmtQty(progress?.doneQty ?? 0) }}</b><span>Units</span></div>
          </div>
          <el-button size="large" class="ts-btn" @click="closeTask">Back to my tasks</el-button>
        </div>

        <!-- Working on a line -->
        <div v-else-if="line && lineIdx !== null" class="ts-card ts-work">
          <div class="ts-line-head">
            <div class="ts-muted">Line {{ lineIdx + 1 }} of {{ task.lines.length }}</div>
            <div class="ts-line-name">{{ wms.skuName(line.sku) }}</div>
            <div class="ts-line-sub">
              <span class="ts-mono">{{ line.sku }}</span> · Batch <b>{{ line.batch }}</b>
              <ExpiryTag v-if="line.exp !== '-'" :exp="line.exp" show-days />
            </div>
          </div>

          <div class="ts-target">
            <div>
              <div class="ts-target-label">{{ task.type === 'PUTAWAY' ? 'Put into bin' : 'Pick from bin' }}</div>
              <div class="ts-target-bin">{{ expectedBin }}</div>
            </div>
            <div class="ts-target-qty">
              <div class="ts-target-label">Qty</div>
              <div class="ts-target-num">{{ fmtQty(lineRemaining(line)) }}</div>
              <div class="ts-muted">{{ wms.skuUnit(line.sku) }}{{ line.done ? ` · ${fmtQty(line.done)} done` : '' }}</div>
            </div>
          </div>

          <div class="ts-steps">
            <div class="ts-step" :class="stepState('BIN')"><span>{{ stepState('BIN') === 'done' ? '✓' : 1 }}</span>Scan bin</div>
            <div class="ts-step-line" />
            <div class="ts-step" :class="stepState('ITEM')"><span>{{ stepState('ITEM') === 'done' ? '✓' : 2 }}</span>Scan item</div>
            <div class="ts-step-line" />
            <div class="ts-step" :class="stepState('QTY')"><span>3</span>Qty</div>
          </div>

          <template v-if="step !== 'QTY'">
            <div class="ts-hint-text">
              <template v-if="step === 'BIN'">Scan the label of bin <b>{{ expectedBin }}</b>{{ task.type === 'PICK' ? ' (take the goods from here)' : ' (place the goods here)' }}.</template>
              <template v-else>Scan the item / lot label of <b>{{ line.sku }}</b>{{ line.batch !== '-' ? ` batch ${line.batch}` : '' }}.</template>
            </div>
            <div v-show="cameraOn" class="ts-video-box">
              <video ref="video" class="ts-video" playsinline muted />
              <div class="ts-video-frame" />
            </div>
            <form class="ts-scan-form" @submit.prevent="submitScan()">
              <input
                ref="scanInput"
                v-model="scanCode"
                class="ts-scan-input"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                :placeholder="step === 'BIN' ? 'Scan / type bin code' : 'Scan / type SKU or lot'"
              />
              <el-button type="primary" size="large" native-type="submit">OK</el-button>
            </form>
            <el-button v-if="cameraSupported" size="large" class="ts-btn" :icon="Camera" @click="toggleCamera">
              {{ cameraOn ? 'Stop camera' : 'Scan with camera' }}
            </el-button>
            <el-button v-if="step === 'ITEM'" text class="ts-link" @click="rescan">Wrong bin? Scan again</el-button>
          </template>

          <template v-else>
            <div class="ts-hint-text">How many {{ wms.skuUnit(line.sku) }} did you {{ task.type === 'PICK' ? 'take' : 'place' }}?</div>
            <div class="ts-qty-row">
              <button type="button" class="ts-qty-btn" @click="adjustQty(-1)">−</button>
              <input ref="qtyInput" v-model.number="qty" class="ts-qty-input" type="number" inputmode="numeric" min="0" :max="lineRemaining(line)" @keyup.enter="confirmLine" />
              <button type="button" class="ts-qty-btn" @click="adjustQty(1)">+</button>
            </div>
            <template v-if="isShort">
              <el-input v-model="shortNote" size="large" placeholder="Reason if the rest is missing (closes the line short)" />
              <div class="ts-muted ts-small">Without a reason the line stays open for the remaining {{ fmtQty(lineRemaining(line) - (Number(qty) || 0)) }}.</div>
            </template>
            <el-button type="success" size="large" class="ts-btn ts-confirm" :loading="busy" :disabled="!access.can('task-scan', 'execute')" @click="confirmLine">
              Confirm {{ task.type === 'PICK' ? 'pick' : 'putaway' }}
            </el-button>
            <el-button text class="ts-link" @click="rescan">Scan again</el-button>
          </template>

          <el-button text type="danger" class="ts-link" @click="openProblem">Report problem (bin full / damaged / not found)</el-button>
        </div>

        <!-- Lines -->
        <div class="ts-lines-head">Lines · tap an open line to switch</div>
        <button
          v-for="(l, i) in task.lines"
          :key="i"
          type="button"
          class="ts-line"
          :class="{ current: i === lineIdx && taskActive(task), closed: !lineOpen(l), issue: lineHasIssue(l) }"
          @click="selectLine(i)"
        >
          <span class="ts-line-no">{{ i + 1 }}</span>
          <span class="ts-line-main">
            <span class="ts-line-title">{{ l.sku }} · {{ l.batch }}</span>
            <span class="ts-muted">{{ task.type === 'PUTAWAY' ? '→' : '←' }} <b>{{ lineBin(task, l) }}</b>{{ l.exp !== '-' ? ` · ED ${fmtDate(l.exp)}` : '' }}</span>
            <span v-if="l.problem" class="ts-line-problem">{{ l.problem }}</span>
          </span>
          <span class="ts-line-right">
            <span class="ts-mono">{{ fmtQty(l.done) }}/{{ fmtQty(l.qty) }}</span>
            <span class="status-pill" :class="TASK_LINE_STATUSES[l.status].color">{{ TASK_LINE_STATUSES[l.status].label }}</span>
          </span>
        </button>
      </template>
    </div>

    <el-dialog v-model="problemOpen" title="Report problem" width="420px">
      <div v-if="line" class="ts-muted ts-mb">{{ line.sku }} · {{ line.batch }} @ {{ expectedBin }} – the line is closed and the admin re-plans it.</div>
      <el-radio-group v-model="problemReason" class="ts-reasons">
        <el-radio v-for="r in PROBLEM_REASONS" :key="r" :value="r" border size="large">{{ r }}</el-radio>
      </el-radio-group>
      <el-input v-model="problemNote" type="textarea" :rows="2" placeholder="Details (optional)" class="ts-mt" />
      <template #footer>
        <el-button @click="problemOpen = false">Cancel</el-button>
        <el-button type="danger" @click="submitProblem">Report</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.ts-mode {
  display: flex;
  background: rgba(255, 255, 255, 0.18);
  border-radius: var(--radius-md);
  padding: 4px;
  gap: 4px;
}
.ts-mode button {
  flex: 1;
  height: 40px;
  border: none;
  border-radius: calc(var(--radius-md) - 2px);
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.ts-mode button.on {
  background: #fff;
  color: var(--brand-dark);
  box-shadow: var(--shadow-sm);
}
.ts-recent {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.ts-chip {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-dark);
  background: var(--brand-light);
  border: 1px solid var(--brand-light-2);
  border-radius: 999px;
  padding: 6px 12px;
  min-height: 34px;
  cursor: pointer;
}
.ts-wrap {
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ts-head {
  background: var(--brand-gradient);
  color: #fff;
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ts-head-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ts-head-title {
  min-width: 0;
}
.ts-title {
  font-size: 18px;
  font-weight: 700;
}
.ts-sub {
  font-size: 13px;
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ts-worker {
  width: 100%;
}
.ts-banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-radius: var(--radius-md);
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 600;
}
.ts-banner .el-icon {
  font-size: 18px;
  flex-shrink: 0;
  margin-top: 1px;
}
.ts-banner.ok {
  background: var(--success-light);
  color: #15803d;
  border: 1px solid #86efac;
}
.ts-banner.err {
  background: var(--danger-light);
  color: #b91c1c;
  border: 1px solid #fca5a5;
}
.ts-banner.info {
  background: var(--brand-light);
  color: var(--brand-dark);
}
.ts-card {
  background: var(--bg-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  padding: 14px;
  box-shadow: var(--shadow-sm);
}
.ts-empty {
  text-align: center;
  color: var(--gray-500);
  padding: 28px 16px;
}
.ts-tabs {
  display: flex;
}
.ts-tabs :deep(.el-radio-button) {
  flex: 1;
}
.ts-tabs :deep(.el-radio-button__inner) {
  width: 100%;
}
.ts-task {
  width: 100%;
  text-align: left;
  cursor: pointer;
  font: inherit;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ts-task.running {
  border-color: var(--warning);
}
.ts-task-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ts-task-doc {
  font-weight: 600;
  color: var(--gray-900);
}
.ts-task-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--gray-500);
}
.ts-note {
  font-size: 13px;
  color: #8a6100;
  background: var(--warning-light);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
}
.ts-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ts-spacer {
  flex: 1;
}
.ts-mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-weight: 600;
  color: var(--gray-900);
}
.ts-muted {
  font-size: 13px;
  color: var(--gray-500);
}
.ts-small {
  font-size: 12px;
}
.ts-mt {
  margin-top: 10px;
}
.ts-mb {
  margin-bottom: 10px;
}
.ts-center {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.ts-big-text {
  font-size: 18px;
  font-weight: 700;
  color: var(--gray-900);
}
.ts-btn {
  width: 100%;
  height: 52px;
  font-size: 16px;
  margin-left: 0 !important;
}
.ts-confirm {
  height: 58px;
  font-size: 17px;
  font-weight: 700;
}
.ts-link {
  margin-left: 0 !important;
  align-self: center;
}
.ts-done-icon {
  font-size: 56px;
}
.ts-done-icon.ok {
  color: var(--success);
}
.ts-done-icon.warn {
  color: var(--warning);
}
.ts-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  width: 100%;
  margin: 8px 0;
}
.ts-summary > div {
  background: var(--gray-50);
  border-radius: var(--radius-sm);
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
}
.ts-summary b {
  font-size: 20px;
  color: var(--gray-900);
}
.ts-summary span {
  font-size: 11px;
  color: var(--gray-500);
  text-transform: uppercase;
}
.ts-work {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 2px solid var(--brand-light-2);
}
.ts-line-name {
  font-size: 17px;
  font-weight: 700;
  color: var(--gray-900);
  line-height: 1.3;
}
.ts-line-sub {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 13px;
  color: var(--gray-700);
  margin-top: 2px;
}
.ts-target {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  background: var(--brand-light);
  border-radius: var(--radius-md);
  padding: 12px 14px;
}
.ts-target-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--brand-dark);
}
.ts-target-bin {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 26px;
  font-weight: 800;
  color: var(--brand-dark);
}
.ts-target-qty {
  text-align: right;
}
.ts-target-num {
  font-size: 26px;
  font-weight: 800;
  color: var(--gray-900);
}
.ts-steps {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ts-step {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--gray-400);
}
.ts-step span {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid var(--gray-200);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}
.ts-step.now {
  color: var(--brand-dark);
}
.ts-step.now span {
  border-color: var(--brand);
  background: var(--brand-light);
}
.ts-step.done {
  color: #15803d;
}
.ts-step.done span {
  border-color: var(--success);
  background: var(--success-light);
}
.ts-step-line {
  flex: 1;
  height: 2px;
  background: var(--gray-200);
}
.ts-hint-text {
  font-size: 14px;
  color: var(--gray-700);
}
.ts-video-box {
  position: relative;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: #000;
  aspect-ratio: 4 / 3;
}
.ts-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ts-video-frame {
  position: absolute;
  inset: 18% 22%;
  border: 3px solid rgba(255, 255, 255, 0.85);
  border-radius: 12px;
  box-shadow: 0 0 0 999px rgba(0, 0, 0, 0.25);
}
.ts-scan-form {
  display: flex;
  gap: 8px;
}
.ts-scan-form .el-button {
  height: 52px;
  min-width: 64px;
}
.ts-scan-input {
  flex: 1;
  min-width: 0;
  height: 52px;
  border: 2px solid var(--gray-200);
  border-radius: var(--radius-md);
  padding: 0 14px;
  font-size: 17px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  color: var(--gray-900);
  background: var(--bg-card);
  outline: none;
}
.ts-scan-input:focus {
  border-color: var(--brand);
}
.ts-qty-row {
  display: flex;
  gap: 8px;
}
.ts-qty-btn {
  width: 58px;
  height: 58px;
  border-radius: var(--radius-md);
  border: 1px solid var(--gray-200);
  background: var(--gray-50);
  font-size: 26px;
  font-weight: 700;
  color: var(--gray-900);
  cursor: pointer;
}
.ts-qty-input {
  flex: 1;
  min-width: 0;
  height: 58px;
  text-align: center;
  font-size: 28px;
  font-weight: 800;
  border: 2px solid var(--gray-200);
  border-radius: var(--radius-md);
  color: var(--gray-900);
  background: var(--bg-card);
  outline: none;
}
.ts-qty-input:focus {
  border-color: var(--brand);
}
.ts-lines-head {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--gray-500);
  margin-top: 4px;
}
.ts-line {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  font: inherit;
  background: var(--bg-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  cursor: pointer;
}
.ts-line.current {
  border: 2px solid var(--brand);
  background: var(--brand-light);
}
.ts-line.closed {
  cursor: default;
  opacity: 0.75;
}
.ts-line.issue {
  border-color: #fca5a5;
}
.ts-line-no {
  width: 22px;
  font-size: 12px;
  color: var(--gray-400);
  flex-shrink: 0;
}
.ts-line-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.ts-line-title {
  font-weight: 600;
  color: var(--gray-900);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ts-line-problem {
  font-size: 12px;
  color: #b91c1c;
}
.ts-line-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}
.ts-reasons {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}
.ts-reasons .el-radio {
  margin-right: 0;
}
</style>
