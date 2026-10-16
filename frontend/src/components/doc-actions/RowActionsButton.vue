<script setup lang="ts">
// The ⋯ button in a list's Actions column.
import { MoreFilled } from '@element-plus/icons-vue'

defineProps<{ label: string }>()
const emit = defineEmits<{ open: [event: MouseEvent] }>()
</script>

<template>
  <button type="button" class="row-actions-btn" :aria-label="`Actions for ${label}`" aria-haspopup="menu" title="Actions" @click.stop="emit('open', $event)">
    <el-icon><MoreFilled /></el-icon>
  </button>
</template>
