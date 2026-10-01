<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const props = defineProps<{
  page: number
  pageSize: number
  total: number
}>()
const emit = defineEmits<{ (e: 'update:page', value: number): void }>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1))
const to = computed(() => Math.min(props.page * props.pageSize, props.total))

function prev() {
  if (props.page > 1) emit('update:page', props.page - 1)
}
function next() {
  if (props.page < totalPages.value) emit('update:page', props.page + 1)
}
</script>

<template>
  <div class="pagination-bar">
    <div class="pagination-info">
      <i18n-t keypath="pagination.showing" tag="span">
        <template #from><b>{{ from }}</b></template>
        <template #to><b>{{ to }}</b></template>
        <template #total><b>{{ total }}</b></template>
      </i18n-t>
    </div>
    <div class="pagination-controls">
      <el-button size="small" :disabled="page <= 1" @click="prev">{{ t('pagination.previous') }}</el-button>
      <span class="pagination-page">{{ t('pagination.page', { page, totalPages }) }}</span>
      <el-button size="small" :disabled="page >= totalPages" @click="next">{{ t('pagination.next') }}</el-button>
    </div>
  </div>
</template>
