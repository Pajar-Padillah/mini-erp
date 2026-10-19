<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesInvoiceApi } from '../../api/salesInvoiceApi'
import { salesPaymentApi } from '../../api/salesPaymentApi'
import { useCompanyStore } from '../../stores/companyStore'
import { apiErrorMessage } from '../../api/client'
import InvoiceAllocationPicker, { type AllocationRow } from '../../components/InvoiceAllocationPicker.vue'
import PageHeader from '../../components/PageHeader.vue'
import StatusTag from '../../components/StatusTag.vue'
import { Delete, Promotion, RefreshLeft } from '@element-plus/icons-vue'
import FormDocActions from '../../components/doc-actions/FormDocActions.vue'
import type { DocRef } from '../../components/doc-actions/docActionsData'
import { formatMoney } from '../../utils/format'
import type { SalesInvoice } from '../../types/salesInvoice'
import type { SalesPayment } from '../../types/salesPayment'
import { useTabsStore } from '../../stores/tabsStore'
import DocCollabPanel from '../../components/doc-collab/DocCollabPanel.vue'
import { docKey, draftDocKey, useDocCollabStore } from '../../stores/docCollabStore'

// One page per document: a new payment, a DRAFT (editable) or a submitted payment (read-only).
const props = defineProps<{ id?: string }>()
const isNew = !props.id

// Attachments (and comments, once saved): a new document collects them under a draft key until it is saved.
const collab = useDocCollabStore()
const collabKey = isNew ? draftDocKey('sales-payment') : docKey('sales-payment', props.id!)
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

const payment = ref<SalesPayment | null>(null)
const status = computed(() => payment.value?.document_status)
const readOnly = computed(() => !isNew && status.value !== 'DRAFT')

const availableInvoices = ref<SalesInvoice[]>([])
const selectedInvoiceIds = ref<number[]>([])
const amountByInvoice = ref<Record<number, string>>({})

const form = reactive({ payment_date: new Date().toISOString().slice(0, 10), payment_method: 'TRANSFER', notes: '' })

async function ensureInvoiceLoaded(id: number) {
  if (!id || availableInvoices.value.some((i) => i.id === id)) return
  const inv = await salesInvoiceApi.get(id)
  availableInvoices.value.push(inv)
}

watch(selectedInvoiceIds, (ids) => {
  for (const key of Object.keys(amountByInvoice.value)) {
    if (!ids.includes(Number(key))) delete amountByInvoice.value[Number(key)]
  }
})

async function fill(p: SalesPayment) {
  payment.value = p
  form.payment_date = p.payment_date.slice(0, 10)
  form.payment_method = p.payment_method ?? ''
  form.notes = p.notes ?? ''
  const prefill: Record<number, string> = {}
  for (const alloc of p.allocations) {
    await ensureInvoiceLoaded(alloc.sales_invoice_id)
    prefill[alloc.sales_invoice_id] = alloc.amount
  }
  selectedInvoiceIds.value = p.allocations.map((a) => a.sales_invoice_id)
  amountByInvoice.value = prefill
}

async function load() {
  try {
    await fill(await salesPaymentApi.get(Number(props.id)))
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  availableInvoices.value = await salesInvoiceApi.listPickable()

  if (!isNew) {
    await load()
  } else {
    const preselect = route.query.sales_invoice_id
    if (preselect) {
      await ensureInvoiceLoaded(Number(preselect))
      selectedInvoiceIds.value = [Number(preselect)]
    }
  }
})

const selectedInvoices = computed(() => availableInvoices.value.filter((inv) => selectedInvoiceIds.value.includes(inv.id)))

const rows = computed<AllocationRow[]>(() =>
  selectedInvoices.value.map((inv) => {
    const outstanding = Number(inv.total_amount) - Number(inv.paid_amount)
    return { invoiceId: inv.id, invoiceNo: inv.invoice_no, outstanding: String(outstanding) }
  }),
)

