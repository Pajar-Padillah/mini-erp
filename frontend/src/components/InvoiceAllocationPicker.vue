<script setup lang="ts">
import { computed } from 'vue'
import { formatMoney } from '../utils/format'

export interface AllocationRow {
  invoiceId: number
  invoiceNo: string
  outstanding: string
}

const props = defineProps<{
  rows: AllocationRow[]
  modelValue: Record<number, string>
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: Record<number, string>): void }>()

function onAmountChange(invoiceId: number, value: string | number) {
  emit('update:modelValue', { ...props.modelValue, [invoiceId]: String(value) })
}

const totalAllocated = computed(() =>
  props.rows.reduce((sum, row) => sum + Number(props.modelValue[row.invoiceId] ?? 0), 0),
)
</script>

<template>
  <div>
    <el-table :data="rows" size="small" border>
      <el-table-column prop="invoiceNo" label="Invoice" width="220" />
      <el-table-column label="Outstanding" width="160">
        <template #default="{ row }">{{ formatMoney(row.outstanding) }}</template>
      </el-table-column>
      <el-table-column label="Allocate amount">
        <template #default="{ row }">
          <el-input-number
            :model-value="Number(modelValue[row.invoiceId] ?? 0)"
            :min="0"
            :max="Math.max(Number(row.outstanding), Number(modelValue[row.invoiceId] ?? 0))"
            :step="1000"
            size="small"
            :controls="false"
            style="width: 100%"
            @update:model-value="onAmountChange(row.invoiceId, $event ?? 0)"
          />
        </template>
      </el-table-column>
    </el-table>

    <div v-if="rows.length" class="grand-total">
      <span class="grand-total-label">Total Allocated</span>
      <span class="grand-total-value">{{ formatMoney(totalAllocated) }}</span>
    </div>
  </div>
</template>
