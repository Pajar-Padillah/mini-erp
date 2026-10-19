<script setup lang="ts">
import { computed, onMounted, reactive, ref, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesDeliveryApi } from '../../api/salesDeliveryApi'
import { salesInvoiceApi } from '../../api/salesInvoiceApi'
import { useCompanyStore } from '../../stores/companyStore'
import { apiErrorMessage } from '../../api/client'
import { formatMoney, formatQty } from '../../utils/format'
import RemainingQtyPicker, { type PickerRow } from '../../components/RemainingQtyPicker.vue'
import PageHeader from '../../components/PageHeader.vue'
import StatusTag from '../../components/StatusTag.vue'
import { Delete, Promotion, RefreshLeft, Wallet } from '@element-plus/icons-vue'
import FormDocActions, { type NextAction } from '../../components/doc-actions/FormDocActions.vue'
import type { DocRef } from '../../components/doc-actions/docActionsData'
import PaymentStatusTag from '../../components/PaymentStatusTag.vue'
import type { SalesDelivery } from '../../types/salesDelivery'
import type { SalesInvoice } from '../../types/salesInvoice'
import { useTabsStore } from '../../stores/tabsStore'
import DocCollabPanel from '../../components/doc-collab/DocCollabPanel.vue'
import { docKey, draftDocKey, useDocCollabStore } from '../../stores/docCollabStore'

// One page per document: a new invoice, a DRAFT (editable) or a submitted invoice (read-only).
const props = defineProps<{ id?: string }>()
const isNew = !props.id

// Attachments (and comments, once saved): a new document collects them under a draft key until it is saved.
const collab = useDocCollabStore()
const collabKey = isNew ? draftDocKey('sales-invoice') : docKey('sales-invoice', props.id!)
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

const invoice = ref<SalesInvoice | null>(null)
const status = computed(() => invoice.value?.document_status)

const availableDeliveries = ref<SalesDelivery[]>([])
const deliveryId = ref<number | null>(route.query.sales_delivery_id ? Number(route.query.sales_delivery_id) : null)
const delivery = ref<SalesDelivery | null>(null)

// A DRAFT whose source delivery cannot be determined can't be re-picked, so it stays read-only.
const missingDelivery = computed(() => !isNew && !!invoice.value && !deliveryId.value)
const readOnly = computed(() => !isNew && (status.value !== 'DRAFT' || missingDelivery.value))

const form = reactive({ invoice_date: new Date().toISOString().slice(0, 10), notes: '' })
const qtyByItem = ref<Record<number, string>>({})

const sourceDeliveryItem = computed(() => invoice.value?.items[0]?.source_delivery_item)
const deliveryNo = computed(
  () => delivery.value?.delivery_no ?? sourceDeliveryItem.value?.sales_delivery?.delivery_no ?? (deliveryId.value ? `#${deliveryId.value}` : '—'),
)
const outstanding = computed(() => (invoice.value ? Number(invoice.value.total_amount) - Number(invoice.value.paid_amount) : 0))

async function loadDelivery() {
  if (!deliveryId.value) return
  delivery.value = await salesDeliveryApi.get(deliveryId.value)
}

function fill(inv: SalesInvoice) {
  invoice.value = inv
  deliveryId.value = inv.items[0]?.source_delivery_item?.sales_delivery_id ?? null
  form.invoice_date = inv.invoice_date.slice(0, 10)
  form.notes = inv.notes ?? ''
  const prefill: Record<number, string> = {}
  for (const it of inv.items) prefill[it.source_delivery_item_id] = it.qty
  qtyByItem.value = prefill
}

async function load() {
  try {
    fill(await salesInvoiceApi.get(Number(props.id)))
    if (!readOnly.value) await loadDelivery()
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (!isNew) {
    await load()
    return
  }
  availableDeliveries.value = await salesDeliveryApi.listPickable()
  if (deliveryId.value) await loadDelivery()
})

async function onSelectDelivery(id: number) {
  deliveryId.value = id
  qtyByItem.value = {}
  delivery.value = null
  await loadDelivery()
}

const selectableDeliveries = computed<SalesDelivery[]>(() => {
  if (delivery.value && !availableDeliveries.value.some((d) => d.id === delivery.value!.id)) {
    return [delivery.value, ...availableDeliveries.value]
  }
  return availableDeliveries.value
})

