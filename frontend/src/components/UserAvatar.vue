<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name?: string }>(), { name: 'Pajar Padillah' })

const initials = computed(() =>
  props.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join(''),
)
</script>

<template>
  <div class="user-avatar">
    <el-avatar class="user-avatar-initials" :size="36">{{ initials }}</el-avatar>
    <span class="user-avatar-name">{{ name }}</span>
  </div>
</template>
