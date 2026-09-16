<script setup lang="ts">
import { formatQty } from '../utils/format'

export interface PickerRow {
  sourceItemId: number
  productName: string
  available: string
}

const props = defineProps<{
  rows: PickerRow[]
  modelValue: Record<number, string>
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: Record<number, string>): void }>()

function onQtyChange(sourceItemId: number, value: string | number) {
  emit('update:modelValue', { ...props.modelValue, [sourceItemId]: String(value) })
}
</script>

<template>
  <el-table :data="rows" size="small" border empty-text="Nothing left to pull -- every line has already been fully pulled.">
    <el-table-column prop="productName" label="Product" />
    <el-table-column label="Remaining" width="140">
      <template #default="{ row }">{{ formatQty(row.available) }}</template>
    </el-table-column>
    <el-table-column label="Qty" width="180">
      <template #default="{ row }">
        <el-input-number
          :model-value="Number(modelValue[row.sourceItemId] ?? 0)"
          :min="0"
          :max="Math.max(Number(row.available), Number(modelValue[row.sourceItemId] ?? 0))"
          :step="1"
          :controls="false"
          size="small"
          style="width: 100%"
          @update:model-value="onQtyChange(row.sourceItemId, $event ?? 0)"
        />
      </template>
    </el-table-column>
  </el-table>
</template>
