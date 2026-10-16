<script setup lang="ts">
// Single-series vertical bar chart: thin bars, hairline grid, per-bar hover tooltip.
import { computed, ref } from 'vue'
import { SERIES_COLORS, formatCompact, formatValue, niceTicks, roundedTopBar, useElementWidth, type ChartDatum, type ValueKind } from './chartUtils'

const props = withDefaults(defineProps<{ data: ChartDatum[]; kind?: ValueKind; height?: number }>(), {
  kind: 'number',
  height: 220,
})

const root = ref<HTMLElement>()
const width = useElementWidth(root)
const active = ref<number | null>(null)

const PAD = { top: 12, right: 8, bottom: 28, left: 64 }
const ticks = computed(() => niceTicks(Math.max(...props.data.map((d) => d.value), 0)))
const max = computed(() => ticks.value[ticks.value.length - 1])
const plotW = computed(() => Math.max(width.value - PAD.left - PAD.right, 40))
const plotH = computed(() => props.height - PAD.top - PAD.bottom)
const baseline = computed(() => PAD.top + plotH.value)
const band = computed(() => plotW.value / Math.max(props.data.length, 1))
const barW = computed(() => Math.min(32, band.value * 0.56))
const y = (v: number) => PAD.top + plotH.value * (1 - v / max.value)

const bars = computed(() =>
  props.data.map((d, i) => {
    const x = PAD.left + i * band.value + (band.value - barW.value) / 2
    const top = y(d.value)
    const maxChars = Math.max(3, Math.floor(band.value / 6.5))
    return {
      ...d,
      i,
      x,
      top,
      path: roundedTopBar(x, top, barW.value, baseline.value),
      center: x + barW.value / 2,
      shortLabel: d.label.length > maxChars ? `${d.label.slice(0, maxChars - 1)}…` : d.label,
      color: d.color ?? SERIES_COLORS[0],
    }
  }),
)
const tip = computed(() => (active.value == null ? null : bars.value[active.value]))
</script>

<template>
  <div ref="root" class="chart" :style="{ height: `${height}px` }">
    <svg :width="width" :height="height" role="img" :aria-label="data.map((d) => `${d.label}: ${formatValue(d.value, kind)}`).join(', ')">
      <g class="chart-grid">
        <g v-for="t in ticks" :key="t">
          <line :x1="PAD.left" :x2="width - PAD.right" :y1="y(t)" :y2="y(t)" />
          <text :x="PAD.left - 8" :y="y(t)" dy="0.32em" text-anchor="end">{{ formatCompact(t, kind) }}</text>
        </g>
      </g>
      <g v-for="b in bars" :key="b.label">
        <path :d="b.path" :fill="b.color" :class="{ 'is-dim': active != null && active !== b.i }" class="chart-bar" />
        <text class="chart-axis-label" :x="b.center" :y="baseline + 18" text-anchor="middle">
          <title>{{ b.label }}</title>{{ b.shortLabel }}
        </text>
        <!-- Hit target covers the whole band, not just the bar. -->
        <rect
          class="chart-hit"
          :x="PAD.left + b.i * band"
          :y="PAD.top"
          :width="band"
          :height="plotH"
          tabindex="0"
          @mouseenter="active = b.i"
          @mouseleave="active = null"
          @focus="active = b.i"
          @blur="active = null"
        />
      </g>
    </svg>
    <div v-if="tip" class="chart-tooltip" :style="{ left: `${tip.center}px`, top: `${tip.top - 8}px` }">
      <div class="chart-tooltip-label">{{ tip.label }}</div>
      <div class="chart-tooltip-value">{{ formatValue(tip.value, kind) }}</div>
    </div>
  </div>
</template>
