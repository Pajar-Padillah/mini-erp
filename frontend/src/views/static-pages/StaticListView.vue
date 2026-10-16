<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import TransactionFilterBar, { type TransactionFilterState } from '../../components/TransactionFilterBar.vue'
import DocActions from '../../components/doc-actions/DocActions.vue'
import RowActionsButton from '../../components/doc-actions/RowActionsButton.vue'
import { ALL_DOC_ACTIONS, type DocAction, type DocRef } from '../../components/doc-actions/docActionsData'
import StaticFormDialog from '../../components/static-form/StaticFormDialog.vue'
import { editableRows, keyProp, pageRows, type FormRow } from '../../components/static-form/staticForm'
import { docKey, useDocCollabStore } from '../../stores/docCollabStore'
import { ChatLineSquare } from '@element-plus/icons-vue'
import { formatMoney } from '../../utils/format'
import { currentMonthRange, matchesTransactionDate, matchesTransactionValue } from '../../utils/transactionFilters'
import { STATIC_PAGES } from './registry'
import { DEFAULT_STATUS_COLORS, type StaticColumn, type StaticPageConfig, type StaticStatusOption } from './types'

const route = useRoute()

const pageKey = computed(() => String(route.meta.staticKey ?? ''))
const config = computed(() => STATIC_PAGES[pageKey.value] as StaticPageConfig | undefined)
// Rows of this page for the session: the mock rows plus anything created / edited in the form.
const rows = computed<FormRow[]>(() => (config.value ? pageRows(`static:${pageKey.value}`, config.value.rows) : []))
const fields = computed(() => (config.value?.columns ?? []).map((c) => ({ label: c.label, value: c.prop })))
const statuses = computed(() => (config.value?.statusProp ? config.value.statuses ?? [] : []))
const secondaryStatuses = computed(() => (config.value?.secondaryStatusProp ? config.value.secondaryStatuses ?? [] : []))

function defaultFilters(): TransactionFilterState {
  return {
    dateRange: config.value?.dateProp ? currentMonthRange() : [],
    status: [],
    secondaryStatus: [],
    conditions: [],
  }
}

const filters = ref<TransactionFilterState>(defaultFilters())
const page = ref(1)
const pageSize = 10

watch(() => route.meta.staticKey, () => {
  filters.value = defaultFilters()
  page.value = 1
})
watch(filters, () => {
  page.value = 1
}, { deep: true })

function statusOption(column: StaticColumn, value: unknown): StaticStatusOption | undefined {
  const options = column.type === 'secondary_status' ? secondaryStatuses.value : config.value?.statuses
  return options?.find((o) => o.value === value)
}

function statusColor(column: StaticColumn, value: unknown): string {
  return statusOption(column, value)?.color ?? DEFAULT_STATUS_COLORS[String(value)] ?? 'gray'
}

function display(row: Record<string, unknown>, column: StaticColumn): string {
  const value = row[column.prop]
  if (column.type === 'money') return formatMoney(Number(value))
  if (column.type === 'number') return Number(value).toLocaleString('id-ID')
  if (column.type === 'percent') return `${value}%`
  if (column.type === 'status' || column.type === 'secondary_status') return statusOption(column, value)?.label ?? String(value ?? '')
  return String(value ?? '')
}

const filtered = computed(() => {
  if (!config.value) return []
  const { dateProp, statusProp, secondaryStatusProp, columns } = config.value
  const { dateRange, status, secondaryStatus, conditions } = filters.value
  return rows.value.filter((row) => {
    if (dateProp && !matchesTransactionDate(String(row[dateProp] ?? ''), dateRange)) return false
    if (statusProp && status.length && !status.includes(String(row[statusProp]))) return false
    if (secondaryStatusProp && secondaryStatus.length && !secondaryStatus.includes(String(row[secondaryStatusProp]))) return false
    return conditions.every((condition) => {
      const column = columns.find((c) => c.prop === condition.field)
      return column ? matchesTransactionValue(display(row, column), condition) : true
    })
  })
})
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

