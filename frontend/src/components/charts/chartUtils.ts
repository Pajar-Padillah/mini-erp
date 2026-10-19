import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export type ValueKind = 'money' | 'number' | 'percent'

export interface ChartDatum {
  label: string
  value: number
  /** Optional fixed color (e.g. a status color); otherwise the categorical order is used. */
  color?: string
}

/** Categorical order, validated for CVD separation on the white card surface. */
export const SERIES_COLORS = ['#003366', '#eb6834', '#1baf7a', '#eda100']

/** Status colors for document-state data (always shown with a text label). */
export const STATUS_COLORS = {
  good: '#16a34a',
  warning: '#e5a600',
  info: '#003366',
  critical: '#ef4444',
  neutral: '#91a8ba',
}

const number = new Intl.NumberFormat('id-ID')

/** Full value, e.g. "Rp 1.284.500.000", "4.214", "96,2%". */
export function formatValue(value: number, kind: ValueKind = 'number'): string {
  if (kind === 'money') return `Rp ${number.format(Math.round(value))}`
  if (kind === 'percent') return `${value.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`
  return number.format(value)
}

/** Compact value for axes and centers, e.g. "Rp 1,28 M", "Rp 412 jt", "4,2 rb". */
export function formatCompact(value: number, kind: ValueKind = 'number'): string {
  if (kind === 'percent') return formatValue(value, kind)
  const abs = Math.abs(value)
  const fmt = (n: number, unit: string) => `${n.toLocaleString('id-ID', { maximumFractionDigits: n < 10 ? 2 : n < 100 ? 1 : 0 })} ${unit}`
  let text: string
  if (abs >= 1e12) text = fmt(value / 1e12, 'T')
  else if (abs >= 1e9) text = fmt(value / 1e9, 'M')
  else if (abs >= 1e6) text = fmt(value / 1e6, 'jt')
  else if (abs >= 1e3 && kind === 'money') text = fmt(value / 1e3, 'rb')
  else text = number.format(value)
  return kind === 'money' ? `Rp ${text}` : text
}

/** 0-based "nice" axis ticks covering max, e.g. max 1.284 → [0, 500, 1000, 1500]. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

/** Tracks an element's content width so SVG charts can lay out in real pixels. */
export function useElementWidth(el: Ref<HTMLElement | undefined>, fallback = 480) {
  const width = ref(fallback)
  let observer: ResizeObserver | undefined
  onMounted(() => {
    if (!el.value) return
    width.value = el.value.clientWidth || fallback
    observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) width.value = entry.contentRect.width
    })
    observer.observe(el.value)
  })
  onBeforeUnmount(() => observer?.disconnect())
  return width
}

/** Path for a bar with 4px rounded top corners anchored flat on the baseline. */
export function roundedTopBar(x: number, y: number, w: number, baseline: number): string {
  const h = baseline - y
  const r = Math.min(4, w / 2, h)
  return `M${x},${baseline} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${baseline} Z`
}
