<script setup lang="ts">
// Summary card on detail pages: same look as the dashboard KPI cards, with an icon bubble
// and an optional link value (e.g. the source document).
import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

withDefaults(
  defineProps<{ label: string; value: string; hint?: string; icon?: Component; tone?: 'blue' | 'green' | 'amber' | 'red' | 'gray'; to?: RouteLocationRaw }>(),
  { tone: 'blue' },
)
</script>

<template>
  <div class="detail-stat">
    <div class="detail-stat-body">
      <div class="dash-kpi-label">{{ label }}</div>
      <router-link v-if="to" :to="to" class="dash-kpi-value detail-stat-link" :title="value">{{ value }}</router-link>
      <div v-else class="dash-kpi-value" :title="value">{{ value }}</div>
      <div v-if="hint" class="dash-kpi-hint">{{ hint }}</div>
    </div>
    <span v-if="icon" class="detail-stat-icon" :class="tone"><el-icon><component :is="icon" /></el-icon></span>
  </div>
</template>
