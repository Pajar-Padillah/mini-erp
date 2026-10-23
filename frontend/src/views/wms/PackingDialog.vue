<script setup lang="ts">
// Pack dialog: split the picked (or shipped) lines of an outbound DO round into cartons.
// Used by the Packing List page for new lists, drafts and repacks after a failed check.
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fmtDate, fmtQty } from './wmsUi'
import { todayISO, useWmsStore } from '../../stores/wmsStore'
import { usePackingStore, type Carton, type PackingList, type PackLine, type SourceLine } from '../../stores/packingStore'
import DocCollabSection from './DocCollabSection.vue'
import { useDocCollabKey } from './useDocCollabKey'

const wms = useWmsStore()
const store = usePackingStore()

const open = ref(false)
const editing = ref<PackingList | null>(null)
const form = reactive({ outboundId: null as number | null, date: todayISO(), note: '', cartons: [] as Carton[], lines: [] as PackLine[] })
const collab = useDocCollabKey('wms-packing')

const packable = computed(() => store.packableOutbound())
const source = computed<SourceLine[]>(() => {
  if (editing.value) return store.sourceOf(editing.value)
  return packable.value.find((x) => x.doc.id === form.outboundId)?.source.lines ?? []
})
const round = computed(() => editing.value?.round ?? packable.value.find((x) => x.doc.id === form.outboundId)?.source.round)

const keyOf = (l: { sku: string; batch: string; exp: string }) => `${l.sku}|${l.batch}|${l.exp}`
const packedOf = (s: SourceLine) => form.lines.filter((l) => keyOf(l) === keyOf(s)).reduce((a, l) => a + (Number(l.qty) || 0), 0)
const remainingOf = (s: SourceLine) => s.qty - packedOf(s)

const newCarton = (no: number): Carton => ({ no, weight: 0, dims: '' })

function openCreate(outboundId?: number) {
  editing.value = null
  form.outboundId = outboundId ?? packable.value[0]?.doc.id ?? null
  form.date = todayISO()
  form.note = ''
  form.cartons = [newCarton(1)]
  form.lines = []
  autoFill()
  collab.startCreate()
  open.value = true
}
function openEdit(p: PackingList) {
  editing.value = p
  form.outboundId = p.outboundId
  form.date = p.date
  form.note = p.note
  form.cartons = p.cartons.map((c) => ({ ...c }))
  form.lines = p.lines.map((l) => ({ ...l }))
  collab.startEdit(p.no)
  open.value = true
}
defineExpose({ openCreate, openEdit })

function onOutbound() {
  form.lines = []
  form.cartons = [newCarton(1)]
  autoFill()
}

function addCarton() {
  form.cartons.push(newCarton(form.cartons.length ? Math.max(...form.cartons.map((c) => c.no)) + 1 : 1))
}
function removeCarton(no: number) {
  form.cartons = form.cartons.filter((c) => c.no !== no)
  form.lines = form.lines.filter((l) => l.carton !== no)
}
/** Put everything not yet packed into the last carton. */
function autoFill() {
  const carton = form.cartons[form.cartons.length - 1]?.no
  if (carton === undefined) return
  source.value.forEach((s) => {
    const left = remainingOf(s)
    if (left <= 0) return
    const same = form.lines.find((l) => l.carton === carton && keyOf(l) === keyOf(s))
    if (same) same.qty += left
    else form.lines.push({ carton, sku: s.sku, batch: s.batch, exp: s.exp, qty: left, checkedQty: 0 })
  })
}
function addLine() {
  const s = source.value.find((x) => remainingOf(x) > 0) ?? source.value[0]
  if (!s) return
  form.lines.push({ carton: form.cartons[form.cartons.length - 1]?.no ?? 1, sku: s.sku, batch: s.batch, exp: s.exp, qty: Math.max(0, remainingOf(s)), checkedQty: 0 })
}
function onLineSource(l: PackLine, key: string) {
  const s = source.value.find((x) => keyOf(x) === key)
  if (!s) return
  l.sku = s.sku
  l.batch = s.batch
  l.exp = s.exp
}

const cleanLines = computed(() => form.lines.map((l) => ({ ...l, qty: Number(l.qty) || 0 })))
const cleanCartons = computed(() => form.cartons.map((c) => ({ ...c, weight: Number(c.weight) || 0, dims: c.dims.trim() })))
const validation = computed(() => store.validate(source.value, cleanLines.value, cleanCartons.value))

function save(pack: boolean) {
  const payload = { date: form.date, note: form.note, cartons: cleanCartons.value, lines: cleanLines.value, pack }
  const r = editing.value
    ? store.update(editing.value.id, payload)
    : form.outboundId != null
      ? store.create({ ...payload, outboundId: form.outboundId })
      : { ok: false, msg: 'Choose an outbound DO.' }
  if (r.ok) {
    if (!editing.value && 'data' in r && r.data) collab.commit(r.data.no)
    ElMessage.success(r.msg)
    open.value = false
  } else {
    ElMessage.warning(r.msg)
  }
}
</script>