const rows = computed<PickerRow[]>(() =>
  (delivery.value?.items ?? [])
    .filter((it) => Number(it.remaining_qty ?? it.qty) > 0 || Number(qtyByItem.value[it.id] ?? 0) > 0)
    .map((it) => ({
      sourceItemId: it.id,
      productName: it.product?.name ?? `Product #${it.product_id}`,
      available: it.remaining_qty ?? it.qty,
      unitPrice: it.unit_price,
    })),
)

async function createInvoice(items: { source_delivery_item_id: number; qty: string }[], thenSubmit: boolean) {
  let created = await salesInvoiceApi.create({
    company_id: companyStore.selectedCompanyId!,
    invoice_date: form.invoice_date,
    notes: form.notes,
    items,
  })
  if (!thenSubmit) {
    ElMessage.success(`Created ${created.invoice_no}`)
    return created
  }
  try {
    created = await salesInvoiceApi.submit(created.id)
    ElMessage.success(`Created and submitted ${created.invoice_no}`)
  } catch (err) {
    ElMessage.warning(`Created ${created.invoice_no} as a draft, but submit failed: ${apiErrorMessage(err)}`)
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
  if (!delivery.value) {
    ElMessage.warning('Select a sales delivery first')
    return
  }
  const items = Object.entries(qtyByItem.value)
    .filter(([, qty]) => Number(qty) > 0)
    .map(([sourceItemId, qty]) => ({ source_delivery_item_id: Number(sourceItemId), qty }))
  if (items.length === 0) {
    ElMessage.warning('Enter at least one quantity to invoice')
    return
  }
  if (isNew && !companyStore.selectedCompanyId) {
    ElMessage.warning('Select a company first')
    return
  }
  if (thenSubmit && !(await confirm(`${isNew ? 'Create and submit' : 'Save and submit'} this invoice? It will become ACTIVE and ready for payment.`, 'Confirm Submit'))) return
  submitting.value = true
  pendingAction.value = actionFor(thenSubmit)
  try {
    if (isNew) {
      const created = await createInvoice(items, thenSubmit)
      collab.moveThread(collabKey, docKey('sales-invoice', created.id))
      collabSaved = true
      router.push({ name: 'sales-invoices-detail', params: { id: created.id } })
      return
    }
    let updated = await salesInvoiceApi.update(Number(props.id), {
      invoice_date: form.invoice_date,
      notes: form.notes,
      items,
    })
    if (thenSubmit) {
      updated = await salesInvoiceApi.submit(updated.id)
      ElMessage.success(`Submitted ${updated.invoice_no} — now ACTIVE`)
    } else {
      ElMessage.success(`Updated ${updated.invoice_no}`)
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
  if (!(await confirm('Unsubmit this invoice? It will go back to DRAFT.', 'Confirm Unsubmit'))) return
  submitting.value = true
  pendingAction.value = 'unsubmit'
  try {
    await salesInvoiceApi.unsubmit(Number(props.id))
    ElMessage.success('Invoice unsubmitted — back to DRAFT')
    await load()
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  } finally {
    submitting.value = false
    pendingAction.value = null
  }
}

async function remove() {
  if (!(await confirm('Delete this DRAFT invoice?', 'Confirm'))) return
  try {
    await salesInvoiceApi.remove(Number(props.id))
    ElMessage.success('Invoice deleted')
    closeTab()
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  }
}

function createPayment() {
  router.push({ name: 'sales-payments-new', query: { sales_invoice_id: props.id } })
}

const docRef = computed<DocRef>(() => ({
  no: invoice.value?.invoice_no ?? '',
  type: 'Sales Invoice',
  status: status.value,
  amount: Number(invoice.value?.total_amount ?? 0),
  date: invoice.value?.invoice_date,
  party: undefined,
  collabKey,
}))

const nextActions = computed<NextAction[]>(() => {
  const list: NextAction[] = []
  if (status.value === 'ACTIVE' || status.value === 'PROCESSED') list.push({ key: 'create-payment', label: 'Create Payment', icon: Wallet })
  return list
})

function onNextAction(key: string) {
  if (key === 'create-payment') createPayment()
}

function duplicate() {
  router.push({ name: 'sales-invoices-new', query: deliveryId.value ? { sales_delivery_id: deliveryId.value } : {} })
}
</script>

<template>
  <div class="page">
    <PageHeader
      :title="isNew ? 'New Sales Invoice' : (invoice?.invoice_no ?? 'Sales Invoice')"
      :breadcrumb="{ label: 'Invoices', to: '/sales-invoices' }"
      show-back
    >
      <template v-if="invoice" #badges>
        <StatusTag :status="invoice.document_status" />
        <PaymentStatusTag :status="invoice.payment_status" />
      </template>
      <template #actions>
        <template v-if="isNew">
          <el-button type="warning" plain :loading="pendingAction === 'draft'" :disabled="submitting" @click="save(false)">Create Draft</el-button>
          <el-button type="primary" :loading="pendingAction === 'submit'" :disabled="submitting" @click="save(true)">
            Create &amp; Submit
          </el-button>
        </template>
        <template v-else-if="invoice">
          <el-button v-if="status === 'DRAFT'" type="danger" plain :icon="Delete" :disabled="submitting" @click="remove">Delete</el-button>
          <el-button v-if="status === 'DRAFT' && !missingDelivery" :loading="pendingAction === 'save'" :disabled="submitting" @click="save(false)">Update</el-button>
          <el-button v-if="status === 'DRAFT' && !missingDelivery" type="primary" :icon="Promotion" :loading="pendingAction === 'submit'" :disabled="submitting" @click="save(true)">Submit</el-button>
          <el-button v-if="status === 'ACTIVE'" type="warning" plain :icon="RefreshLeft" :loading="pendingAction === 'unsubmit'" :disabled="submitting" @click="unsubmit">Unsubmit</el-button>
          <FormDocActions :doc="docRef" :actions="nextActions" :loading="pendingAction === 'submit'" @select="onNextAction" @duplicate="duplicate" />
        </template>
      </template>
    </PageHeader>

    <div class="card" v-loading="loading">
      <el-alert
        v-if="missingDelivery && status === 'DRAFT'"
        type="warning"
        :closable="false"
        show-icon
        title="Could not determine the source delivery for this invoice, so it cannot be edited."
        style="margin-bottom: 16px"
      />
      <el-form label-position="top" class="form-grid" :disabled="readOnly">
        <el-form-item label="Sales Delivery" class="span-2">
          <el-select
            v-if="isNew"
            :model-value="deliveryId ?? undefined"
            filterable
            placeholder="Select a sales delivery"
            style="width: 100%"
            @update:model-value="onSelectDelivery"
          >
            <el-option v-for="d in selectableDeliveries" :key="d.id" :label="d.delivery_no" :value="d.id" />
          </el-select>
          <el-input v-else :model-value="deliveryNo || '-'" disabled />
        </el-form-item>
        <el-form-item label="Invoice Date">
          <el-date-picker v-model="form.invoice_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Notes" class="span-2">
          <el-input v-model="form.notes" type="textarea" :rows="1" :placeholder="readOnly ? '' : 'Optional'" />
        </el-form-item>
      </el-form>

      <template v-if="readOnly && invoice">
        <div class="section-title">Items</div>
        <el-table :data="invoice.items" size="small">
          <el-table-column label="Product" min-width="240">
            <template #default="{ row }">{{ row.product?.name ?? `Product #${row.product_id}` }}</template>
          </el-table-column>
          <el-table-column label="Qty" width="140" align="right">
            <template #default="{ row }">{{ formatQty(row.qty) }}</template>
          </el-table-column>
          <el-table-column label="Price" width="160" align="right">
            <template #default="{ row }">{{ formatMoney(row.unit_price) }}</template>
          </el-table-column>
          <el-table-column label="Total" width="160" align="right">
            <template #default="{ row }">{{ formatMoney(Number(row.qty) * Number(row.unit_price)) }}</template>
          </el-table-column>
        </el-table>
        <div class="grand-total">
          <span class="grand-total-label">Grand Total</span>
          <span class="grand-total-value">{{ formatMoney(invoice.total_amount) }}</span>
        </div>
        <div class="grand-total">
          <span class="grand-total-label">Paid</span>
          <span>{{ formatMoney(invoice.paid_amount) }}</span>
        </div>
        <div class="grand-total">
          <span class="grand-total-label">Outstanding</span>
          <span>{{ formatMoney(outstanding) }}</span>
        </div>
      </template>
      <template v-else>
        <div class="section-title">Pull quantities from delivery lines</div>
        <RemainingQtyPicker :rows="rows" v-model="qtyByItem" />
      </template>

      <div class="form-collab">
        <DocCollabPanel :doc-key="collabKey" />
      </div>
    </div>
  </div>
</template>
