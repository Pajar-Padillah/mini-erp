<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Close, Refresh, RefreshLeft, Search } from '@element-plus/icons-vue'

export interface TransactionFilterOption {
  label: string
  value: string
  color?: string
}

export interface TransactionFilterCondition {
  field: string
  operator: 'like' | 'not like' | '=' | '!=' | '<' | '>' | '>=' | '<='
  value: string
}

export interface TransactionFilterState {
  dateRange: string[]
  status: string[]
  secondaryStatus: string[]
  conditions: TransactionFilterCondition[]
}

const props = defineProps<{
  modelValue: TransactionFilterState
  fields: TransactionFilterOption[]
  statuses: TransactionFilterOption[]
  secondaryStatuses?: TransactionFilterOption[]
  secondaryStatusLabel?: string
  loading?: boolean
  hideDate?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: TransactionFilterState]
  reset: []
  refresh: []
}>()

const operators: { label: string; value: TransactionFilterCondition['operator'] }[] = [
  { label: 'like', value: 'like' },
  { label: 'not like', value: 'not like' },
  { label: '=', value: '=' },
  { label: '!=', value: '!=' },
  { label: '<', value: '<' },
  { label: '>', value: '>' },
  { label: '>=', value: '>=' },
  { label: '<=', value: '<=' },
]
const operatorText: Record<TransactionFilterCondition['operator'], string> = {
  like: 'contains',
  'not like': 'not contains',
  '=': '=',
  '!=': '≠',
  '<': '<',
  '>': '>',
  '>=': '≥',
  '<=': '≤',
}

// Same palette as StatusTag / PaymentStatusTag.
const statusColors: Record<string, string> = {
  DRAFT: 'gray',
  ACTIVE: 'blue',
  PROCESSED: 'amber',
  COMPLETED: 'green',
  SUBMITTED: 'green',
  UNPAID: 'red',
  PARTIALLY_PAID: 'amber',
  PAID: 'green',
}

function startOfDay(offsetDays = 0) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  return date
}

const dateShortcuts = [
  { text: 'Today', value: () => [startOfDay(), startOfDay()] },
  { text: 'Last 7 days', value: () => [startOfDay(-6), startOfDay()] },
  { text: 'Last 30 days', value: () => [startOfDay(-29), startOfDay()] },
  {
    text: 'This month',
    value: () => {
      const today = startOfDay()
      return [new Date(today.getFullYear(), today.getMonth(), 1), today]
    },
  },
  {
    text: 'Last month',
    value: () => {
      const today = startOfDay()
      return [new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 0)]
    },
  },
]

const draft = ref<TransactionFilterCondition>({ field: props.fields[0]?.value ?? '', operator: 'like', value: '' })
const draftFieldLabel = computed(() => fieldLabel(draft.value.field))

const appliedConditions = computed(() =>
  props.modelValue.conditions
    .map((condition, index) => ({ ...condition, index }))
    .filter((condition) => condition.value.trim()),
)

function fieldLabel(value: string) {
  return props.fields.find((option) => option.value === value)?.label ?? value
}

