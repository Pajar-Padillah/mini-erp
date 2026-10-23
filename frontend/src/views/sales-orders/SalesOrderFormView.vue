<script setup lang="ts">
import { computed, onMounted, reactive, ref, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus, Promotion, RefreshLeft, Tickets, Van } from '@element-plus/icons-vue'
import { salesOrderApi } from '../../api/salesOrderApi'
import { useCatalogStore } from '../../stores/catalogStore'
import { useCompanyStore } from '../../stores/companyStore'
import { useTabsStore } from '../../stores/tabsStore'
import { apiErrorMessage } from '../../api/client'
import { formatMoney, formatQty } from '../../utils/format'
import PageHeader from '../../components/PageHeader.vue'
import StatusTag from '../../components/StatusTag.vue'
import FormDocActions, { type NextAction } from '../../components/doc-actions/FormDocActions.vue'
import type { DocRef } from '../../components/doc-actions/docActionsData'
import DocCollabPanel from '../../components/doc-collab/DocCollabPanel.vue'
import { docKey, draftDocKey, useDocCollabStore } from '../../stores/docCollabStore'
import type { SalesOrder } from '../../types/salesOrder'

interface FormLine {
  product_id: number | null
  qty_ordered: number
  unit_price: number
  remaining_qty?: number
}

// One page per document: a new order, a DRAFT (editable) or a submitted order (read-only).
const props = defineProps<{ id?: string }>()
const isNew = !props.id

// Attachments (and comments, once saved): a new document collects them under a draft key until it is saved.
const collab = useDocCollabStore()
const collabKey = isNew ? draftDocKey('sales-order') : docKey('sales-order', props.id!)
let collabSaved = !isNew
onBeforeUnmount(() => {
  if (!collabSaved) collab.discard(collabKey)
})

const route = useRoute()
const router = useRouter()
const catalogStore = useCatalogStore()
const companyStore = useCompanyStore()
const tabsStore = useTabsStore()

function closeTab() {
  tabsStore.closeTab(route.fullPath, router)
}
const submitting = ref(false)
const pendingAction = ref<'draft' | 'submit' | 'save' | 'unsubmit' | null>(null)
const loading = ref(!isNew)

const order = ref<SalesOrder | null>(null)
const status = computed(() => order.value?.document_status)
const readOnly = computed(() => !isNew && status.value !== 'DRAFT')

const form = reactive({
  customer_name: '',
  order_date: new Date().toISOString().slice(0, 10),
  notes: '',
})
const items = ref<FormLine[]>([{ product_id: null, qty_ordered: 1, unit_price: 0 }])

function fillForm(o: SalesOrder) {
  form.customer_name = o.customer_name
  form.order_date = o.order_date.slice(0, 10)
  form.notes = o.notes ?? ''
  items.value = o.items.map((it) => ({
    product_id: it.product_id,
    qty_ordered: Number(it.qty_ordered),
    unit_price: Number(it.unit_price),
    remaining_qty: Number(it.remaining_qty ?? it.qty_ordered),
  }))
}
function fill(o: SalesOrder) {
  order.value = o
  fillForm(o)
}

async function load() {
  try {
    fill(await salesOrderApi.get(Number(props.id)))
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await catalogStore.loadProducts()
  if (!isNew) await load()
  else if (route.query.copy) await loadCopy(Number(route.query.copy))
})

// Duplicate: a new order prefilled from an existing one (?copy=<id>).
async function loadCopy(id: number) {
  try {
    const source = await salesOrderApi.get(id)
    fillForm(source)
    form.order_date = new Date().toISOString().slice(0, 10)
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  }
}

function lineTotal(row: FormLine) {
  return (row.qty_ordered || 0) * (row.unit_price || 0)
}
const grandTotal = computed(() => items.value.reduce((sum, it) => sum + lineTotal(it), 0))

function addRow() {
  items.value.push({ product_id: null, qty_ordered: 1, unit_price: 0 })
}
function deleteRow(i: number) {
  items.value.splice(i, 1)
}
function onProductChange(i: number, productId: number) {
  const p = catalogStore.products.find((p) => p.id === productId)
  if (p) items.value[i].unit_price = Number(p.unit_price)
}