// Row actions: documents with a status get the full set; other pages (master/setup)
// only the audit trail; pure report pages (KPI cards, no "+ New") get none.
const docActions = ref<InstanceType<typeof DocActions>>()
const rowActions = computed<DocAction[]>(() => {
  const c = config.value
  if (!c) return []
  // Pages with a "+ New" button have a form: they can be edited and carry comments & attachments.
  const form: DocAction[] = c.newLabel ? ['edit', 'comments'] : []
  if (c.statusProp) return [...form, ...ALL_DOC_ACTIONS.filter((a) => a !== 'comments')]
  return c.newLabel ? [...form, 'audit'] : []
})
function docOf(row: Record<string, unknown>): DocRef {
  const c = config.value!
  const moneyCol = c.columns.find((col) => col.type === 'money')
  return {
    no: String(row[c.columns[0].prop] ?? ''),
    type: c.title.replace(/ies$/, 'y').replace(/s$/, ''),
    status: c.statusProp ? String(row[c.statusProp] ?? '') : undefined,
    amount: moneyCol ? Number(row[moneyCol.prop]) : undefined,
    date: c.dateProp ? String(row[c.dateProp] ?? '') : undefined,
    collabKey: docKey(pageKey.value, String(row[c.columns[0].prop] ?? '')),
  }
}
const menuRow = ref<FormRow | null>(null)
function openRowMenu(event: MouseEvent, row: FormRow) {
  menuRow.value = row
  docActions.value?.openMenu(event, docOf(row))
}
function onRowContext(row: FormRow, _column: unknown, event: MouseEvent) {
  if (rowActions.value.length) openRowMenu(event, row)
}

// ---------- Create / edit form (with comments & attachments)
const formOpen = ref(false)
const editing = ref<FormRow | null>(null)
function openCreate() {
  editing.value = null
  formOpen.value = true
}
function openEdit() {
  editing.value = menuRow.value
  formOpen.value = true
}
function onSave(row: FormRow, original: FormRow | null) {
  if (!config.value) return
  const list = editableRows(`static:${pageKey.value}`, config.value.rows)
  const prop = keyProp(config.value)
  const index = original ? list.findIndex((r) => r === original || r[prop] === original[prop]) : -1
  if (index >= 0) list.splice(index, 1, row)
  else list.unshift(row)
  if (!original) {
    // Show the new document: clear filters that would hide it and go to the first page.
    filters.value = defaultFilters()
    page.value = 1
  }
}

// Small badge on the document number when it has comments / attachments.
const collab = useDocCollabStore()
function collabCount(row: FormRow): number {
  const key = docKey(pageKey.value, String(row[config.value?.columns[0].prop ?? ''] ?? ''))
  return collab.comments(key).length + collab.attachments(key).length
}
</script>

<template>
  <div v-if="!config" class="page">
    <PageHeader :title="String(route.meta.title ?? '')" />
    <div class="card">Data is not available yet.</div>
  </div>
  <div v-else class="page">
    <PageHeader :title="config.title">
      <template v-if="config.newLabel" #actions>
        <el-button type="primary" @click="openCreate">{{ config.newLabel }}</el-button>
      </template>
    </PageHeader>

    <div v-if="config.stats?.length" class="static-stats">
      <div v-for="stat in config.stats" :key="stat.label" class="card static-stat">
        <div class="static-stat-label">{{ stat.label }}</div>
        <div class="static-stat-value">{{ stat.value }}</div>
        <div v-if="stat.hint" class="static-stat-hint">{{ stat.hint }}</div>
      </div>
    </div>

    <div class="card">
      <TransactionFilterBar
        :key="String(route.meta.staticKey)"
        v-model="filters"
        :fields="fields"
        :statuses="statuses"
        :secondary-statuses="secondaryStatuses"
        :secondary-status-label="config.secondaryStatusLabel"
        :hide-date="!config.dateProp"
        @reset="filters = defaultFilters()"
        @refresh="() => {}"
      />

      <el-table :data="paged" @row-contextmenu="onRowContext">
        <el-table-column
          v-for="column in config.columns"
          :key="column.prop"
          :label="column.label"
          :min-width="column.minWidth"
          :width="column.width"
          :align="column.align"
        >
          <template #default="{ row }">
            <span
              v-if="column.type === 'status' || column.type === 'secondary_status'"
              class="status-pill"
              :class="statusColor(column, row[column.prop])"
            >
              {{ String(row[column.prop]) }}
            </span>
            <template v-else>
              {{ display(row, column) }}
              <span
                v-if="config.newLabel && column.prop === config.columns[0].prop && collabCount(row)"
                class="collab-badge"
                :title="`${collabCount(row)} comment(s) / attachment(s)`"
              >
                <el-icon><ChatLineSquare /></el-icon>{{ collabCount(row) }}
              </span>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="rowActions.length" label="" width="56" align="center" fixed="right" class-name="row-actions-col">
          <template #default="{ row }">
            <RowActionsButton :label="docOf(row).no" @open="(e: MouseEvent) => openRowMenu(e, row)" />
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar v-model:page="page" :page-size="pageSize" :total="filtered.length" />
    </div>
    <DocActions ref="docActions" :actions="rowActions" @edit="openEdit" />
    <StaticFormDialog
      v-if="config.newLabel"
      v-model="formOpen"
      :config="config"
      :page-key="pageKey"
      :rows="rows"
      :row="editing"
      @save="onSave"
    />
  </div>
</template>

<style scoped>
.collab-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 18px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  vertical-align: middle;
}
</style>