<template>
  <el-dialog v-model="open" :title="editing ? `${editing.status === 'DISCREPANCY' ? 'Repack' : 'Continue packing'} ${editing.no}` : 'Pack outbound'" width="1100px" top="5vh" @closed="collab.closed">
    <el-form label-position="top">
      <div class="pk-head">
        <el-form-item label="Outbound DO" required>
          <el-input v-if="editing" :model-value="`${editing.outboundNo} · ${editing.customer}`" disabled />
          <el-select v-else v-model="form.outboundId" filterable placeholder="Choose a picked outbound" class="w-full"
            no-data-text="No picked or shipped outbound waiting to be packed" @change="onOutbound">
            <el-option v-for="x in packable" :key="x.doc.id" :value="x.doc.id" :label="`${x.doc.no} · ${x.doc.customer}`">
              <div class="opt-row">
                <span>{{ x.doc.no }} · {{ x.doc.customer }}</span>
                <span class="cell-sub">shipment #{{ x.source.round }} · {{ fmtQty(x.source.lines.reduce((a, l) => a + l.qty, 0)) }} pcs</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="Date">
          <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" format="DD MMM YYYY" :clearable="false" class="w-full" />
        </el-form-item>
        <el-form-item label="Note">
          <el-input v-model="form.note" placeholder="Optional note" />
        </el-form-item>
      </div>
    </el-form>

    <el-alert v-if="editing?.status === 'DISCREPANCY'" type="warning" :closable="false" show-icon class="pk-gap"
      :title="`Checking found a discrepancy${editing.checkNote ? `: ${editing.checkNote}` : ''}. Repack and mark packed to send it back to the Checking List.`" />

    <template v-if="source.length">
      <div class="pk-section">To pack<span v-if="round" class="cell-sub"> · shipment #{{ round }}</span></div>
      <el-table :data="source" size="small" class="pk-gap">
        <el-table-column prop="sku" label="SKU" width="110" />
        <el-table-column label="Name" min-width="200">
          <template #default="{ row }">{{ wms.skuName(row.sku) }}</template>
        </el-table-column>
        <el-table-column prop="batch" label="Batch" min-width="130" />
        <el-table-column label="Expiry" width="120">
          <template #default="{ row }">{{ fmtDate(row.exp) }}</template>
        </el-table-column>
        <el-table-column label="Outbound" width="100" align="right">
          <template #default="{ row }">{{ fmtQty(row.qty) }}</template>
        </el-table-column>
        <el-table-column label="Packed" width="100" align="right">
          <template #default="{ row }">{{ fmtQty(packedOf(row)) }}</template>
        </el-table-column>
        <el-table-column label="Remaining" width="110" align="right">
          <template #default="{ row }">
            <b :class="remainingOf(row) === 0 ? 'is-pos' : 'is-neg'">{{ fmtQty(remainingOf(row)) }}</b>
          </template>
        </el-table-column>
      </el-table>

      <div class="pk-section">Cartons</div>
      <div class="pk-cartons">
        <div v-for="c in form.cartons" :key="c.no" class="pk-carton-edit">
          <b>#{{ c.no }}</b>
          <el-input-number v-model="c.weight" :min="0" :precision="1" :step="0.5" :controls="false" size="small" placeholder="kg" class="pk-weight" />
          <span class="cell-sub">kg</span>
          <el-input v-model="c.dims" size="small" placeholder="L x W x H cm" class="pk-dims" />
          <el-button link type="danger" :disabled="form.cartons.length <= 1" @click="removeCarton(c.no)">✕</el-button>
        </div>
        <el-button size="small" @click="addCarton">+ Carton</el-button>
      </div>

      <div class="pk-section">Carton contents</div>
      <el-table :data="form.lines" size="small" empty-text="Nothing packed yet">
        <el-table-column label="Carton" width="110">
          <template #default="{ row }">
            <el-select v-model="row.carton" size="small" class="w-full">
              <el-option v-for="c in form.cartons" :key="c.no" :value="c.no" :label="`#${c.no}`" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="SKU / batch" min-width="300">
          <template #default="{ row }">
            <el-select :model-value="keyOf(row)" size="small" class="w-full" @change="(k: string) => onLineSource(row, k)">
              <el-option v-for="s in source" :key="keyOf(s)" :value="keyOf(s)" :label="`${s.sku} – ${wms.skuName(s.sku)} · ${s.batch}`" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="Qty" width="130">
          <template #default="{ row }">
            <el-input-number v-model="row.qty" :min="0" :step="1" step-strictly :controls="false" size="small" class="w-full" />
          </template>
        </el-table-column>
        <el-table-column label="" width="56" align="center">
          <template #default="{ $index }">
            <el-button link type="danger" @click="form.lines.splice($index, 1)">✕</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pk-foot">
        <el-button size="small" @click="addLine">+ Add line</el-button>
        <el-button size="small" @click="autoFill">Put remaining in last carton</el-button>
      </div>

      <el-alert :type="validation.ok ? 'success' : 'warning'" :closable="false" show-icon
        :title="validation.ok ? 'All lines packed – ready to mark as packed.' : validation.msg" />
    </template>
    <el-empty v-else description="Choose an outbound DO that has picked or shipped goods." :image-size="80" />

    <DocCollabSection :doc-key="collab.key.value" />

    <template #footer>
      <el-button @click="open = false">Cancel</el-button>
      <el-button :disabled="!source.length" @click="save(false)">Save draft</el-button>
      <el-button type="primary" :disabled="!validation.ok" @click="save(true)">Mark packed</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.cell-sub {
  font-size: 12px;
  color: var(--gray-500);
}
.is-pos {
  color: var(--success);
}
.is-neg {
  color: var(--danger);
}
.w-full {
  width: 100%;
}
.opt-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.pk-head {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) 180px minmax(0, 1fr);
  gap: 0 16px;
}
.pk-section {
  margin: 4px 0 8px;
  font-weight: 600;
  color: var(--gray-700);
}
.pk-gap {
  margin-bottom: 16px;
}
.pk-cartons {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-bottom: 16px;
}
.pk-carton-edit {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--gray-200);
  border-radius: 8px;
}
.pk-weight {
  width: 72px;
}
.pk-dims {
  width: 130px;
}
.pk-foot {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0 16px;
}
@media (max-width: 760px) {
  .pk-head {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
