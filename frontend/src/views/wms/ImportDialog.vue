<script setup lang="ts">
// Reusable import dialog: download template → upload file → per-row validation preview → import valid rows → summary.
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, type UploadFile } from 'element-plus'
import { Download, UploadFilled } from '@element-plus/icons-vue'
import { useWmsStore } from '../../stores/wmsStore'
import {
  IMPORT_SPECS,
  commitImport,
  downloadTemplate,
  isCommittable,
  readImportFile,
  validateImport,
  type CommitResult,
  type ImportKind,
  type ParsedFile,
  type RowStatus,
  type ValidatedRow,
} from './wmsImport'

const props = defineProps<{ kind: ImportKind }>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ done: [result: CommitResult] }>()

const store = useWmsStore()
const spec = computed(() => IMPORT_SPECS[props.kind])

const fileName = ref('')
const fileError = ref('')
const parsed = ref<ParsedFile['rows']>([])
const opts = reactive({ updateExisting: false })
const result = ref<CommitResult | null>(null)
const statusFilter = ref<'ALL' | 'VALID' | 'ERROR'>('ALL')

function reset() {
  fileName.value = ''
  fileError.value = ''
  parsed.value = []
  result.value = null
  statusFilter.value = 'ALL'
  opts.updateExisting = spec.value.updateOption?.default ?? false
}
watch(open, (v) => { if (v) reset() })
watch(() => props.kind, reset)

// Re-validated whenever the file, the options or the store change.
const rows = computed(() => validateImport(props.kind, parsed.value, { ...opts }, store))
const counts = computed(() => ({
  valid: rows.value.filter(isCommittable).length,
  created: rows.value.filter((r) => r.status === 'NEW').length,
  updated: rows.value.filter((r) => r.status === 'UPDATE').length,
  skipped: rows.value.filter((r) => r.status === 'SKIP').length,
  invalid: rows.value.filter((r) => r.status === 'ERROR').length,
}))
const shownRows = computed(() =>
  rows.value.filter((r) => statusFilter.value === 'ALL' || (statusFilter.value === 'ERROR' ? r.status === 'ERROR' : isCommittable(r))),
)

const STATUS_PILL: Record<RowStatus, { label: string; color: string }> = {
  NEW: { label: 'OK', color: 'green' },
  UPDATE: { label: 'UPDATE', color: 'blue' },
  SKIP: { label: 'SKIP', color: 'gray' },
  ERROR: { label: 'ERROR', color: 'red' },
}

const rowClass = ({ row }: { row: ValidatedRow }) => (row.status === 'ERROR' ? 'imp-row-err' : '')

async function onFile(file: UploadFile) {
  if (!file.raw) return
  fileError.value = ''
  result.value = null
  fileName.value = file.name
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    fileError.value = 'Unsupported file type. Use .xlsx, .xls or .csv.'
    parsed.value = []
    return
  }
  try {
    const out = await readImportFile(file.raw, props.kind)
    if (out.missing.length) {
      fileError.value = `Required column(s) not found: ${out.missing.join(', ')}. Use the template header.`
      parsed.value = []
    } else if (!out.rows.length) {
      fileError.value = 'The file has no data rows.'
      parsed.value = []
    } else parsed.value = out.rows
  } catch {
    fileError.value = 'The file could not be read.'
    parsed.value = []
  }
}

function commit() {
  if (!counts.value.valid) return
  const r = commitImport(props.kind, rows.value, store)
  result.value = r
  parsed.value = []
  if (r.failed.length) ElMessage.warning(r.summary)
  else ElMessage.success(r.summary)
  emit('done', r)
}
</script>

