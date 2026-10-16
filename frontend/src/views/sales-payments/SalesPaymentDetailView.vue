<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Calendar, CreditCard, Document, Money } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesPaymentApi } from '../../api/salesPaymentApi'
import { apiErrorMessage } from '../../api/client'
import StatusTag from '../../components/StatusTag.vue'
import PageHeader from '../../components/PageHeader.vue'
import DetailStat from '../../components/detail/DetailStat.vue'
import DetailCard from '../../components/detail/DetailCard.vue'
import DocCollabPanel from '../../components/doc-collab/DocCollabPanel.vue'
import { docKey } from '../../stores/docCollabStore'
import { formatDate, formatMoney } from '../../utils/format'
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
  <div class="page detail-page" v-if="payment">
    <PageHeader :title="payment.payment_no" :breadcrumb="{ label: 'Payments', to: '/sales-payments' }" show-back>
      <template #badges><StatusTag :status="payment.document_status" /></template>
      <template #actions>
        <el-button v-if="payment.document_status === 'DRAFT'" @click="router.push({ name: 'sales-payments-edit', params: { id: payment.id } })">Edit</el-button>
        <el-button v-if="payment.document_status === 'DRAFT'" type="primary" :loading="busy" @click="submit">Submit</el-button>
        <el-button v-if="payment.document_status === 'SUBMITTED'" type="warning" plain :loading="busy" @click="unsubmit">Unsubmit</el-button>
        <el-button v-if="payment.document_status === 'DRAFT'" type="danger" plain @click="remove">Delete</el-button>
      </template>
    </PageHeader>

    <div class="detail-stats">
      <DetailStat label="Payment date" :value="formatDate(payment.payment_date)" :icon="Calendar" tone="gray" />
      <DetailStat label="Method" :value="payment.payment_method || '-'" :icon="CreditCard" tone="amber" />
      <DetailStat label="Invoices" :value="String(payment.allocations.length)" hint="Allocated in this payment" :icon="Document" />
      <DetailStat label="Total" :value="formatMoney(payment.total_amount)" :icon="Money" tone="green" />
    </div>

    <DetailCard title="Allocations" :subtitle="`${payment.allocations.length} invoice(s) settled by this payment`">
      <el-table :data="payment.allocations" size="small">
        <el-table-column label="#" width="50">
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
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
      <template #footer>
        <dl class="detail-totals">
          <dt class="is-grand">Total allocated</dt><dd class="is-grand">{{ formatMoney(payment.total_amount) }}</dd>
        </dl>
      </template>
    </DetailCard>

    <DetailCard title="Notes">
      <p class="detail-notes" :class="{ 'is-empty': !payment.notes }">{{ payment.notes || 'No notes.' }}</p>
    </DetailCard>

    <DocCollabPanel :doc-key="docKey('sales-payment', props.id)" />
  </div>
</template>
