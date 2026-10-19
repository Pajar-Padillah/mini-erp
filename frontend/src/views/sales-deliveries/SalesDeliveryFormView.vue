<script setup lang="ts">
import { computed, onMounted, reactive, ref, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesOrderApi } from '../../api/salesOrderApi'
import { salesDeliveryApi } from '../../api/salesDeliveryApi'
import { useCompanyStore } from '../../stores/companyStore'
import { apiErrorMessage } from '../../api/client'
import { formatQty } from '../../utils/format'
import RemainingQtyPicker, { type PickerRow } from '../../components/RemainingQtyPicker.vue'
import PageHeader from '../../components/PageHeader.vue'
import StatusTag from '../../components/StatusTag.vue'
import { Delete, Promotion, RefreshLeft, Document } from '@element-plus/icons-vue'
import FormDocActions, { type NextAction } from '../../components/doc-actions/FormDocActions.vue'
import type { DocRef } from '../../components/doc-actions/docActionsData'
import type { SalesOrder } from '../../types/salesOrder'
import type { SalesDelivery } from '../../types/salesDelivery'
import { useTabsStore } from '../../stores/tabsStore'
import DocCollabPanel from '../../components/doc-collab/DocCollabPanel.vue'
import { docKey, draftDocKey, useDocCollabStore } from '../../stores/docCollabStore'

// One page per document: a new delivery, a DRAFT (editable) or a submitted delivery (read-only).
const props = defineProps<{ id?: string }>()
const isNew = !props.id

// Attachments (and comments, once saved): a new document collects them under a draft key until it is saved.
const collab = useDocCollabStore()
const collabKey = isNew ? draftDocKey('sales-delivery') : docKey('sales-delivery', props.id!)
let collabSaved = !isNew
onBeforeUnmount(() => {
  if (!collabSaved) collab.discard(collabKey)
})

const route = useRoute()
const router = useRouter()
const companyStore = useCompanyStore()
const tabsStore = useTabsStore()

function closeTab() {
  tabsStore.closeTab(route.fullPath, router)
}
const submitting = ref(false)
const pendingAction = ref<'draft' | 'submit' | 'save' | 'unsubmit' | null>(null)
const loading = ref(!isNew)

const delivery = ref<SalesDelivery | null>(null)
const status = computed(() => delivery.value?.document_status)
const readOnly = computed(() => !isNew && status.value !== 'DRAFT')

const availableOrders = ref<SalesOrder[]>([])
const orderId = ref<number | null>(route.query.sales_order_id ? Number(route.query.sales_order_id) : null)
const order = ref<SalesOrder | null>(null)

const form = reactive({ delivery_date: new Date().toISOString().slice(0, 10), notes: '' })
const qtyByItem = ref<Record<number, string>>({})

async function loadOrder() {
  if (!orderId.value) return
  order.value = await salesOrderApi.get(orderId.value)
}

async function fill(d: SalesDelivery) {
  delivery.value = d
  orderId.value = d.sales_order_id
  form.delivery_date = d.delivery_date.slice(0, 10)
  form.notes = d.notes ?? ''
  const prefill: Record<number, string> = {}
  for (const it of d.items) prefill[it.source_order_item_id] = it.qty
  await loadOrder()
  qtyByItem.value = prefill
}

async function load() {
  try {
    await fill(await salesDeliveryApi.get(Number(props.id)))
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  availableOrders.value = await salesOrderApi.listPickable()
  if (!isNew) await load()
  else if (orderId.value) await loadOrder()
})

async function onSelectOrder(id: number) {
  orderId.value = id
  qtyByItem.value = {}
  order.value = null
  await loadOrder()
}

const selectableOrders = computed<SalesOrder[]>(() => {
  if (order.value && !availableOrders.value.some((o) => o.id === order.value!.id)) {
    return [order.value, ...availableOrders.value]
  }
  return availableOrders.value
})

const rows = computed<PickerRow[]>(() =>
  (order.value?.items ?? [])
    .filter((it) => Number(it.remaining_qty ?? it.qty_ordered) > 0 || Number(qtyByItem.value[it.id] ?? 0) > 0)
    .map((it) => ({
      sourceItemId: it.id,
      productName: it.product?.name ?? `Product #${it.product_id}`,
      available: it.remaining_qty ?? it.qty_ordered,
    })),
)

const totalQty = computed(() => delivery.value?.items.reduce((a, i) => a + Number(i.qty), 0) ?? 0)

