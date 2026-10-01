<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '../utils/format'

const { t } = useI18n()

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
      <el-table-column prop="invoiceNo" :label="t('pickers.invoice')" width="220" />
      <el-table-column :label="t('pickers.outstanding')" width="160">
        <template #default="{ row }">{{ formatMoney(row.outstanding) }}</template>
      </el-table-column>
      <el-table-column :label="t('pickers.allocateAmount')">
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
      <span class="grand-total-label">{{ t('pickers.totalAllocated') }}</span>
      <span class="grand-total-value">{{ formatMoney(totalAllocated) }}</span>
    </div>
  </div>
</template>