<template>
  <el-dialog v-model="open" :title="spec.title" width="980px" destroy-on-close>
    <!-- Result -->
    <div v-if="result" class="imp-result">
      <el-result :icon="result.failed.length ? 'warning' : 'success'" :title="result.failed.length ? 'Import finished with errors' : 'Import finished'" :sub-title="result.summary" />
      <el-table v-if="result.failed.length" :data="result.failed" size="small" max-height="240">
        <el-table-column prop="line" label="Row" width="70" />
        <el-table-column prop="msg" label="Reason" min-width="300" />
      </el-table>
    </div>

    <template v-else>
      <div class="imp-top">
        <div class="imp-format">
          <div class="imp-step">1. Prepare the file</div>
          <ul>
            <li v-for="c in spec.columns" :key="c.key">
              <b>{{ c.label }}</b><span v-if="c.required" class="imp-req"> *</span>
              <span v-if="c.note" class="muted"> – {{ c.note }}</span>
            </li>
          </ul>
          <el-button size="small" :icon="Download" @click="downloadTemplate(kind)">Download template</el-button>
          <div class="imp-hint">{{ spec.hint }}</div>
        </div>
        <div class="imp-upload">
          <div class="imp-step">2. Upload</div>
          <el-upload drag :auto-upload="false" :show-file-list="false" accept=".xlsx,.xls,.csv" :on-change="onFile">
            <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
            <div class="el-upload__text">Drop an .xlsx / .xls / .csv file here or <em>click to browse</em></div>
          </el-upload>
          <div v-if="fileName" class="imp-file">{{ fileName }}<template v-if="parsed.length"> · {{ parsed.length }} data rows</template></div>
          <div v-if="fileError" class="imp-error">{{ fileError }}</div>
          <el-checkbox v-if="spec.updateOption" v-model="opts.updateExisting" class="imp-opt">{{ spec.updateOption.label }}</el-checkbox>
        </div>
      </div>

      <template v-if="rows.length">
        <div class="imp-bar">
          <div class="imp-step">3. Review</div>
          <div class="imp-counts">
            <span class="status-pill green">{{ counts.valid }} valid</span>
            <span v-if="counts.updated" class="status-pill blue">{{ counts.updated }} update</span>
            <span v-if="counts.skipped" class="status-pill gray">{{ counts.skipped }} skipped</span>
            <span class="status-pill" :class="counts.invalid ? 'red' : 'gray'">{{ counts.invalid }} invalid</span>
          </div>
          <el-radio-group v-model="statusFilter" size="small">
            <el-radio-button value="ALL">All</el-radio-button>
            <el-radio-button value="VALID">Valid</el-radio-button>
            <el-radio-button value="ERROR">Invalid</el-radio-button>
          </el-radio-group>
        </div>
        <el-table :data="shownRows" size="small" max-height="340" :row-class-name="rowClass">
          <el-table-column prop="line" label="Row" width="60" />
          <el-table-column v-for="c in spec.columns" :key="c.key" :label="c.label" min-width="110" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="kind === 'sku' && c.key === 'sku' && !row.raw.sku" class="muted">(auto)</span>
              <span v-else>{{ row.raw[c.key] }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Status" width="90">
            <template #default="{ row }">
              <span class="status-pill" :class="STATUS_PILL[row.status as RowStatus].color">{{ STATUS_PILL[row.status as RowStatus].label }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Message" min-width="240">
            <template #default="{ row }">
              <div v-if="row.errors.length" class="imp-error">{{ row.errors.join('; ') }}</div>
              <div v-if="row.notes.length" class="muted">{{ row.notes.join('; ') }}</div>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </template>

    <template #footer>
      <template v-if="result">
        <el-button @click="reset">Import another file</el-button>
        <el-button type="primary" @click="open = false">Close</el-button>
      </template>
      <template v-else>
        <el-button @click="open = false">Cancel</el-button>
        <el-button type="primary" :disabled="!counts.valid" @click="commit">
          {{ spec.commitLabel }}{{ counts.valid ? ` (${counts.valid} valid row${counts.valid === 1 ? '' : 's'})` : '' }}
        </el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
.imp-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 20px;
  margin-bottom: 16px;
}
.imp-step {
  font-size: 13px;
  font-weight: 700;
  color: var(--gray-900);
  margin-bottom: 8px;
}
.imp-format ul {
  margin: 0 0 10px;
  padding-left: 18px;
  font-size: 12.5px;
  color: var(--gray-700);
  line-height: 1.6;
}
.imp-req {
  color: #b91c1c;
}
.imp-hint {
  margin-top: 10px;
  font-size: 12px;
  color: var(--gray-500);
}
.imp-upload :deep(.el-upload-dragger) {
  padding: 22px 12px;
}
.imp-file {
  margin-top: 8px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--gray-700);
}
.imp-opt {
  margin-top: 8px;
  white-space: normal;
  height: auto;
}
.imp-error {
  color: #b91c1c;
  font-size: 12.5px;
}
.muted {
  color: var(--gray-500);
  font-size: 12.5px;
}
.imp-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.imp-bar .imp-step {
  margin-bottom: 0;
}
.imp-counts {
  display: flex;
  gap: 6px;
  flex: 1;
}
:deep(.imp-row-err) {
  background: var(--danger-light);
}
@media (max-width: 720px) {
  .imp-top {
    grid-template-columns: 1fr;
  }
}
</style>
