<script setup lang="ts">
import { computed } from 'vue'
import type { PaymentStatus } from '../types/common'

const props = defineProps<{ status: PaymentStatus }>()

const color = computed(() => {
  switch (props.status) {
    case 'UNPAID':
      return 'red'
    case 'PARTIALLY_PAID':
      return 'amber'
    case 'PAID':
      return 'green'
    default:
      return 'gray'
  }
})
</script>

<template>
  <span class="status-pill" :class="color">{{ status }}</span>
</template>
