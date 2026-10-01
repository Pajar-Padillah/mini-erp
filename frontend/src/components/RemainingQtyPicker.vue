<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney, formatQty } from '../utils/format'

const { t } = useI18n()

export interface PickerRow {
  sourceItemId: number
  productName: string
  available: string
  unitPrice?: string
}

const props = defineProps<{
  rows: PickerRow[]
  modelValue: Record<number, string>
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: Record<number, string>): void }>()

function onQtyChange(sourceItemId: number, value: string | number) {
  emit('update:modelValue', { ...props.modelValue, [sourceItemId]: String(value) })
}

const hasPrice = computed(() => props.rows.some((row) => row.unitPrice !== undefined))
function rowTotal(row: PickerRow) {
  return Number(props.modelValue[row.sourceItemId] ?? 0) * Number(row.unitPrice ?? 0)
}
const grandTotal = computed(() => props.rows.reduce((sum, row) => sum + rowTotal(row), 0))
</script>

<template>
  <div>
    <el-table :data="rows" size="small" border :empty-text="t('pickers.remainingEmpty')">
      <el-table-column prop="productName" :label="t('common.product')" />
      <el-table-column :label="t('common.remaining')" width="140">
        <template #default="{ row }">{{ formatQty(row.available) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.qty')" width="180">
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
      <el-table-column v-if="hasPrice" :label="t('common.price')" width="160" align="right">
        <template #default="{ row }">{{ formatMoney(row.unitPrice ?? 0) }}</template>
      </el-table-column>
      <el-table-column v-if="hasPrice" :label="t('common.total')" width="160" align="right">
        <template #default="{ row }">{{ formatMoney(rowTotal(row)) }}</template>
      </el-table-column>
    </el-table>

    <div v-if="hasPrice" class="grand-total">
      <span class="grand-total-label">{{ t('pickers.grandTotal') }}</span>
      <span class="grand-total-value">{{ formatMoney(grandTotal) }}</span>
    </div>
  </div>
</template>
