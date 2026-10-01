<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()
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
        ElMessage.warning(t('salesPayments.form.onlyDraftEditable'))
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
    ElMessage.success(t('salesPayments.form.created', { no: payment.payment_no }))
    return payment
  }
  try {
    payment = await salesPaymentApi.submit(payment.id)
    ElMessage.success(t('salesPayments.form.createdAndSubmitted', { no: payment.payment_no }))
  } catch (err) {
    ElMessage.warning(t('salesPayments.form.createdDraftSubmitFailed', { no: payment.payment_no, error: apiErrorMessage(err) }))
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
    ElMessage.warning(t('salesPayments.form.enterAtLeastOneAllocation'))
    return
  }
  if (!isEdit && !companyStore.selectedCompanyId) {
    ElMessage.warning(t('common.selectCompanyFirst'))
    return
  }
  if (thenSubmit) {
    try {
      await ElMessageBox.confirm(t('salesPayments.form.confirmSubmitMessage'), t('common.confirmSubmitTitle'), { type: 'warning' })
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
      ElMessage.success(t('salesPayments.form.updated', { no: payment.payment_no }))
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
      :title="isEdit ? t('salesPayments.form.titleEdit') : t('salesPayments.form.titleNew')"
      :subtitle="isEdit ? t('salesPayments.form.subtitleEdit') : t('salesPayments.form.subtitleNew')"
      :breadcrumb="{ label: t('salesPayments.form.breadcrumb'), to: '/sales-payments' }"
      show-back
    />

    <div class="card" v-loading="loading">
      <el-form label-position="top" class="form-grid">
        <el-form-item :label="t('salesPayments.form.paymentDate')">
          <el-date-picker v-model="form.payment_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('salesPayments.form.method')">
          <el-input v-model="form.payment_method" :placeholder="t('salesPayments.form.methodPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('salesPayments.form.invoices')" class="span-2">
          <el-select v-model="selectedInvoiceIds" multiple filterable :placeholder="t('salesPayments.form.invoicesPlaceholder')" style="width: 100%">
            <el-option
              v-for="inv in availableInvoices"
              :key="inv.id"
              :label="t('salesPayments.form.invoiceOption', { no: inv.invoice_no, amount: formatMoney(String(Number(inv.total_amount) - Number(inv.paid_amount))) })"
              :value="inv.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.notes')" class="span-2">
          <el-input v-model="form.notes" type="textarea" :rows="1" :placeholder="t('common.optional')" />
        </el-form-item>
      </el-form>

      <div class="section-title">{{ t('salesPayments.form.allocateToInvoices') }}</div>
      <InvoiceAllocationPicker :rows="rows" v-model="amountByInvoice" />

      <div class="form-footer">
        <el-button @click="router.back()">{{ t('common.cancel') }}</el-button>
        <template v-if="isEdit">
          <el-button type="primary" :loading="submitting" @click="submit()">{{ t('common.saveChanges') }}</el-button>
        </template>
        <template v-else>
          <el-button type="warning" plain :loading="pendingAction === 'draft'" :disabled="submitting" @click="submit(false)">{{ t('common.createDraft') }}</el-button>
          <el-button type="primary" :loading="pendingAction === 'submit'" :disabled="submitting" @click="submit(true)">
            {{ t('common.createAndSubmit') }}
          </el-button>
        </template>
      </div>
    </div>
  </div>
</template>
