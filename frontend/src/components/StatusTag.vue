<script setup lang="ts">
import { computed } from 'vue'
import type { DocumentStatus } from '../types/common'

const props = defineProps<{ status: DocumentStatus }>()

const color = computed(() => {
  switch (props.status) {
    case 'DRAFT':
      return 'gray'
    case 'ACTIVE':
      return 'blue'
    case 'PROCESSED':
      return 'amber'
    case 'COMPLETED':
    case 'SUBMITTED':
      return 'green'
    default:
      return 'gray'
  }
})
</script>

<template>
  <span class="status-pill" :class="color">{{ status }}</span>
</template>