function update<K extends keyof TransactionFilterState>(key: K, value: TransactionFilterState[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function toggleStatus(key: 'status' | 'secondaryStatus', value: string) {
  const selected = props.modelValue[key]
  update(key, selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])
}

function applySearch() {
  const value = draft.value.value.trim()
  if (!value) return
  const exists = props.modelValue.conditions.some(
    (condition) =>
      condition.field === draft.value.field && condition.operator === draft.value.operator && condition.value.trim() === value,
  )
  if (!exists) update('conditions', [...props.modelValue.conditions, { ...draft.value, value }])
  draft.value.value = ''
}

function removeCondition(index: number) {
  update('conditions', props.modelValue.conditions.filter((_, conditionIndex) => conditionIndex !== index))
}
</script>

<template>
  <div class="tf">
    <div class="tf-toolbar">
      <form class="tf-search" role="search" @submit.prevent="applySearch">
        <el-select v-model="draft.field" class="tf-search-field" aria-label="Search field">
          <el-option v-for="field in fields" :key="field.value" :label="field.label" :value="field.value" />
        </el-select>
        <span class="tf-divider" aria-hidden="true" />
        <el-select v-model="draft.operator" class="tf-search-operator" aria-label="Operator">
          <el-option v-for="op in operators" :key="op.value" :label="op.label" :value="op.value" />
        </el-select>
        <span class="tf-divider" aria-hidden="true" />
        <el-input
          v-model="draft.value"
          class="tf-search-input"
          :prefix-icon="Search"
          :placeholder="`Search ${draftFieldLabel.toLowerCase()}…`"
          clearable
          @keydown.enter.prevent="applySearch"
        />
        <button type="submit" class="tf-search-submit" :disabled="!draft.value.trim()">
          Add filter
          <kbd>↵</kbd>
        </button>
      </form>

      <el-date-picker
        v-if="!hideDate"
        :model-value="modelValue.dateRange"
        type="daterange"
        value-format="YYYY-MM-DD"
        format="DD MMM YYYY"
        range-separator="–"
        start-placeholder="Start date"
        end-placeholder="End date"
        :shortcuts="dateShortcuts"
        unlink-panels
        clearable
        class="tf-date"
        @update:model-value="update('dateRange', $event ?? [])"
      />

      <div v-if="$slots.actions" class="tf-actions">
        <slot name="actions" />
      </div>

      <el-tooltip content="Reset all filters to default" placement="top">
        <button type="button" class="tf-reset-btn" @click="emit('reset')">
          <el-icon><RefreshLeft /></el-icon>
          Reset
        </button>
      </el-tooltip>

      <el-tooltip content="Refresh data" placement="top">
        <button type="button" class="tf-icon-btn" :class="{ 'is-loading': loading }" aria-label="Refresh data" @click="emit('refresh')">
          <el-icon><Refresh /></el-icon>
        </button>
      </el-tooltip>

    </div>

    <div v-if="statuses.length || secondaryStatuses?.length" class="tf-quick">
      <div class="tf-group" role="group" aria-label="Status">
        <span class="tf-group-label">Status</span>
        <button
          type="button"
          class="tf-pill"
          :class="{ 'is-selected': !modelValue.status.length }"
          :aria-pressed="!modelValue.status.length"
          @click="update('status', [])"
        >
          All
        </button>
        <button
          v-for="option in statuses"
          :key="option.value"
          type="button"
          class="tf-pill"
          :class="[option.color ?? statusColors[option.value] ?? 'gray', { 'is-selected': modelValue.status.includes(option.value) }]"
          :aria-pressed="modelValue.status.includes(option.value)"
          @click="toggleStatus('status', option.value)"
        >
          <el-icon v-if="modelValue.status.includes(option.value)" class="tf-pill-check"><Check /></el-icon>
          <span v-else class="tf-pill-dot" />
          {{ option.label }}
        </button>
      </div>

      <div v-if="secondaryStatuses?.length" class="tf-group" role="group" :aria-label="secondaryStatusLabel ?? 'Payment'">
        <span class="tf-group-label">{{ secondaryStatusLabel ?? 'Payment' }}</span>
        <button
          type="button"
          class="tf-pill"
          :class="{ 'is-selected': !modelValue.secondaryStatus.length }"
          :aria-pressed="!modelValue.secondaryStatus.length"
          @click="update('secondaryStatus', [])"
        >
          All
        </button>
        <button
          v-for="option in secondaryStatuses"
          :key="option.value"
          type="button"
          class="tf-pill"
          :class="[
            option.color ?? statusColors[option.value] ?? 'gray',
            { 'is-selected': modelValue.secondaryStatus.includes(option.value) },
          ]"
          :aria-pressed="modelValue.secondaryStatus.includes(option.value)"
          @click="toggleStatus('secondaryStatus', option.value)"
        >
          <el-icon v-if="modelValue.secondaryStatus.includes(option.value)" class="tf-pill-check"><Check /></el-icon>
          <span v-else class="tf-pill-dot" />
          {{ option.label }}
        </button>
      </div>
    </div>

    <div v-if="appliedConditions.length" class="tf-applied" aria-label="Applied filters">
      <span class="tf-group-label">Filtered by</span>
      <span
        v-for="condition in appliedConditions"
        :key="condition.index"
        class="tf-chip"
        :title="`${fieldLabel(condition.field)} ${operatorText[condition.operator]} ${condition.value}`"
      >
        <span class="tf-chip-field">{{ fieldLabel(condition.field) }}</span>
        <span class="tf-chip-op">{{ operatorText[condition.operator] }}</span>
        <span class="tf-chip-value">{{ condition.value }}</span>
        <button
          type="button"
          :aria-label="`Remove filter: ${fieldLabel(condition.field)} ${condition.value}`"
          @click="removeCondition(condition.index)"
        >
          <el-icon><Close /></el-icon>
        </button>
      </span>
      <button type="button" class="tf-clear" @click="update('conditions', [])">Clear all</button>
    </div>
  </div>
</template>
