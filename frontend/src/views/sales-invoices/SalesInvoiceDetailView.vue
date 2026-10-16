<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Calendar, CircleCheck, Money, Van, Warning } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesInvoiceApi } from '../../api/salesInvoiceApi'
import { apiErrorMessage } from '../../api/client'
import StatusTag from '../../components/StatusTag.vue'
import PaymentStatusTag from '../../components/PaymentStatusTag.vue'
import PageHeader from '../../components/PageHeader.vue'
import DetailStat from '../../components/detail/DetailStat.vue'
import DetailCard from '../../components/detail/DetailCard.vue'
import DocCollabPanel from '../../components/doc-collab/DocCollabPanel.vue'
import { docKey } from '../../stores/docCollabStore'
import { formatDate, formatMoney, formatQty } from '../../utils/format'
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
  <div class="page detail-page" v-if="invoice">
    <PageHeader :title="invoice.invoice_no" :breadcrumb="{ label: 'Invoices', to: '/sales-invoices' }" show-back>
      <template #badges>
        <StatusTag :status="invoice.document_status" />
        <PaymentStatusTag :status="invoice.payment_status" />
      </template>
      <template #actions>
        <el-button v-if="invoice.document_status === 'DRAFT'" @click="router.push({ name: 'sales-invoices-edit', params: { id: invoice.id } })">Edit</el-button>
        <el-button v-if="invoice.document_status === 'DRAFT'" type="primary" :loading="busy" @click="submit">Submit</el-button>
        <el-button v-if="invoice.document_status === 'ACTIVE'" type="warning" plain :loading="busy" @click="unsubmit">Unsubmit</el-button>
        <el-button v-if="invoice.document_status === 'DRAFT'" type="danger" plain @click="remove">Delete</el-button>
        <el-button v-if="invoice.document_status === 'ACTIVE' || invoice.document_status === 'PROCESSED'" type="primary" @click="createPayment">Create Payment</el-button>
      </template>
    </PageHeader>

    <div class="detail-stats">
      <DetailStat
        v-if="sourceDeliveryItem"
        label="Sales delivery"
        :value="sourceDeliveryItem.sales_delivery?.delivery_no ?? String(sourceDeliveryItem.sales_delivery_id)"
        :to="{ name: 'sales-deliveries-detail', params: { id: sourceDeliveryItem.sales_delivery_id } }"
        :icon="Van"
      />
      <DetailStat label="Invoice date" :value="formatDate(invoice.invoice_date)" :icon="Calendar" tone="gray" />
      <DetailStat label="Total" :value="formatMoney(invoice.total_amount)" :hint="`${invoice.items.length} line(s)`" :icon="Money" />
      <DetailStat label="Paid" :value="formatMoney(invoice.paid_amount)" :icon="CircleCheck" tone="green" />
      <DetailStat label="Outstanding" :value="formatMoney(outstanding)" :icon="Warning" :tone="Number(outstanding) > 0 ? 'red' : 'green'" />
    </div>

    <DetailCard title="Items" :subtitle="`${invoice.items.length} line(s)`">
      <el-table :data="invoice.items" size="small">
        <el-table-column label="#" width="50">
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column label="Product" min-width="240">
          <template #default="{ row }">
            <div class="detail-product-name">{{ row.product?.name ?? row.product_id }}</div>
            <div v-if="row.product?.sku" class="detail-product-sku">{{ row.product.sku }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Qty" width="120" align="right">
          <template #default="{ row }">{{ formatQty(row.qty) }}</template>
        </el-table-column>
        <el-table-column label="Price" width="160" align="right">
          <template #default="{ row }">{{ formatMoney(row.unit_price) }}</template>
        </el-table-column>
        <el-table-column label="Total" width="170" align="right">
          <template #default="{ row }">{{ formatMoney(Number(row.qty) * Number(row.unit_price)) }}</template>
        </el-table-column>
      </el-table>
      <template #footer>
        <dl class="detail-totals">
          <dt class="is-grand">Grand total</dt><dd class="is-grand">{{ formatMoney(invoice.total_amount) }}</dd>
          <dt>Paid</dt><dd>{{ formatMoney(invoice.paid_amount) }}</dd>
          <dt>Outstanding</dt><dd>{{ formatMoney(outstanding) }}</dd>
        </dl>
      </template>
    </DetailCard>

    <DetailCard title="Notes">
      <p class="detail-notes" :class="{ 'is-empty': !invoice.notes }">{{ invoice.notes || 'No notes.' }}</p>
    </DetailCard>

    <DocCollabPanel :doc-key="docKey('sales-invoice', props.id)" />
  </div>
</template>