async function createPayment(allocations: { sales_invoice_id: number; amount: string }[], thenSubmit: boolean) {
  let created = await salesPaymentApi.create({
    company_id: companyStore.selectedCompanyId!,
    payment_date: form.payment_date,
    payment_method: form.payment_method,
    notes: form.notes,
    allocations,
  })
  if (!thenSubmit) {
    ElMessage.success(`Created ${created.payment_no}`)
    return created
  }
  try {
    created = await salesPaymentApi.submit(created.id)
    ElMessage.success(`Created and submitted ${created.payment_no}`)
  } catch (err) {
    ElMessage.warning(`Created ${created.payment_no} as a draft, but submit failed: ${apiErrorMessage(err)}`)
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
  const allocations = Object.entries(amountByInvoice.value)
    .filter(([id, amt]) => Number(amt) > 0 && selectedInvoiceIds.value.includes(Number(id)))
    .map(([invoiceId, amount]) => ({ sales_invoice_id: Number(invoiceId), amount }))
  if (allocations.length === 0) {
    ElMessage.warning('Enter at least one allocation amount')
    return
  }
  if (isNew && !companyStore.selectedCompanyId) {
    ElMessage.warning('Select a company first')
    return
  }
  if (thenSubmit && !(await confirm(`${isNew ? 'Create and submit' : 'Save and submit'} this payment? It will be allocated to the selected invoice(s).`, 'Confirm Submit'))) return
  submitting.value = true
  pendingAction.value = actionFor(thenSubmit)
  try {
    if (isNew) {
      const created = await createPayment(allocations, thenSubmit)
      collab.moveThread(collabKey, docKey('sales-payment', created.id))
      collabSaved = true
      router.push({ name: 'sales-payments-detail', params: { id: created.id } })
      return
    }
    let updated = await salesPaymentApi.update(Number(props.id), {
      payment_date: form.payment_date,
      payment_method: form.payment_method,
      notes: form.notes,
      allocations,
    })
    if (thenSubmit) {
      updated = await salesPaymentApi.submit(updated.id)
      ElMessage.success(`Submitted ${updated.payment_no} — allocated to invoice(s)`)
    } else {
      ElMessage.success(`Updated ${updated.payment_no}`)
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
  if (!(await confirm('Unsubmit this payment? Its allocations will be reversed.', 'Confirm Unsubmit'))) return
  submitting.value = true
  pendingAction.value = 'unsubmit'
  try {
    await salesPaymentApi.unsubmit(Number(props.id))
    ElMessage.success('Payment unsubmitted — allocations reversed')
    await load()
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  } finally {
    submitting.value = false
    pendingAction.value = null
  }
}

async function remove() {
  if (!(await confirm('Delete this DRAFT payment?', 'Confirm'))) return
  try {
    await salesPaymentApi.remove(Number(props.id))
    ElMessage.success('Payment deleted')
    closeTab()
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  }
}

const docRef = computed<DocRef>(() => ({
  no: payment.value?.payment_no ?? '',
  type: 'Sales Payment',
  status: status.value,
  amount: Number(payment.value?.total_amount ?? 0),
  date: payment.value?.payment_date,
  party: undefined,
  collabKey,
}))

function duplicate() {
  router.push({ name: 'sales-payments-new', query: payment.value?.allocations[0] ? { sales_invoice_id: payment.value.allocations[0].sales_invoice_id } : {} })
}
</script>

<template>
  <div class="page">
    <PageHeader
      :title="isNew ? 'New Sales Payment' : (payment?.payment_no ?? 'Sales Payment')"
      :breadcrumb="{ label: 'Payments', to: '/sales-payments' }"
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
        <template v-else-if="payment">
          <el-button v-if="status === 'DRAFT'" type="danger" plain :icon="Delete" :disabled="submitting" @click="remove">Delete</el-button>
          <el-button v-if="status === 'DRAFT'" :loading="pendingAction === 'save'" :disabled="submitting" @click="save(false)">Update</el-button>
          <el-button v-if="status === 'DRAFT'" type="primary" :icon="Promotion" :loading="pendingAction === 'submit'" :disabled="submitting" @click="save(true)">Submit</el-button>
          <el-button v-if="status === 'SUBMITTED'" type="warning" plain :icon="RefreshLeft" :loading="pendingAction === 'unsubmit'" :disabled="submitting" @click="unsubmit">Unsubmit</el-button>
          <FormDocActions :doc="docRef" :actions="[]" :loading="pendingAction === 'submit'" @duplicate="duplicate" />
        </template>
      </template>
    </PageHeader>

    <div class="card" v-loading="loading">
      <el-form label-position="top" class="form-grid" :disabled="readOnly">
        <el-form-item label="Payment Date">
          <el-date-picker v-model="form.payment_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Method">
          <el-input v-model="form.payment_method" :placeholder="readOnly ? '' : 'e.g. TRANSFER'" />
        </el-form-item>
        <el-form-item label="Invoices" class="span-2">
          <el-select v-model="selectedInvoiceIds" multiple filterable placeholder="Select one or more invoices" style="width: 100%">
            <el-option
              v-for="inv in availableInvoices"
              :key="inv.id"
              :label="`${inv.invoice_no} — outstanding ${formatMoney(String(Number(inv.total_amount) - Number(inv.paid_amount)))}`"
              :value="inv.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Notes" class="span-2">
          <el-input v-model="form.notes" type="textarea" :rows="1" :placeholder="readOnly ? '' : 'Optional'" />
        </el-form-item>
      </el-form>

      <div class="section-title">Allocate to invoices</div>
      <template v-if="readOnly && payment">
        <el-table :data="payment.allocations" size="small" border>
          <el-table-column label="Invoice" min-width="220">
            <template #default="{ row }">
              <router-link :to="{ name: 'sales-invoices-detail', params: { id: row.sales_invoice_id } }" class="detail-product-name">
                {{ row.sales_invoice?.invoice_no ?? row.sales_invoice_id }}
              </router-link>
            </template>
          </el-table-column>
          <el-table-column label="Invoice total" width="180" align="right">
            <template #default="{ row }">{{ row.sales_invoice ? formatMoney(row.sales_invoice.total_amount) : '-' }}</template>
          </el-table-column>
          <el-table-column label="Amount" width="180" align="right">
            <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
          </el-table-column>
        </el-table>
        <div class="grand-total">
          <span class="grand-total-label">Total Allocated</span>
          <span class="grand-total-value">{{ formatMoney(payment.total_amount) }}</span>
        </div>
      </template>
      <InvoiceAllocationPicker v-else :rows="rows" v-model="amountByInvoice" />

      <div class="form-collab">
        <DocCollabPanel :doc-key="collabKey" />
      </div>
    </div>
  </div>
</template>
