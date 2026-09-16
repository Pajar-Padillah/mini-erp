<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesPaymentApi } from '../../api/salesPaymentApi'
import { apiErrorMessage } from '../../api/client'
import StatusTag from '../../components/StatusTag.vue'
import PageHeader from '../../components/PageHeader.vue'
import { formatMoney } from '../../utils/format'
import type { SalesPayment } from '../../types/salesPayment'

const props = defineProps<{ id: string }>()
const router = useRouter()
const payment = ref<SalesPayment | null>(null)
const busy = ref(false)

async function load() {
  payment.value = await salesPaymentApi.get(Number(props.id))
}
onMounted(load)

async function run(action: () => Promise<SalesPayment>, successMessage: string) {
  busy.value = true
  try {
    await action()
    ElMessage.success(successMessage)
    await load()
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  } finally {
    busy.value = false
  }
}

async function submit() {
  try {
    await ElMessageBox.confirm('Submit this payment? It will be allocated to the selected invoice(s).', 'Confirm Submit', { type: 'warning' })
  } catch {
    return
  }
  await run(() => salesPaymentApi.submit(Number(props.id)), 'Payment submitted — allocated to invoice(s)')
}

async function unsubmit() {
  try {
    await ElMessageBox.confirm('Unsubmit this payment? Its allocations will be reversed.', 'Confirm Unsubmit', { type: 'warning' })
  } catch {
    return
  }
  await run(() => salesPaymentApi.unsubmit(Number(props.id)), 'Payment unsubmitted — allocations reversed')
}

async function remove() {
  await ElMessageBox.confirm('Delete this DRAFT payment?', 'Confirm', { type: 'warning' })
  try {
    await salesPaymentApi.remove(Number(props.id))
    ElMessage.success('Payment deleted')
    router.push({ name: 'sales-payments-list' })
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  }
}
</script>

<template>
  <div class="page" v-if="payment">
    <PageHeader :title="payment.payment_no" subtitle="Payments can allocate across multiple invoices." :breadcrumb="{ label: 'Payments', to: '/sales-payments' }" show-back>
      <template #badges><StatusTag :status="payment.document_status" /></template>
      <template #actions>
        <el-button v-if="payment.document_status === 'DRAFT'" @click="router.push({ name: 'sales-payments-edit', params: { id: payment.id } })">Edit</el-button>
        <el-button v-if="payment.document_status === 'DRAFT'" type="primary" :loading="busy" @click="submit">Submit</el-button>
        <el-button v-if="payment.document_status === 'SUBMITTED'" type="warning" :loading="busy" @click="unsubmit">Unsubmit</el-button>
        <el-button v-if="payment.document_status === 'DRAFT'" type="danger" @click="remove">Delete</el-button>
      </template>
    </PageHeader>

    <div class="summary-grid">
      <div class="summary-card"><div class="label">Payment Date</div><div class="value">{{ payment.payment_date?.slice(0, 10) }}</div></div>
      <div class="summary-card"><div class="label">Method</div><div class="value">{{ payment.payment_method || '-' }}</div></div>
      <div class="summary-card"><div class="label">Total</div><div class="value">{{ formatMoney(payment.total_amount) }}</div></div>
    </div>

    <div class="section-title">Allocations</div>
    <el-table :data="payment.allocations" size="small">
      <el-table-column label="Invoice">
        <template #default="{ row }">
          <router-link :to="{ name: 'sales-invoices-detail', params: { id: row.sales_invoice_id } }">
            {{ row.sales_invoice?.invoice_no ?? row.sales_invoice_id }}
          </router-link>
        </template>
      </el-table-column>
      <el-table-column label="Amount" width="180">
        <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
      </el-table-column>
    </el-table>

    <div class="grand-total">
      <span class="grand-total-label">Total Allocated</span>
      <span class="grand-total-value">{{ formatMoney(payment.total_amount) }}</span>
    </div>

    <template v-if="payment.notes">
      <div class="section-title">Notes</div>
      <p style="color: var(--gray-700); margin: 0">{{ payment.notes }}</p>
    </template>
  </div>
</template>
