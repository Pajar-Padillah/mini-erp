<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import TransactionFilterBar, { type TransactionFilterState } from '../../components/TransactionFilterBar.vue'
import DocActions from '../../components/doc-actions/DocActions.vue'
import RowActionsButton from '../../components/doc-actions/RowActionsButton.vue'
import type { DocAction, DocRef } from '../../components/doc-actions/docActionsData'
import StaticFormDialog from '../../components/static-form/StaticFormDialog.vue'
import { editableRows, keyProp, pageRows, type FormRow } from '../../components/static-form/staticForm'
import { docKey, useDocCollabStore } from '../../stores/docCollabStore'
import { ChatLineSquare } from '@element-plus/icons-vue'
import { formatMoney } from '../../utils/format'
import { matchesTransactionValue } from '../../utils/transactionFilters'
import { MASTER_DATA, type MasterColumn, type MasterKey } from './masterData'

const route = useRoute()

const masterKey = computed(() => route.meta.masterKey as MasterKey)
const config = computed(() => MASTER_DATA[masterKey.value])
/** Comments & attachments document type, e.g. "master-customers". */
const pageKey = computed(() => `master-${masterKey.value}`)
// Rows for the session: the mock rows plus anything created / edited in the form.
const rows = computed<FormRow[]>(() => pageRows(`master:${masterKey.value}`, config.value.rows))
const fields = computed(() => config.value.columns.map((c) => ({ label: c.label, value: c.prop })))

function emptyFilters(): TransactionFilterState {
  return { dateRange: [], status: [], secondaryStatus: [], conditions: [] }
}

const filters = ref<TransactionFilterState>(emptyFilters())
const page = ref(1)
const pageSize = 10

watch(() => route.meta.masterKey, () => {
  filters.value = emptyFilters()
  page.value = 1
})
watch(() => filters.value.conditions, () => {
  page.value = 1
}, { deep: true })

function display(row: Record<string, unknown>, column: MasterColumn): string {
  const value = row[column.prop]
  if (column.type === 'money') return formatMoney(Number(value))
  if (column.type === 'percent') return `${value}%`
  return String(value ?? '')
}

const filtered = computed(() =>
  rows.value.filter((row) =>
    filters.value.conditions.every((condition) => {
      const column = config.value.columns.find((c) => c.prop === condition.field)
      return column ? matchesTransactionValue(display(row, column), condition) : true
    }),
  ),
)
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

// Master records: edit, comments & attachments and the audit trail (no approval, journal or document flow).
const docActions = ref<InstanceType<typeof DocActions>>()
const rowActions: DocAction[] = ['edit', 'comments', 'audit']
function docOf(row: Record<string, unknown>): DocRef {
  const first = config.value.columns[0].prop
  const name = row.name ? ` · ${row.name}` : ''
  return {
    no: `${row[first] ?? ''}${name}`,
    type: config.value.title.replace(/ies$/, 'y').replace(/s$/, ''),
    collabKey: docKey(pageKey.value, String(row[first] ?? '')),
  }
}
const menuRow = ref<FormRow | null>(null)
function openRowMenu(event: MouseEvent, row: FormRow) {
  menuRow.value = row
  docActions.value?.openMenu(event, docOf(row))
}
function onRowContext(row: FormRow, _column: unknown, event: MouseEvent) {
  openRowMenu(event, row)
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
  const list = editableRows(`master:${masterKey.value}`, config.value.rows)
  const prop = keyProp(config.value)
  const index = original ? list.findIndex((r) => r === original || r[prop] === original[prop]) : -1
  if (index >= 0) list.splice(index, 1, row)
  else {
    list.unshift(row)
    filters.value = emptyFilters()
    page.value = 1
  }
}

// Small badge on the code when the record has comments / attachments.
const collab = useDocCollabStore()
function collabCount(row: FormRow): number {
  const key = docKey(pageKey.value, String(row[config.value.columns[0].prop] ?? ''))
  return collab.comments(key).length + collab.attachments(key).length
}
</script>

<template>
  <div class="page">
    <PageHeader :title="config.title">
      <template #actions>
        <el-button type="primary" @click="openCreate">{{ config.newLabel }}</el-button>
      </template>
    </PageHeader>

    <div class="card">
      <TransactionFilterBar
        :key="String(route.meta.masterKey)"
        v-model="filters"
        :fields="fields"
        :statuses="[]"
        hide-date
        @reset="filters = emptyFilters()"
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
            {{ display(row, column) }}
            <span
              v-if="column.prop === config.columns[0].prop && collabCount(row)"
              class="collab-badge"
              :title="`${collabCount(row)} comment(s) / attachment(s)`"
            >
              <el-icon><ChatLineSquare /></el-icon>{{ collabCount(row) }}
            </span>
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
    <StaticFormDialog v-model="formOpen" :config="config" :page-key="pageKey" :rows="rows" :row="editing" @save="onSave" />
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
