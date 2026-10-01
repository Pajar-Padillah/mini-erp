<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesInvoiceApi } from '../../api/salesInvoiceApi'
import { apiErrorMessage } from '../../api/client'
import StatusTag from '../../components/StatusTag.vue'
import PaymentStatusTag from '../../components/PaymentStatusTag.vue'
import PageHeader from '../../components/PageHeader.vue'
import { formatMoney, formatQty } from '../../utils/format'
import type { SalesInvoice } from '../../types/salesInvoice'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
const router = useRouter()
const invoice = ref<SalesInvoice | null>(null)
const busy = ref(false)

const outstanding = computed(() => {
  if (!invoice.value) return '0'
  return String(Number(invoice.value.total_amount) - Number(invoice.value.paid_amount))
})

const sourceDeliveryItem = computed(() => invoice.value?.items[0]?.source_delivery_item)

async function load() {
  invoice.value = await salesInvoiceApi.get(Number(props.id))
}
onMounted(load)

async function run(action: () => Promise<SalesInvoice>, successMessage: string) {
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
    await ElMessageBox.confirm(t('salesInvoices.detail.confirmSubmitMessage'), t('common.confirmSubmitTitle'), { type: 'warning' })
  } catch {
    return
  }
  await run(() => salesInvoiceApi.submit(Number(props.id)), t('salesInvoices.detail.submitted'))
}

async function unsubmit() {
  try {
    await ElMessageBox.confirm(t('salesInvoices.detail.confirmUnsubmitMessage'), t('common.confirmUnsubmitTitle'), { type: 'warning' })
  } catch {
    return
  }
  await run(() => salesInvoiceApi.unsubmit(Number(props.id)), t('salesInvoices.detail.unsubmitted'))
}

async function remove() {
  await ElMessageBox.confirm(t('salesInvoices.detail.confirmDeleteMessage'), t('common.confirmTitle'), { type: 'warning' })
  try {
    await salesInvoiceApi.remove(Number(props.id))
    ElMessage.success(t('salesInvoices.detail.deleted'))
    router.push({ name: 'sales-invoices-list' })
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  }
}

function createPayment() {
  router.push({ name: 'sales-payments-new', query: { sales_invoice_id: props.id } })
}
</script>

<template>
  <div class="page" v-if="invoice">
    <PageHeader :title="invoice.invoice_no" :subtitle="t('salesInvoices.detail.subtitle')" :breadcrumb="{ label: t('salesInvoices.detail.breadcrumb'), to: '/sales-invoices' }" show-back>
      <template #badges>
        <StatusTag :status="invoice.document_status" />
        <PaymentStatusTag :status="invoice.payment_status" />
      </template>
      <template #actions>
        <el-button v-if="invoice.document_status === 'DRAFT'" @click="router.push({ name: 'sales-invoices-edit', params: { id: invoice.id } })">{{ t('common.edit') }}</el-button>
        <el-button v-if="invoice.document_status === 'DRAFT'" type="primary" :loading="busy" @click="submit">{{ t('common.submit') }}</el-button>
        <el-button v-if="invoice.document_status === 'ACTIVE'" type="warning" :loading="busy" @click="unsubmit">{{ t('common.unsubmit') }}</el-button>
        <el-button v-if="invoice.document_status === 'DRAFT'" type="danger" @click="remove">{{ t('common.delete') }}</el-button>
        <el-button v-if="invoice.document_status === 'ACTIVE' || invoice.document_status === 'PROCESSED'" type="success" @click="createPayment">{{ t('salesInvoices.detail.createPayment') }}</el-button>
      </template>
    </PageHeader>

    <div class="summary-grid">
      <div class="summary-card" v-if="sourceDeliveryItem"><div class="label">{{ t('salesInvoices.detail.salesDelivery') }}</div><div class="value">
        <router-link :to="{ name: 'sales-deliveries-detail', params: { id: sourceDeliveryItem.sales_delivery_id } }">
          {{ sourceDeliveryItem.sales_delivery?.delivery_no ?? sourceDeliveryItem.sales_delivery_id }}
        </router-link>
      </div></div>
      <div class="summary-card"><div class="label">{{ t('common.total') }}</div><div class="value">{{ formatMoney(invoice.total_amount) }}</div></div>
      <div class="summary-card"><div class="label">{{ t('salesInvoices.detail.paid') }}</div><div class="value">{{ formatMoney(invoice.paid_amount) }}</div></div>
      <div class="summary-card"><div class="label">{{ t('salesInvoices.detail.outstanding') }}</div><div class="value">{{ formatMoney(outstanding) }}</div></div>
      <div class="summary-card"><div class="label">{{ t('salesInvoices.detail.invoiceDate') }}</div><div class="value">{{ invoice.invoice_date?.slice(0, 10) }}</div></div>
    </div>

    <div class="section-title">{{ t('common.items') }}</div>
    <el-table :data="invoice.items" size="small">
      <el-table-column :label="t('common.product')">
        <template #default="{ row }">{{ row.product?.name ?? row.product_id }}</template>
      </el-table-column>
      <el-table-column :label="t('common.qty')" width="120">
        <template #default="{ row }">{{ formatQty(row.qty) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.price')" width="160">
        <template #default="{ row }">{{ formatMoney(row.unit_price) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.total')" width="160" align="right">
        <template #default="{ row }">{{ formatMoney(Number(row.qty) * Number(row.unit_price)) }}</template>
      </el-table-column>
    </el-table>

    <div class="grand-total">
      <span class="grand-total-label">{{ t('common.grandTotal') }}</span>
      <span class="grand-total-value">{{ formatMoney(invoice.total_amount) }}</span>
    </div>

    <template v-if="invoice.notes">
      <div class="section-title">{{ t('common.notes') }}</div>
      <p style="color: var(--gray-700); margin: 0">{{ invoice.notes }}</p>
    </template>
  </div>
</template>
