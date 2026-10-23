<script setup lang="ts">
// New picking list from a submitted Sales Order: the SO's remaining lines become a WMS outbound
// DO (stock auto-allocated FEFO) that shows up in the Picking List. Sales products and WMS SKUs
// are separate catalogs, so each SO line is mapped to a WMS SKU (guessed by brand, editable).
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { salesOrderApi } from '../../api/salesOrderApi'
import { apiErrorMessage } from '../../api/client'
import { fmtQty } from './wmsUi'
import { useWmsStore, type Outbound } from '../../stores/wmsStore'

interface Line { product: string; name: string; remaining: number; qty: number; sku: string }

const emit = defineEmits<{ created: [doc: Outbound] }>()
const wms = useWmsStore()

const open = ref(false)
const loading = ref(false)
const orders = ref<{ id: number; no: string; customer: string }[]>([])
const soId = ref<number | null>(null)
const so = ref<{ no: string; customer: string; date: string } | null>(null)
const lines = ref<Line[]>([])

const fgSkus = computed(() => wms.skus.filter((s) => !s.inactive && s.category === 'FG'))
const sellable = computed(() => wms.skus.filter((s) => !s.inactive))
/** SO number → open (not dispatched) outbound already created for it. */
const openFor = (no: string) => wms.outbound.find((d) => d.poCust === no.toUpperCase() && !d.dispatched)

/** Same code if the WMS has it, otherwise the finished good of the same brand (first word of the name). */
function guessSku(code: string, name: string): string {
  if (wms.sku(code)) return code
  const brand = name.split(/\s+/)[0]?.toLowerCase() ?? ''
  return fgSkus.value.find((s) => s.name.toLowerCase().startsWith(brand))?.sku ?? fgSkus.value[0]?.sku ?? ''
}

async function show(id?: number) {
  open.value = true
  soId.value = null
  so.value = null
  lines.value = []
  loading.value = true
  try {
    const list = await salesOrderApi.listPickable()
    orders.value = list
      .sort((a, b) => b.order_date.localeCompare(a.order_date))
      .map((o) => ({ id: o.id, no: o.order_no, customer: o.customer_name }))
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  } finally {
    loading.value = false
  }
  const pick = id ?? orders.value.find((o) => !openFor(o.no))?.id
  if (pick && orders.value.some((o) => o.id === pick)) {
    soId.value = pick
    await loadOrder()
  }
}
defineExpose({ show })

async function loadOrder() {
  if (soId.value == null) return
  loading.value = true
  try {
    const o = await salesOrderApi.get(soId.value)
    so.value = { no: o.order_no, customer: o.customer_name, date: o.order_date }
    lines.value = o.items
      .map((it) => {
        const remaining = Number(it.remaining_qty ?? it.qty_ordered) || 0
        const product = it.product?.sku ?? `#${it.product_id}`
        const name = it.product?.name ?? product
        return { product, name, remaining, qty: remaining, sku: guessSku(product, name) }
      })
      .filter((l) => l.remaining > 0)
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const available = (sku: string) => (sku ? wms.skuMetrics(sku).available : 0)
const existing = computed(() => (so.value ? openFor(so.value.no) : undefined))
const valid = computed(() => !!so.value && !existing.value && lines.value.some((l) => l.qty > 0) && lines.value.every((l) => !l.qty || !!l.sku))

function submit() {
  if (!so.value) return
  // Several sales products may map to one WMS SKU: merge them into one outbound line.
  const merged = new Map<string, number>()
  lines.value.filter((l) => l.qty > 0).forEach((l) => merged.set(l.sku, (merged.get(l.sku) ?? 0) + Number(l.qty)))
  const name = so.value.customer.trim()
  let customer = wms.contacts.find((c) => c.type === 'CUSTOMER' && c.name.toLowerCase() === name.toLowerCase())?.name
  if (!customer) {
    const r = wms.saveContact({ name, type: 'CUSTOMER', term: 'BELI PUTUS' })
    if (!r.ok) return ElMessage.warning(r.msg)
    customer = name
  }
  const r = wms.createOutbound({
    no: '',
    poCust: so.value.no,
    customer,
    note: `From Sales Order ${so.value.no}`,
    items: [...merged].map(([sku, qty]) => ({ sku, qty })),
  })
  if (!r.ok || !r.data) return ElMessage.warning(r.msg)
  ElMessage.success(`${so.value.no} → picking list ${r.data.no}. ${r.msg}`)
  open.value = false
  emit('created', r.data)
}
</script>

<template>
  <el-dialog v-model="open" title="New picking list from Sales Order" width="960px" top="6vh">
    <div v-loading="loading">
      <el-form label-position="top">
        <el-form-item label="Sales Order" required>
          <el-select v-model="soId" filterable placeholder="Choose a submitted sales order" class="w-full"
            no-data-text="No ACTIVE / PROCESSED sales orders" @change="loadOrder">
            <el-option v-for="o in orders" :key="o.id" :value="o.id" :label="`${o.no} · ${o.customer}`">
              <div class="opt-row">
                <span>{{ o.no }} · {{ o.customer }}</span>
                <span v-if="openFor(o.no)" class="cell-sub">in picking ({{ openFor(o.no)!.no }})</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>

      <el-alert v-if="existing" type="warning" :closable="false" show-icon class="pf-gap"
        :title="`${so?.no} already has an open picking list (${existing.no}). Finish or dispatch it first.`" />

      <template v-if="so && lines.length">
        <el-table :data="lines" size="small">
          <el-table-column label="Sales product" min-width="230">
            <template #default="{ row }">
              <div class="cell-strong">{{ row.product }}</div>
              <div class="cell-sub">{{ row.name }}</div>
            </template>
          </el-table-column>
          <el-table-column label="Remaining" width="100" align="right">
            <template #default="{ row }">{{ fmtQty(row.remaining) }}</template>
          </el-table-column>
          <el-table-column label="Warehouse SKU" min-width="230">
            <template #default="{ row }">
              <el-select v-model="row.sku" filterable size="small" class="w-full">
                <el-option v-for="s in sellable" :key="s.sku" :value="s.sku" :label="`${s.sku} – ${s.name}`" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="Available" width="100" align="right">
            <template #default="{ row }">
              <span :class="available(row.sku) < row.qty ? 'is-neg' : ''">{{ fmtQty(available(row.sku)) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Qty to pick" width="120">
            <template #default="{ row }">
              <el-input-number v-model="row.qty" :min="0" :max="row.remaining" :step="1" step-strictly :controls="false" size="small" class="w-full" />
            </template>
          </el-table-column>
        </el-table>
        <p class="cell-sub">Stock is allocated FEFO right away; lines without enough stock wait in the Picking List until stock arrives.</p>
      </template>
      <el-empty v-else-if="so" description="Everything on this order has already been delivered." :image-size="70" />
    </div>

    <template #footer>
      <el-button @click="open = false">Cancel</el-button>
      <el-button type="primary" :disabled="!valid" @click="submit">Create picking list</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.w-full {
  width: 100%;
}
.opt-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.pf-gap {
  margin-bottom: 12px;
}
.cell-strong {
  font-weight: 600;
  color: var(--gray-900);
}
.cell-sub {
  font-size: 12px;
  color: var(--gray-500);
}
.is-neg {
  color: var(--danger);
}
</style>
