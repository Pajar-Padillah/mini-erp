<script setup lang="ts">
// Read-only result card for the mobile "Scan lookup": what is in a bin, or where an SKU is stored.
// Tapping a lot in a bin looks up its SKU; tapping a location of an SKU looks up that bin.
import { computed } from 'vue'
import { Lock } from '@element-plus/icons-vue'
import ExpiryTag from './ExpiryTag.vue'
import { fmtDate, fmtQty } from './wmsUi'
import { BIN_STATUS_LABEL, TRANSIT_ZONE, binFillPct, binQty, binStatus, normLot, useWmsStore, type BinStatus } from '../../stores/wmsStore'

export type LookupTarget = { kind: 'BIN'; bin: string } | { kind: 'SKU'; sku: string; batch?: string; exp?: string }

const props = defineProps<{ target: LookupTarget }>()
const emit = defineEmits<{ lookup: [code: string] }>()
const wms = useWmsStore()

const STATUS_COLOR: Record<BinStatus, string> = { available: 'green', nearfull: 'amber', full: 'red' }
const BAR_COLOR: Record<BinStatus, string> = { available: '#22c55e', nearfull: '#f59e0b', full: '#ef4444' }

// ---------------------------------------------------------------- bin
const bin = computed(() => (props.target.kind === 'BIN' ? wms.bin(props.target.bin) ?? null : null))
const binInfo = computed(() => {
  const b = bin.value
  if (!b) return null
  const st = binStatus(b)
  return {
    b,
    pct: binFillPct(b),
    qty: binQty(b),
    status: st,
    frozenBy: wms.frozenBy(b.bin),
    transit: b.zone === TRANSIT_ZONE,
    lots: b.lots
      .filter((l) => l.qty > 0)
      .map((l) => {
        const batch = normLot(l.batch)
        const exp = normLot(l.exp)
        const s = wms.sku(l.sku)
        return { ...l, batch, exp, name: s?.name ?? l.sku, unit: s?.unit ?? 'Unit', hasExpiry: s?.hasExpiry ?? false, reserved: wms.reservedOnLot(b.bin, batch, exp) }
      }),
  }
})

// ---------------------------------------------------------------- sku
const skuInfo = computed(() => {
  const t = props.target
  if (t.kind !== 'SKU') return null
  const s = wms.sku(t.sku)
  if (!s) return null
  const hiBatch = t.batch ? normLot(t.batch) : null
  const hiExp = t.exp ? normLot(t.exp) : null
  const isHi = (batch: string, exp: string) => hiBatch !== null && batch === hiBatch && (hiExp === null || exp === hiExp)
  const locations = wms
    .stockLots((l) => l.sku === s.sku && l.zone !== TRANSIT_ZONE)
    .sort((a, b) => {
      // FEFO: earliest expiry first, lots without expiry last
      if (a.exp !== b.exp) {
        if (a.exp === '-') return 1
        if (b.exp === '-') return -1
        return a.exp.localeCompare(b.exp)
      }
      return a.bin.localeCompare(b.bin)
    })
    .map((l) => ({ ...l, reserved: wms.reservedOnLot(l.bin, l.batch, l.exp), hi: isHi(l.batch, l.exp) }))
  return {
    s,
    category: wms.category(s.category)?.name ?? s.category,
    metrics: wms.skuMetrics(s.sku),
    locations,
    hiLabel: hiBatch !== null ? `Batch ${hiBatch}${hiExp && hiExp !== '-' ? ` · Exp ${fmtDate(hiExp)}` : ''}` : '',
    hiFound: hiBatch === null || locations.some((l) => l.hi),
  }
})
</script>

