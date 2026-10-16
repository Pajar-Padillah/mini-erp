<script setup lang="ts">
// Generic create / edit dialog for static (mock-data) list pages and master data: one field per
// column of the page config, plus the document's attachments (and comments once it exists). A new document collects
// comments under a draft key that moves to the real document number on save (discarded on cancel).
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import DocCollabPanel from '../doc-collab/DocCollabPanel.vue'
import { docKey, draftDocKey, useDocCollabStore } from '../../stores/docCollabStore'
import {
  fieldKind, isAutoNumbered, isComputedColumn, keyProp, nextNumber, singularName,
  type FieldKind, type FormColumn, type FormPageConfig, type FormRow,
} from './staticForm'

const props = defineProps<{
  modelValue: boolean
  config: FormPageConfig
  /** Document type used for the comments / attachments key, e.g. the page key "purchase-orders". */
  pageKey: string
  /** Current rows of the list (numbering + uniqueness). */
  rows: FormRow[]
  /** Row being edited; null / undefined = create. */
  row?: FormRow | null
}>()
const emit = defineEmits<{
  'update:modelValue': [open: boolean]
  /** `original` is the edited row (null on create). */
  save: [row: FormRow, original: FormRow | null]
}>()

const collab = useDocCollabStore()
const open = computed({ get: () => props.modelValue, set: (v) => emit('update:modelValue', v) })
const isEdit = computed(() => !!props.row)
const noProp = computed(() => keyProp(props.config))
const auto = computed(() => isAutoNumbered(props.config))
const noLabel = computed(() => props.config.columns[0]?.label ?? 'Number')

interface Field {
  column: FormColumn
  kind: FieldKind
  readonly: boolean
  hint?: string
}

const fields = computed<Field[]>(() => {
  const sample = props.rows[0]
  return props.config.columns.map((column, i) => {
    const kind = fieldKind(props.config, column, sample)
    if (i === 0) {
      return { column, kind, readonly: auto.value, hint: auto.value && !isEdit.value ? 'Generated when the document is saved' : undefined }
    }
    const computedCol = isComputedColumn(column)
    return { column, kind, readonly: computedCol, hint: computedCol ? 'Calculated by the system' : undefined }
  })
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const form = ref<Record<string, any>>({})
const collabKey = ref('')
let draftKey: string | null = null
let saved = false

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function emptyValue(f: Field): string | number | undefined {
  if (f.kind === 'number') return f.readonly ? 0 : undefined
  if (f.kind === 'date') return today()
  if (f.kind === 'status') return props.config.statuses?.[0]?.value ?? ''
  if (f.kind === 'secondary_status') return props.config.secondaryStatuses?.[0]?.value ?? ''
  return ''
}

function init() {
  saved = false
  if (props.row) {
    form.value = { ...props.row }
    draftKey = null
    collabKey.value = docKey(props.pageKey, String(props.row[noProp.value] ?? ''))
    return
  }
  const values: Record<string, string | number | undefined> = {}
  for (const f of fields.value) values[f.column.prop] = emptyValue(f)
  // Codes are typed in, but suggest the next one in the sequence.
  if (!auto.value) values[noProp.value] = suggestedNo()
  form.value = values
  draftKey = draftDocKey(props.pageKey)
  collabKey.value = draftKey
}

function suggestedNo(): string {
  const existing = props.rows.map((r) => String(r[noProp.value] ?? ''))
  return /\d$/.test(existing[0] ?? '') ? nextNumber(existing) : ''
}

watch(() => props.modelValue, (v) => {
  if (v) init()
})

function onClosed() {
  if (draftKey && !saved) collab.discard(draftKey)
  draftKey = null
}

const title = computed(() =>
  isEdit.value ? `Edit ${props.row?.[noProp.value] ?? ''}` : `New ${singularName(props.config)}`,
)

function save() {
  const prop = noProp.value
  const original = props.row ?? null
  const result: FormRow = {}
  for (const f of fields.value) {
    const v = form.value[f.column.prop]
    result[f.column.prop] = f.kind === 'number' ? Number(v ?? 0) : String(v ?? '').trim()
  }
  // Keep any extra props the row had (not shown as columns).
  const row: FormRow = { ...(original ?? {}), ...result }

  if (!original && auto.value) {
    row[prop] = nextNumber(props.rows.map((r) => String(r[prop] ?? '')), singularName(props.config).slice(0, 3).toUpperCase())
  }
  if (original && auto.value) row[prop] = original[prop]
  const no = String(row[prop] ?? '')
  if (!no) {
    ElMessage.warning(`${noLabel.value} is required`)
    return
  }
  const duplicate = props.rows.some((r) => r !== original && String(r[prop]) === no)
  if (duplicate) {
    ElMessage.warning(`${noLabel.value} ${no} already exists`)
    return
  }

  const finalKey = docKey(props.pageKey, no)
  if (draftKey) collab.moveThread(draftKey, finalKey)
  else if (collabKey.value !== finalKey) collab.moveThread(collabKey.value, finalKey)
  saved = true
  draftKey = null
  emit('save', row, original)
  ElMessage.success(original ? `${no} updated` : `${singularName(props.config)} ${no} created`)
  open.value = false
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="860px" top="6vh" append-to-body class="static-form-dialog" @closed="onClosed">
    <el-form label-position="top" class="form-grid" @submit.prevent>
      <el-form-item
        v-for="f in fields"
        :key="f.column.prop"
        :label="f.column.type === 'percent' ? `${f.column.label} (%)` : f.column.label"
        :required="f.column.prop === noProp && !f.readonly"
      >
        <el-input
          v-if="f.column.prop === noProp && auto"
          :model-value="isEdit ? String(form[f.column.prop] ?? '') : ''"
          :placeholder="isEdit ? '' : 'Auto-generated'"
          disabled
        />
        <el-input-number
          v-else-if="f.kind === 'number'"
          v-model="form[f.column.prop]"
          :controls="false"
          :disabled="f.readonly"
          :precision="f.column.type === 'money' ? 0 : undefined"
          class="static-form-number"
        />
        <el-date-picker
          v-else-if="f.kind === 'date'"
          v-model="form[f.column.prop]"
          type="date"
          value-format="YYYY-MM-DD"
          :disabled="f.readonly"
          style="width: 100%"
        />
        <el-select v-else-if="f.kind === 'status'" v-model="form[f.column.prop]" :disabled="f.readonly" style="width: 100%">
          <el-option v-for="s in config.statuses ?? []" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
        <el-select v-else-if="f.kind === 'secondary_status'" v-model="form[f.column.prop]" :disabled="f.readonly" style="width: 100%">
          <el-option v-for="s in config.secondaryStatuses ?? []" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
        <el-input v-else v-model="form[f.column.prop]" :disabled="f.readonly" :placeholder="f.column.label" />
        <div v-if="f.hint" class="form-hint">{{ f.hint }}</div>
      </el-form-item>
    </el-form>

    <div class="static-form-collab">
      <DocCollabPanel v-if="collabKey" :doc-key="collabKey" />
    </div>

    <template #footer>
      <el-button @click="open = false">Cancel</el-button>
      <el-button type="primary" @click="save">Save</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.static-form-number {
  width: 100%;
}
.static-form-number :deep(.el-input__inner) {
  text-align: right;
}
.static-form-collab {
  margin-top: 4px;
  padding-top: 18px;
  border-top: 1px solid var(--border-soft);
}
</style>