function buildLineItems() {
  return items.value.map((it) => ({
    product_id: it.product_id as number,
    qty_ordered: String(it.qty_ordered),
    unit_price: String(it.unit_price),
  }))
}

async function createOrder(lineItems: ReturnType<typeof buildLineItems>, thenSubmit: boolean) {
  let created = await salesOrderApi.create({
    company_id: companyStore.selectedCompanyId!,
    customer_name: form.customer_name,
    order_date: form.order_date,
    notes: form.notes,
    items: lineItems,
  })
  if (!thenSubmit) {
    ElMessage.success(`Created ${created.order_no}`)
    return created
  }
  try {
    created = await salesOrderApi.submit(created.id)
    ElMessage.success(`Created and submitted ${created.order_no}`)
  } catch (err) {
    ElMessage.warning(`Created ${created.order_no} as a draft, but submit failed: ${apiErrorMessage(err)}`)
  }
  return created
}

async function confirm(message: string, title: string) {
  try {
    await ElMessageBox.confirm(message, title, { type: 'warning' })
    return true
  } catch {
    return false
  }
}

function actionFor(thenSubmit: boolean): 'draft' | 'submit' | 'save' {
  if (thenSubmit) return 'submit'
  return isNew ? 'draft' : 'save'
}

async function save(thenSubmit = false) {
  if (isNew && !companyStore.selectedCompanyId) {
    ElMessage.warning('Select a company first')
    return
  }
  if (items.value.some((it) => !it.product_id)) {
    ElMessage.warning('Select a product for every line')
    return
  }
  if (thenSubmit && !(await confirm(`${isNew ? 'Create and submit' : 'Save and submit'} this order? It will become ACTIVE and ready for delivery.`, 'Confirm Submit'))) return
  submitting.value = true
  pendingAction.value = actionFor(thenSubmit)
  try {
    const lineItems = buildLineItems()
    if (isNew) {
      const created = await createOrder(lineItems, thenSubmit)
      collab.moveThread(collabKey, docKey('sales-order', created.id))
      collabSaved = true
      router.push({ name: 'sales-orders-detail', params: { id: created.id } })
      return
    }
    let updated = await salesOrderApi.update(Number(props.id), {
      customer_name: form.customer_name,
      order_date: form.order_date,
      notes: form.notes,
      items: lineItems,
    })
    if (thenSubmit) {
      updated = await salesOrderApi.submit(updated.id)
      ElMessage.success(`Submitted ${updated.order_no} — now ACTIVE`)
    } else {
      ElMessage.success(`Updated ${updated.order_no}`)
    }
    await load()
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  } finally {
    submitting.value = false
    pendingAction.value = null
  }
}

async function unsubmit() {
  if (!(await confirm('Unsubmit this order? It will go back to DRAFT.', 'Confirm Unsubmit'))) return
  submitting.value = true
  pendingAction.value = 'unsubmit'
  try {
    await salesOrderApi.unsubmit(Number(props.id))
    ElMessage.success('Order unsubmitted — back to DRAFT')
    await load()
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  } finally {
    submitting.value = false
    pendingAction.value = null
  }
}

async function remove() {
  if (!(await confirm('Delete this DRAFT order?', 'Confirm'))) return
  try {
    await salesOrderApi.remove(Number(props.id))
    ElMessage.success('Order deleted')
    closeTab()
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  }
}

function createDelivery() {
  router.push({ name: 'sales-deliveries-new', query: { sales_order_id: props.id } })
}

const docRef = computed<DocRef>(() => ({
  no: order.value?.order_no ?? '',
  type: 'Sales Order',
  status: status.value,
  amount: Number(order.value?.total_amount ?? 0),
  date: order.value?.order_date,
  party: order.value?.customer_name,
  collabKey,
}))

const nextActions = computed<NextAction[]>(() => {
  const list: NextAction[] = []
  if (status.value === 'ACTIVE' || status.value === 'PROCESSED') {
    list.push({ key: 'create-picking', label: 'Create Picking List', icon: Tickets })
    list.push({ key: 'create-delivery', label: 'Create Delivery', icon: Van })
  }
  return list
})

function onNextAction(key: string) {
  if (key === 'create-delivery') createDelivery()
  if (key === 'create-picking') router.push({ path: '/inventory/picking-list', query: { so: props.id } })
}

