<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
    await ElMessageBox.confirm('Submit this invoice? It will become ACTIVE and ready for payment.', 'Confirm Submit', { type: 'warning' })
  } catch {
    return
  }
  await run(() => salesInvoiceApi.submit(Number(props.id)), 'Invoice submitted — now ACTIVE')
}

async function unsubmit() {
  try {
    await ElMessageBox.confirm('Unsubmit this invoice? It will go back to DRAFT.', 'Confirm Unsubmit', { type: 'warning' })
  } catch {
    return
  }
  await run(() => salesInvoiceApi.unsubmit(Number(props.id)), 'Invoice unsubmitted — back to DRAFT')
}

async function remove() {
  await ElMessageBox.confirm('Delete this DRAFT invoice?', 'Confirm', { type: 'warning' })
  try {
    await salesInvoiceApi.remove(Number(props.id))
    ElMessage.success('Invoice deleted')
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
    <PageHeader :title="invoice.invoice_no" subtitle="Document Status tracks payment allocation progress. Payment Status tracks how much has actually been paid — two independent fields." :breadcrumb="{ label: 'Invoices', to: '/sales-invoices' }" show-back>
      <template #badges>
        <StatusTag :status="invoice.document_status" />
        <PaymentStatusTag :status="invoice.payment_status" />
      </template>
      <template #actions>
        <el-button v-if="invoice.document_status === 'DRAFT'" @click="router.push({ name: 'sales-invoices-edit', params: { id: invoice.id } })">Edit</el-button>
        <el-button v-if="invoice.document_status === 'DRAFT'" type="primary" :loading="busy" @click="submit">Submit</el-button>
        <el-button v-if="invoice.document_status === 'ACTIVE'" type="warning" :loading="busy" @click="unsubmit">Unsubmit</el-button>
        <el-button v-if="invoice.document_status === 'DRAFT'" type="danger" @click="remove">Delete</el-button>
        <el-button v-if="invoice.document_status === 'ACTIVE' || invoice.document_status === 'PROCESSED'" type="success" @click="createPayment">Create Payment</el-button>
      </template>
    </PageHeader>

    <div class="summary-grid">
      <div class="summary-card" v-if="sourceDeliveryItem"><div class="label">Sales Delivery</div><div class="value">
        <router-link :to="{ name: 'sales-deliveries-detail', params: { id: sourceDeliveryItem.sales_delivery_id } }">
          {{ sourceDeliveryItem.sales_delivery?.delivery_no ?? sourceDeliveryItem.sales_delivery_id }}
        </router-link>
      </div></div>
      <div class="summary-card"><div class="label">Total</div><div class="value">{{ formatMoney(invoice.total_amount) }}</div></div>
      <div class="summary-card"><div class="label">Paid</div><div class="value">{{ formatMoney(invoice.paid_amount) }}</div></div>
      <div class="summary-card"><div class="label">Outstanding</div><div class="value">{{ formatMoney(outstanding) }}</div></div>
      <div class="summary-card"><div class="label">Invoice Date</div><div class="value">{{ invoice.invoice_date?.slice(0, 10) }}</div></div>
    </div>

    <div class="section-title">Items</div>
    <el-table :data="invoice.items" size="small">
      <el-table-column label="Product">
        <template #default="{ row }">{{ row.product?.name ?? row.product_id }}</template>
      </el-table-column>
      <el-table-column label="Qty" width="120">
        <template #default="{ row }">{{ formatQty(row.qty) }}</template>
      </el-table-column>
      <el-table-column label="Price" width="160">
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

    <template v-if="invoice.notes">
      <div class="section-title">Notes</div>
      <p style="color: var(--gray-700); margin: 0">{{ invoice.notes }}</p>
    </template>
  </div>
</template>