<template>
  <!-- ============ Bin ============ -->
  <div v-if="binInfo" class="lk-card">
    <div class="lk-head">
      <div class="lk-head-main">
        <div class="lk-label">Bin</div>
        <div class="lk-code">{{ binInfo.b.bin }}</div>
        <div class="lk-muted">{{ binInfo.b.zone }} · Rack {{ binInfo.b.rack }}</div>
      </div>
      <div class="lk-fill">
        <div class="lk-label">Filled</div>
        <div class="lk-pct" :class="binInfo.status">{{ binInfo.pct }}%</div>
        <div class="lk-muted lk-mono-sm">{{ fmtQty(binInfo.qty) }} / {{ fmtQty(binInfo.b.capacity) }}</div>
      </div>
    </div>
    <el-progress :percentage="binInfo.pct" :stroke-width="10" :show-text="false" :color="BAR_COLOR[binInfo.status]" />
    <div class="lk-row">
      <span class="status-pill" :class="STATUS_COLOR[binInfo.status]">{{ BIN_STATUS_LABEL[binInfo.status] }}</span>
      <span class="lk-muted">{{ binInfo.lots.length }} lot(s)</span>
    </div>
    <div v-if="binInfo.frozenBy" class="lk-warn">
      <el-icon><Lock /></el-icon>
      <span>Frozen by cycle count <b>{{ binInfo.frozenBy }}</b> – no moves until the count is finished.</span>
    </div>
    <div v-if="binInfo.transit" class="lk-info">Transit area – goods received but not yet put away.</div>

    <button v-for="(l, i) in binInfo.lots" :key="i" type="button" class="lk-item" @click="emit('lookup', l.sku)">
      <div class="lk-item-top">
        <div class="lk-item-main">
          <div class="lk-sku">{{ l.sku }}</div>
          <div class="lk-name">{{ l.name }}</div>
        </div>
        <div class="lk-qty">
          <div class="lk-qty-num">{{ fmtQty(l.qty) }}</div>
          <div class="lk-muted lk-small">{{ l.unit }}</div>
        </div>
      </div>
      <div class="lk-item-meta">
        <span>Batch <b>{{ l.batch }}</b></span>
        <span v-if="l.exp !== '-'">Exp <b>{{ fmtDate(l.exp) }}</b></span>
        <ExpiryTag :exp="l.exp" :has-expiry="l.hasExpiry" show-days />
        <span v-if="l.reserved > 0" class="lk-reserved">Reserved {{ fmtQty(l.reserved) }}</span>
      </div>
    </button>
    <div v-if="!binInfo.lots.length" class="lk-empty">Bin is empty.</div>
  </div>

  <!-- ============ SKU ============ -->
  <div v-else-if="skuInfo" class="lk-card">
    <div>
      <div class="lk-label">SKU · {{ skuInfo.category }}</div>
      <div class="lk-code">{{ skuInfo.s.sku }}</div>
      <div class="lk-title">{{ skuInfo.s.name }}</div>
    </div>
    <div class="lk-stats">
      <div><span>Available</span><b class="ok">{{ fmtQty(skuInfo.metrics.available) }}</b></div>
      <div><span>On hand</span><b>{{ fmtQty(skuInfo.metrics.onHand) }}</b></div>
      <div><span>In transit</span><b class="warn">{{ fmtQty(skuInfo.metrics.transit) }}</b></div>
    </div>
    <div v-if="skuInfo.hiLabel" :class="skuInfo.hiFound ? 'lk-info' : 'lk-warn'">
      Scanned lot: <b>{{ skuInfo.hiLabel }}</b>{{ skuInfo.hiFound ? '' : ' – not found on any shelf.' }}
    </div>
    <div class="lk-label">Locations (FEFO order) · unit {{ skuInfo.s.unit }}</div>

    <button v-for="(l, i) in skuInfo.locations" :key="i" type="button" class="lk-item lk-loc" :class="{ hi: l.hi }" @click="emit('lookup', l.bin)">
      <div class="lk-item-main">
        <div class="lk-bin">{{ l.bin }}</div>
        <div class="lk-item-meta">
          <span>Batch <b>{{ l.batch }}</b></span>
          <span v-if="l.exp !== '-'">Exp <b>{{ fmtDate(l.exp) }}</b></span>
          <ExpiryTag :exp="l.exp" :has-expiry="skuInfo.s.hasExpiry" show-days />
          <span v-if="l.reserved > 0" class="lk-reserved">Reserved {{ fmtQty(l.reserved) }}</span>
        </div>
      </div>
      <div class="lk-qty-num">{{ fmtQty(l.qty) }}</div>
    </button>
    <div v-if="!skuInfo.locations.length" class="lk-empty">No stock on the shelves yet.</div>
  </div>
</template>

<style scoped>
.lk-card {
  background: var(--bg-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  padding: 14px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lk-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.lk-head-main {
  min-width: 0;
}
.lk-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--gray-500);
}
.lk-code {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 24px;
  font-weight: 800;
  color: var(--brand-dark);
  word-break: break-all;
}
.lk-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--gray-900);
  line-height: 1.3;
}
.lk-muted {
  font-size: 13px;
  color: var(--gray-500);
}
.lk-small {
  font-size: 11px;
}
.lk-mono-sm {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
}
.lk-fill {
  text-align: right;
  flex-shrink: 0;
}
.lk-pct {
  font-size: 22px;
  font-weight: 800;
  color: #15803d;
}
.lk-pct.nearfull {
  color: #b45309;
}
.lk-pct.full {
  color: #b91c1c;
}
.lk-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.lk-warn,
.lk-info {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 13px;
  border-radius: var(--radius-sm);
  padding: 8px 10px;
}
.lk-warn {
  color: #8a6100;
  background: var(--warning-light);
}
.lk-warn .el-icon {
  margin-top: 2px;
  flex-shrink: 0;
}
.lk-info {
  color: var(--brand-dark);
  background: var(--brand-light);
}
.lk-item {
  width: 100%;
  text-align: left;
  font: inherit;
  cursor: pointer;
  background: var(--gray-50);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 52px;
}
.lk-item:active {
  border-color: var(--brand);
}
.lk-item-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.lk-item-main {
  min-width: 0;
  flex: 1;
}
.lk-sku,
.lk-bin {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-weight: 700;
  color: var(--brand-dark);
}
.lk-sku {
  font-size: 12px;
}
.lk-bin {
  font-size: 15px;
}
.lk-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--gray-900);
  line-height: 1.3;
}
.lk-qty {
  text-align: right;
  white-space: nowrap;
}
.lk-qty-num {
  font-size: 18px;
  font-weight: 800;
  color: var(--gray-900);
  font-family: ui-monospace, Menlo, Consolas, monospace;
  white-space: nowrap;
}
.lk-item-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  font-size: 12px;
  color: var(--gray-700);
}
.lk-reserved {
  color: #b45309;
  font-weight: 600;
}
.lk-loc {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.lk-loc.hi {
  border: 2px solid var(--brand);
  background: var(--brand-light);
}
.lk-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  text-align: center;
}
.lk-stats > div {
  background: var(--gray-50);
  border-radius: var(--radius-sm);
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
}
.lk-stats span {
  font-size: 11px;
  color: var(--gray-500);
  text-transform: uppercase;
}
.lk-stats b {
  font-size: 18px;
  color: var(--gray-900);
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
.lk-stats b.ok {
  color: #15803d;
}
.lk-stats b.warn {
  color: #b45309;
}
.lk-empty {
  text-align: center;
  font-size: 13px;
  font-style: italic;
  color: var(--gray-500);
  padding: 16px 0;
}
</style>