function duplicate() {
  router.push({ name: 'sales-orders-new', query: { copy: props.id } })
}
</script>

<template>
  <div class="page">
    <PageHeader
      :title="isNew ? 'New Sales Order' : (order?.order_no ?? 'Sales Order')"
      :breadcrumb="{ label: 'Sales Orders', to: '/sales-orders' }"
      show-back
    >
      <template v-if="status" #badges><StatusTag :status="status" /></template>
      <template #actions>
        <template v-if="isNew">
          <el-button type="warning" plain :loading="pendingAction === 'draft'" :disabled="submitting" @click="save(false)">Create Draft</el-button>
          <el-button type="primary" :loading="pendingAction === 'submit'" :disabled="submitting" @click="save(true)">
            Create &amp; Submit
          </el-button>
        </template>
        <template v-else-if="order">
          <el-button v-if="status === 'DRAFT'" type="danger" plain :icon="Delete" :disabled="submitting" @click="remove">Delete</el-button>
          <el-button v-if="status === 'DRAFT'" :loading="pendingAction === 'save'" :disabled="submitting" @click="save(false)">Update</el-button>
          <el-button v-if="status === 'DRAFT'" type="primary" :icon="Promotion" :loading="pendingAction === 'submit'" :disabled="submitting" @click="save(true)">Submit</el-button>
          <el-button v-if="status === 'ACTIVE'" type="warning" plain :icon="RefreshLeft" :loading="pendingAction === 'unsubmit'" :disabled="submitting" @click="unsubmit">Unsubmit</el-button>
          <FormDocActions :doc="docRef" :actions="nextActions" :loading="pendingAction === 'submit'" @select="onNextAction" @duplicate="duplicate" />
        </template>
      </template>
    </PageHeader>

    <div class="card" v-loading="loading">
      <el-form label-position="top" class="form-grid" :disabled="readOnly">
        <el-form-item label="Customer">
          <el-input v-model="form.customer_name" placeholder="e.g. Toko Kosmetik Sukses Mandiri" />
        </el-form-item>
        <el-form-item label="Order Date">
          <el-date-picker v-model="form.order_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Notes" class="span-2">
          <el-input v-model="form.notes" type="textarea" :rows="2" :placeholder="readOnly ? '' : 'Optional'" />
        </el-form-item>
      </el-form>

      <div class="section-header">
        <div class="section-title">Items</div>
        <el-button v-if="!readOnly" size="small" :icon="Plus" @click="addRow">Add Row</el-button>
      </div>
      <el-table :data="items" size="small">
        <el-table-column label="Product" min-width="260">
          <template #default="{ row, $index }">
            <el-select v-model="row.product_id" filterable placeholder="Select product" style="width: 100%" :disabled="readOnly" @change="(v: number) => onProductChange($index, v)">
              <el-option v-for="p in catalogStore.products" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="Qty" width="160">
          <template #default="{ row }">
            <el-input-number v-model="row.qty_ordered" :min="0.001" :controls="false" style="width: 100%" :disabled="readOnly" />
          </template>
        </el-table-column>
        <el-table-column v-if="readOnly" label="Remaining" width="120" align="right">
          <template #default="{ row }">{{ formatQty(row.remaining_qty ?? row.qty_ordered) }}</template>
        </el-table-column>
        <el-table-column label="Price" width="180">
          <template #default="{ row }">
            <el-input-number v-model="row.unit_price" :min="0" :controls="false" style="width: 100%" :disabled="readOnly" />
          </template>
        </el-table-column>
        <el-table-column label="Total" width="180" align="right">
          <template #default="{ row }">
            {{ formatMoney(lineTotal(row)) }}
          </template>
        </el-table-column>
        <el-table-column v-if="!readOnly" label="" width="56" align="center">
          <template #default="{ $index }">
            <el-tooltip content="Delete row" placement="top">
              <el-button
                type="danger"
                :icon="Delete"
                circle
                plain
                size="small"
                :disabled="items.length <= 1"
                @click="deleteRow($index)"
              />
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>

      <div class="grand-total">
        <span class="grand-total-label">Grand Total</span>
        <span class="grand-total-value">{{ formatMoney(grandTotal) }}</span>
      </div>

      <div class="form-collab">
        <DocCollabPanel :doc-key="collabKey" />
      </div>
    </div>
  </div>
</template>
