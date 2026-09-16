<script setup lang="ts">
import { computed } from 'vue'

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
    <div class="pagination-info">Showing <b>{{ from }}</b>–<b>{{ to }}</b> of <b>{{ total }}</b></div>
    <div class="pagination-controls">
      <el-button size="small" :disabled="page <= 1" @click="prev">Previous</el-button>
      <span class="pagination-page">Page {{ page }} of {{ totalPages }}</span>
      <el-button size="small" :disabled="page >= totalPages" @click="next">Next</el-button>
    </div>
  </div>
</template>
