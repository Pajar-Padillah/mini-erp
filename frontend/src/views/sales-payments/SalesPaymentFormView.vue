<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesInvoiceApi } from '../../api/salesInvoiceApi'
import { salesPaymentApi } from '../../api/salesPaymentApi'
import { useCompanyStore } from '../../stores/companyStore'
import { apiErrorMessage } from '../../api/client'
import InvoiceAllocationPicker, { type AllocationRow } from '../../components/InvoiceAllocationPicker.vue'
import PageHeader from '../../components/PageHeader.vue'
import { formatMoney } from '../../utils/format'
import type { SalesInvoice } from '../../types/salesInvoice'

const props = defineProps<{ id?: string }>()
const isEdit = !!props.id

const route = useRoute()
const router = useRouter()
const companyStore = useCompanyStore()
const submitting = ref(false)
const pendingAction = ref<'draft' | 'submit' | 'save' | null>(null)
const loading = ref(isEdit)

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

onMounted(async () => {
  availableInvoices.value = await salesInvoiceApi.listPickable()

  if (isEdit && props.id) {
    try {
      const payment = await salesPaymentApi.get(Number(props.id))
      if (payment.document_status !== 'DRAFT') {
        ElMessage.warning('Only DRAFT payments can be edited')
        router.replace({ name: 'sales-payments-detail', params: { id: props.id } })
        return
      }
      form.payment_date = payment.payment_date.slice(0, 10)
      form.payment_method = payment.payment_method ?? ''
      form.notes = payment.notes ?? ''
      const prefill: Record<number, string> = {}
      for (const alloc of payment.allocations) {
        await ensureInvoiceLoaded(alloc.sales_invoice_id)
        prefill[alloc.sales_invoice_id] = alloc.amount
      }
      selectedInvoiceIds.value = payment.allocations.map((a) => a.sales_invoice_id)
      amountByInvoice.value = prefill
    } catch (err) {
      ElMessage.error(apiErrorMessage(err))
    } finally {
      loading.value = false
    }
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
  let payment = await salesPaymentApi.create({
    company_id: companyStore.selectedCompanyId!,
    payment_date: form.payment_date,
    payment_method: form.payment_method,
    notes: form.notes,
    allocations,
  })
  if (!thenSubmit) {
    ElMessage.success(`Created ${payment.payment_no}`)
    return payment
  }
  try {
    payment = await salesPaymentApi.submit(payment.id)
    ElMessage.success(`Created and submitted ${payment.payment_no}`)
  } catch (err) {
    ElMessage.warning(`Created ${payment.payment_no} as a draft, but submit failed: ${apiErrorMessage(err)}`)
  }
  return payment
}

function actionFor(thenSubmit: boolean): 'draft' | 'submit' | 'save' {
  if (isEdit) return 'save'
  if (thenSubmit) return 'submit'
  return 'draft'
}

async function submit(thenSubmit = false) {
  const allocations = Object.entries(amountByInvoice.value)
    .filter(([id, amt]) => Number(amt) > 0 && selectedInvoiceIds.value.includes(Number(id)))
    .map(([invoiceId, amount]) => ({ sales_invoice_id: Number(invoiceId), amount }))
  if (allocations.length === 0) {
    ElMessage.warning('Enter at least one allocation amount')
    return
  }
  if (!isEdit && !companyStore.selectedCompanyId) {
    ElMessage.warning('Select a company first')
    return
  }
  if (thenSubmit) {
    try {
      await ElMessageBox.confirm('Create and submit this payment? It will be allocated to the selected invoice(s).', 'Confirm Submit', { type: 'warning' })
    } catch {
      return
    }
  }
  submitting.value = true
  pendingAction.value = actionFor(thenSubmit)
  try {
    if (isEdit && props.id) {
      const payment = await salesPaymentApi.update(Number(props.id), {
        payment_date: form.payment_date,
        payment_method: form.payment_method,
        notes: form.notes,
        allocations,
      })
      ElMessage.success(`Updated ${payment.payment_no}`)
      router.push({ name: 'sales-payments-detail', params: { id: payment.id } })
    } else {
      const payment = await createPayment(allocations, thenSubmit)
      router.push({ name: 'sales-payments-detail', params: { id: payment.id } })
    }
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  } finally {
    submitting.value = false
    pendingAction.value = null
  }
}
</script>

<template>
  <div class="page">
    <PageHeader
      :title="isEdit ? 'Edit Sales Payment' : 'New Sales Payment'"
      :subtitle="isEdit ? 'Only DRAFT payments can be edited.' : 'Allocate one payment across one or more invoices.'"
      :breadcrumb="{ label: 'Payments', to: '/sales-payments' }"
      show-back
    />

    <div class="card" v-loading="loading">
      <el-form label-position="top" class="form-grid">
        <el-form-item label="Payment Date">
          <el-date-picker v-model="form.payment_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Method">
          <el-input v-model="form.payment_method" placeholder="e.g. TRANSFER" />
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
          <el-input v-model="form.notes" type="textarea" :rows="1" placeholder="Optional" />
        </el-form-item>
      </el-form>

      <div class="section-title">Allocate to invoices</div>
      <InvoiceAllocationPicker :rows="rows" v-model="amountByInvoice" />

      <div class="form-footer">
        <el-button @click="router.back()">Cancel</el-button>
        <template v-if="isEdit">
          <el-button type="primary" :loading="submitting" @click="submit()">Save Changes</el-button>
        </template>
        <template v-else>
          <el-button :loading="pendingAction === 'draft'" :disabled="submitting" @click="submit(false)">Create Draft</el-button>
          <el-button type="primary" :loading="pendingAction === 'submit'" :disabled="submitting" @click="submit(true)">
            Create &amp; Submit
          </el-button>
        </template>
      </div>
    </div>
  </div>
</template>
