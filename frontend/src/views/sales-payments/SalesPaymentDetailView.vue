<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesPaymentApi } from '../../api/salesPaymentApi'
import { apiErrorMessage } from '../../api/client'
import StatusTag from '../../components/StatusTag.vue'
import PageHeader from '../../components/PageHeader.vue'
import { formatMoney } from '../../utils/format'
import type { SalesPayment } from '../../types/salesPayment'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
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
    await ElMessageBox.confirm(t('salesPayments.detail.confirmSubmitMessage'), t('common.confirmSubmitTitle'), { type: 'warning' })
  } catch {
    return
  }
  await run(() => salesPaymentApi.submit(Number(props.id)), t('salesPayments.detail.submitted'))
}

async function unsubmit() {
  try {
    await ElMessageBox.confirm(t('salesPayments.detail.confirmUnsubmitMessage'), t('common.confirmUnsubmitTitle'), { type: 'warning' })
  } catch {
    return
  }
  await run(() => salesPaymentApi.unsubmit(Number(props.id)), t('salesPayments.detail.unsubmitted'))
}

async function remove() {
  await ElMessageBox.confirm(t('salesPayments.detail.confirmDeleteMessage'), t('common.confirmTitle'), { type: 'warning' })
  try {
    await salesPaymentApi.remove(Number(props.id))
    ElMessage.success(t('salesPayments.detail.deleted'))
    router.push({ name: 'sales-payments-list' })
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  }
}
</script>

<template>
  <div class="page" v-if="payment">
    <PageHeader :title="payment.payment_no" :subtitle="t('salesPayments.detail.subtitle')" :breadcrumb="{ label: t('salesPayments.detail.breadcrumb'), to: '/sales-payments' }" show-back>
      <template #badges><StatusTag :status="payment.document_status" /></template>
      <template #actions>
        <el-button v-if="payment.document_status === 'DRAFT'" @click="router.push({ name: 'sales-payments-edit', params: { id: payment.id } })">{{ t('common.edit') }}</el-button>
        <el-button v-if="payment.document_status === 'DRAFT'" type="primary" :loading="busy" @click="submit">{{ t('common.submit') }}</el-button>
        <el-button v-if="payment.document_status === 'SUBMITTED'" type="warning" :loading="busy" @click="unsubmit">{{ t('common.unsubmit') }}</el-button>
        <el-button v-if="payment.document_status === 'DRAFT'" type="danger" @click="remove">{{ t('common.delete') }}</el-button>
      </template>
    </PageHeader>

    <div class="summary-grid">
      <div class="summary-card"><div class="label">{{ t('salesPayments.detail.paymentDate') }}</div><div class="value">{{ payment.payment_date?.slice(0, 10) }}</div></div>
      <div class="summary-card"><div class="label">{{ t('salesPayments.detail.method') }}</div><div class="value">{{ payment.payment_method || '-' }}</div></div>
      <div class="summary-card"><div class="label">{{ t('common.total') }}</div><div class="value">{{ formatMoney(payment.total_amount) }}</div></div>
    </div>

    <div class="section-title">{{ t('salesPayments.detail.allocations') }}</div>
    <el-table :data="payment.allocations" size="small">
      <el-table-column :label="t('salesPayments.detail.invoice')">
        <template #default="{ row }">
          <router-link :to="{ name: 'sales-invoices-detail', params: { id: row.sales_invoice_id } }">
            {{ row.sales_invoice?.invoice_no ?? row.sales_invoice_id }}
          </router-link>
        </template>
      </el-table-column>
      <el-table-column :label="t('salesPayments.detail.amount')" width="180">
        <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
      </el-table-column>
    </el-table>

    <div class="grand-total">
      <span class="grand-total-label">{{ t('pickers.totalAllocated') }}</span>
      <span class="grand-total-value">{{ formatMoney(payment.total_amount) }}</span>
    </div>

    <template v-if="payment.notes">
      <div class="section-title">{{ t('common.notes') }}</div>
      <p style="color: var(--gray-700); margin: 0">{{ payment.notes }}</p>
    </template>
  </div>
</template>
