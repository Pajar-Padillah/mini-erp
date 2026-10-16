<script setup lang="ts">
// Ranked horizontal bars (rankings, funnels): long labels stay readable and every value is
// labeled directly at the bar end, so no tooltip is needed to read it.
import { computed } from 'vue'
import { SERIES_COLORS, formatCompact, formatValue, type ChartDatum, type ValueKind } from './chartUtils'

const props = withDefaults(defineProps<{ data: ChartDatum[]; kind?: ValueKind; showShare?: boolean }>(), {
  kind: 'number',
  showShare: false,
})

const max = computed(() => Math.max(...props.data.map((d) => d.value), 0) || 1)
const first = computed(() => props.data[0]?.value || 1)
const rows = computed(() =>
  props.data.map((d) => ({
    ...d,
    width: `${Math.max((d.value / max.value) * 100, 1.5)}%`,
    color: d.color ?? SERIES_COLORS[0],
    // For funnels: conversion relative to the first step.
    share: `${Math.round((d.value / first.value) * 100)}%`,
  })),
)
</script>

<template>
  <ul class="hbar" role="list">
    <li v-for="row in rows" :key="row.label" class="hbar-row" :title="`${row.label}: ${formatValue(row.value, kind)}`">
      <span class="hbar-label">{{ row.label }}</span>
      <span class="hbar-track">
        <span class="hbar-fill" :style="{ width: row.width, background: row.color }" />
      </span>
      <span class="hbar-value">
        {{ formatCompact(row.value, kind) }}
        <span v-if="showShare" class="hbar-share">{{ row.share }}</span>
      </span>
    </li>
  </ul>
</template>
