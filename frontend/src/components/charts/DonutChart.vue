<script setup lang="ts">
// Part-to-whole donut (≤ 4-5 segments) with 2px gaps, total in the center and a legend that
// always shows label, value and share — so identity never relies on color alone.
import { computed, ref } from 'vue'
import { SERIES_COLORS, formatCompact, formatValue, type ChartDatum, type ValueKind } from './chartUtils'

const props = withDefaults(defineProps<{ data: ChartDatum[]; kind?: ValueKind; centerLabel?: string }>(), {
  kind: 'number',
  centerLabel: 'Total',
})

const SIZE = 168
const R = 74
const STROKE = 22
const active = ref<number | null>(null)

const total = computed(() => props.data.reduce((sum, d) => sum + d.value, 0))
const segments = computed(() => {
  const circumference = 2 * Math.PI * R
  const gap = props.data.filter((d) => d.value > 0).length > 1 ? 2 : 0
  let offset = 0
  return props.data.map((d, i) => {
    const share = total.value ? d.value / total.value : 0
    const length = Math.max(share * circumference - gap, 0)
    const seg = {
      ...d,
      i,
      share,
      color: d.color ?? SERIES_COLORS[i % SERIES_COLORS.length],
      dash: `${length} ${circumference - length}`,
      offset: -offset,
    }
    offset += share * circumference
    return seg
  })
})
const focus = computed(() => (active.value == null ? null : segments.value[active.value]))
const pct = (share: number) => `${(share * 100).toLocaleString('id-ID', { maximumFractionDigits: 0 })}%`
</script>

<template>
  <div class="donut">
    <div class="donut-figure">
      <svg :width="SIZE" :height="SIZE" :viewBox="`0 0 ${SIZE} ${SIZE}`" role="img" :aria-label="data.map((d) => `${d.label}: ${formatValue(d.value, kind)}`).join(', ')">
        <g :transform="`rotate(-90 ${SIZE / 2} ${SIZE / 2})`">
          <circle :cx="SIZE / 2" :cy="SIZE / 2" :r="R" fill="none" stroke="#eaf0f5" :stroke-width="STROKE" />
          <circle
            v-for="s in segments"
            :key="s.label"
            class="donut-segment"
            :class="{ 'is-dim': active != null && active !== s.i }"
            :cx="SIZE / 2"
            :cy="SIZE / 2"
            :r="R"
            fill="none"
            :stroke="s.color"
            :stroke-width="active === s.i ? STROKE + 4 : STROKE"
            :stroke-dasharray="s.dash"
            :stroke-dashoffset="s.offset"
            @mouseenter="active = s.i"
            @mouseleave="active = null"
          />
        </g>
      </svg>
      <div class="donut-center">
        <div class="donut-center-value">{{ formatCompact(focus ? focus.value : total, kind) }}</div>
        <div class="donut-center-label">{{ focus ? focus.label : centerLabel }}</div>
      </div>
    </div>
    <ul class="donut-legend">
      <li
        v-for="s in segments"
        :key="s.label"
        :class="{ 'is-active': active === s.i }"
        @mouseenter="active = s.i"
        @mouseleave="active = null"
      >
        <span class="donut-legend-swatch" :style="{ background: s.color }" />
        <span class="donut-legend-label">{{ s.label }}</span>
        <span class="donut-legend-value">{{ formatCompact(s.value, kind) }}</span>
        <span class="donut-legend-share">{{ pct(s.share) }}</span>
      </li>
    </ul>
  </div>
</template>
