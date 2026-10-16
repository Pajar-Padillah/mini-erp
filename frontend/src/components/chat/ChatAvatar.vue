<script setup lang="ts">
import { computed } from 'vue'
import { ChatLineRound } from '@element-plus/icons-vue'
import type { Presence } from '../../stores/chatStore'
import { avatarTone, initials } from './chatFormat'

const props = withDefaults(defineProps<{ name: string; group?: boolean; presence?: Presence; size?: number }>(), {
  group: false,
  presence: undefined,
  size: 40,
})

const tone = computed(() => avatarTone(props.name))
</script>

<template>
  <span class="chat-avatar" :class="[`tone-${tone}`, { 'is-group': group }]" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.36)}px` }">
    <el-icon v-if="group"><ChatLineRound /></el-icon>
    <template v-else>{{ initials(name) }}</template>
    <span v-if="presence" class="chat-presence" :class="`is-${presence}`" :title="presence" />
  </span>
</template>
