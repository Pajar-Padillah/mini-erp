<script setup lang="ts">
// Single-series trend line: 2px line, soft area, crosshair + tooltip on hover, last point labeled.
import { computed, ref } from 'vue'
import { SERIES_COLORS, formatCompact, formatValue, niceTicks, useElementWidth, type ChartDatum, type ValueKind } from './chartUtils'

const props = withDefaults(defineProps<{ data: ChartDatum[]; kind?: ValueKind; height?: number; minZero?: boolean }>(), {
  kind: 'number',
  height: 220,
  minZero: true,
})

const root = ref<HTMLElement>()
const width = useElementWidth(root)
const active = ref<number | null>(null)
const color = SERIES_COLORS[0]

const PAD = { top: 16, right: 16, bottom: 28, left: 64 }
const values = computed(() => props.data.map((d) => d.value))
// Percent trends (e.g. attendance 94-97%) read better on a zoomed axis than from zero.
const floor = computed(() => {
  if (props.minZero) return 0
  const min = Math.min(...values.value)
  const span = Math.max(...values.value) - min || 1
  return Math.max(0, Math.floor(min - span * 0.6))
})
const ticks = computed(() => niceTicks(Math.max(...values.value) - floor.value).map((t) => t + floor.value))
const max = computed(() => ticks.value[ticks.value.length - 1])
const plotW = computed(() => Math.max(width.value - PAD.left - PAD.right, 40))
const plotH = computed(() => props.height - PAD.top - PAD.bottom)
const baseline = computed(() => PAD.top + plotH.value)
const x = (i: number) => PAD.left + (props.data.length <= 1 ? plotW.value / 2 : (plotW.value * i) / (props.data.length - 1))
const y = (v: number) => PAD.top + plotH.value * (1 - (v - floor.value) / (max.value - floor.value || 1))

const points = computed(() => props.data.map((d, i) => ({ ...d, i, x: x(i), y: y(d.value) })))
const line = computed(() => points.value.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' '))
const area = computed(() => {
  const pts = points.value
  if (!pts.length) return ''
  return `${line.value} L${pts[pts.length - 1].x},${baseline.value} L${pts[0].x},${baseline.value} Z`
})
const last = computed(() => points.value[points.value.length - 1])
const tip = computed(() => (active.value == null ? null : points.value[active.value]))
const labelEvery = computed(() => Math.max(1, Math.ceil(props.data.length / Math.max(1, Math.floor(plotW.value / 44)))))
const gradientId = `line-fill-${Math.random().toString(36).slice(2, 8)}`

function onMove(event: MouseEvent) {
  const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect()
  const px = event.clientX - rect.left
  const step = props.data.length <= 1 ? 1 : plotW.value / (props.data.length - 1)
  active.value = Math.min(props.data.length - 1, Math.max(0, Math.round(px / step)))
}
</script>

<template>
  <div ref="root" class="chart" :style="{ height: `${height}px` }">
    <svg :width="width" :height="height" role="img" :aria-label="data.map((d) => `${d.label}: ${formatValue(d.value, kind)}`).join(', ')">
      <defs>
        <linearGradient :id="gradientId" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" :stop-color="color" stop-opacity="0.16" />
          <stop offset="100%" :stop-color="color" stop-opacity="0" />
        </linearGradient>
      </defs>
      <g class="chart-grid">
        <g v-for="t in ticks" :key="t">
          <line :x1="PAD.left" :x2="width - PAD.right" :y1="y(t)" :y2="y(t)" />
          <text :x="PAD.left - 8" :y="y(t)" dy="0.32em" text-anchor="end">{{ formatCompact(t, kind) }}</text>
        </g>
      </g>
      <path :d="area" :fill="`url(#${gradientId})`" />
      <path :d="line" fill="none" :stroke="color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <text
        v-for="p in points"
        v-show="p.i % labelEvery === 0 || p.i === points.length - 1"
        :key="p.label"
        class="chart-axis-label"
        :x="p.x"
        :y="baseline + 18"
        text-anchor="middle"
      >{{ p.label }}</text>

      <!-- Selective direct label: the latest value. -->
      <g v-if="last && active == null">
        <circle :cx="last.x" :cy="last.y" r="4" :fill="color" stroke="#fff" stroke-width="2" />
        <text class="chart-end-label" :x="last.x - 8" :y="last.y - 10" text-anchor="end">{{ formatCompact(last.value, kind) }}</text>
      </g>

      <g v-if="tip">
        <line class="chart-crosshair" :x1="tip.x" :x2="tip.x" :y1="PAD.top" :y2="baseline" />
        <circle :cx="tip.x" :cy="tip.y" r="5" :fill="color" stroke="#fff" stroke-width="2" />
      </g>
      <rect
        class="chart-hit"
        :x="PAD.left - 12"
        :y="PAD.top"
        :width="plotW + 24"
        :height="plotH"
        @mousemove="onMove"
        @mouseleave="active = null"
      />
    </svg>
    <div v-if="tip" class="chart-tooltip" :style="{ left: `${tip.x}px`, top: `${tip.y - 10}px` }">
      <div class="chart-tooltip-label">{{ tip.label }}</div>
      <div class="chart-tooltip-value">{{ formatValue(tip.value, kind) }}</div>
    </div>
  </div>
</template>