async function createDelivery(items: { source_order_item_id: number; qty: string }[], thenSubmit: boolean) {
  let created = await salesDeliveryApi.create({
    company_id: companyStore.selectedCompanyId!,
    sales_order_id: order.value!.id,
    delivery_date: form.delivery_date,
    notes: form.notes,
    items,
  })
  if (!thenSubmit) {
    ElMessage.success(`Created ${created.delivery_no}`)
    return created
  }
  try {
    created = await salesDeliveryApi.submit(created.id)
    ElMessage.success(`Created and submitted ${created.delivery_no}`)
  } catch (err) {
    ElMessage.warning(`Created ${created.delivery_no} as a draft, but submit failed: ${apiErrorMessage(err)}`)
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
  if (!order.value) {
    ElMessage.warning('Select a sales order first')
    return
  }
  const items = Object.entries(qtyByItem.value)
    .filter(([, qty]) => Number(qty) > 0)
    .map(([sourceItemId, qty]) => ({ source_order_item_id: Number(sourceItemId), qty }))
  if (items.length === 0) {
    ElMessage.warning('Enter at least one quantity to deliver')
    return
  }
  if (isNew && !companyStore.selectedCompanyId) {
    ElMessage.warning('Select a company first')
    return
  }
  if (thenSubmit && !(await confirm(`${isNew ? 'Create and submit' : 'Save and submit'} this delivery? Stock will be deducted.`, 'Confirm Submit'))) return
  submitting.value = true
  pendingAction.value = actionFor(thenSubmit)
  try {
    if (isNew) {
      const created = await createDelivery(items, thenSubmit)
      collab.moveThread(collabKey, docKey('sales-delivery', created.id))
      collabSaved = true
      router.push({ name: 'sales-deliveries-detail', params: { id: created.id } })
      return
    }
    let updated = await salesDeliveryApi.update(Number(props.id), {
      delivery_date: form.delivery_date,
      notes: form.notes,
      items,
    })
    if (thenSubmit) {
      updated = await salesDeliveryApi.submit(updated.id)
      ElMessage.success(`Submitted ${updated.delivery_no} — stock deducted`)
    } else {
      ElMessage.success(`Updated ${updated.delivery_no}`)
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
  if (!(await confirm('Unsubmit this delivery? Stock will be restored.', 'Confirm Unsubmit'))) return
  submitting.value = true
  pendingAction.value = 'unsubmit'
  try {
    await salesDeliveryApi.unsubmit(Number(props.id))
    ElMessage.success('Delivery unsubmitted — stock restored')
    await load()
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  } finally {
    submitting.value = false
    pendingAction.value = null
  }
}

async function remove() {
  if (!(await confirm('Delete this DRAFT delivery?', 'Confirm'))) return
  try {
    await salesDeliveryApi.remove(Number(props.id))
    ElMessage.success('Delivery deleted')
    closeTab()
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  }
}

function createInvoice() {
  router.push({ name: 'sales-invoices-new', query: { sales_delivery_id: props.id } })
}

const docRef = computed<DocRef>(() => ({
  no: delivery.value?.delivery_no ?? '',
  type: 'Sales Delivery',
  status: status.value,
  amount: undefined,
  date: delivery.value?.delivery_date,
  party: delivery.value?.sales_order?.customer_name,
  collabKey,
}))

const nextActions = computed<NextAction[]>(() => {
  const list: NextAction[] = []
  if (status.value === 'ACTIVE' || status.value === 'PROCESSED') list.push({ key: 'create-invoice', label: 'Create Invoice', icon: Document })
  return list
})

function onNextAction(key: string) {
  if (key === 'create-invoice') createInvoice()
}

function duplicate() {
  router.push({ name: 'sales-deliveries-new', query: { sales_order_id: delivery.value?.sales_order_id } })
}
</script>

<template>
  <div class="page">
    <PageHeader
      :title="isNew ? 'New Sales Delivery' : (delivery?.delivery_no ?? 'Sales Delivery')"
      :breadcrumb="{ label: 'Deliveries', to: '/sales-deliveries' }"
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
        <template v-else-if="delivery">
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
        <el-form-item label="Sales Order" class="span-2">
          <el-select
            :model-value="orderId ?? undefined"
            filterable
            :disabled="!isNew"
            placeholder="Select a sales order"
            style="width: 100%"
            @update:model-value="onSelectOrder"
          >
            <el-option v-for="o in selectableOrders" :key="o.id" :label="`${o.order_no} — ${o.customer_name}`" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Delivery Date">
          <el-date-picker v-model="form.delivery_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Notes">
          <el-input v-model="form.notes" type="textarea" :rows="1" :placeholder="readOnly ? '' : 'Optional'" />
        </el-form-item>
      </el-form>

      <template v-if="readOnly && delivery">
        <div class="section-title">Items</div>
        <el-table :data="delivery.items" size="small">
          <el-table-column label="Product" min-width="240">
            <template #default="{ row }">{{ row.product?.name ?? `Product #${row.product_id}` }}</template>
          </el-table-column>
          <el-table-column label="Qty delivered" width="150" align="right">
            <template #default="{ row }">{{ formatQty(row.qty) }}</template>
          </el-table-column>
          <el-table-column label="Remaining (to invoice)" width="190" align="right">
            <template #default="{ row }">{{ formatQty(row.remaining_qty ?? row.qty) }}</template>
          </el-table-column>
        </el-table>
        <div class="grand-total">
          <span class="grand-total-label">Total Delivered</span>
          <span class="grand-total-value">{{ formatQty(totalQty) }}</span>
        </div>
      </template>
      <template v-else>
        <div class="section-title">Pull quantities from order rows</div>
        <RemainingQtyPicker :rows="rows" v-model="qtyByItem" />
      </template>

      <div class="form-collab">
        <DocCollabPanel :doc-key="collabKey" />
      </div>
    </div>
  </div>
</template>
