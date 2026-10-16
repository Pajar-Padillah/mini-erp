<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSalesInvoiceStore } from '../../stores/salesInvoiceStore'
import { useCompanyStore } from '../../stores/companyStore'
import StatusTag from '../../components/StatusTag.vue'
import PaymentStatusTag from '../../components/PaymentStatusTag.vue'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import TransactionFilterBar, { type TransactionFilterState } from '../../components/TransactionFilterBar.vue'
import { docKey } from '../../stores/docCollabStore'
import DocActions from '../../components/doc-actions/DocActions.vue'
import RowActionsButton from '../../components/doc-actions/RowActionsButton.vue'
import type { DocRef } from '../../components/doc-actions/docActionsData'
import { formatMoney } from '../../utils/format'
import { currentMonthRange, matchesTransactionDate, matchesTransactionValue } from '../../utils/transactionFilters'

const store = useSalesInvoiceStore()
const companyStore = useCompanyStore()
const router = useRouter()
const filters = ref<TransactionFilterState>({
  dateRange: currentMonthRange(),
  status: [],
  secondaryStatus: [],
  conditions: [],
})
const fields = [
  { label: 'Invoice No', value: 'invoice_no' },
  { label: 'Sales Delivery', value: 'sales_delivery' },
  { label: 'Date', value: 'date' },
  { label: 'Total', value: 'total' },
  { label: 'Paid', value: 'paid' },
  { label: 'Document Status', value: 'status' },
  { label: 'Payment Status', value: 'payment_status' },
]
const statuses = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Processed', value: 'PROCESSED' },
  { label: 'Completed', value: 'COMPLETED' },
]
const paymentStatuses = [
  { label: 'Unpaid', value: 'UNPAID' },
  { label: 'Partially Paid', value: 'PARTIALLY_PAID' },
  { label: 'Paid', value: 'PAID' },
]
const page = ref(1)
const pageSize = 10

async function reload() {
  if (!companyStore.selectedCompanyId) return
  await store.fetchList({
    status: filters.value.status.join(',') || undefined,
    payment_status: filters.value.secondaryStatus.join(',') || undefined,
    page: page.value,
    page_size: pageSize,
  })
}

onMounted(async () => {
  await companyStore.loadCompanies()
  await reload()
})
watch(() => companyStore.selectedCompanyId, () => {
  page.value = 1
  reload()
})
watch([() => filters.value.status, () => filters.value.secondaryStatus], () => {
  page.value = 1
  reload()
}, { deep: true })
watch([() => filters.value.dateRange, () => filters.value.conditions], () => {
  page.value = 1
}, { deep: true })
watch(page, reload)

const filtered = computed(() => {
  return store.list.filter((invoice) => {
    const values: Record<string, string> = {
      invoice_no: invoice.invoice_no,
      sales_delivery: invoice.items?.[0]?.source_delivery_item?.sales_delivery?.delivery_no ?? '',
      date: invoice.invoice_date?.slice(0, 10) ?? '',
      total: formatMoney(invoice.total_amount),
      paid: formatMoney(invoice.paid_amount),
      status: invoice.document_status,
      payment_status: invoice.payment_status,
    }
    return (
      matchesTransactionDate(invoice.invoice_date, filters.value.dateRange) &&
      filters.value.conditions.every((condition) =>
        matchesTransactionValue(values[condition.field], condition),
      )
    )
  })
})

function resetFilters() {
  filters.value = {
    dateRange: currentMonthRange(),
    status: [],
    secondaryStatus: [],
    conditions: [],
  }
}

// Row actions: the ⋯ column and right-click open the same menu.
const docActions = ref<InstanceType<typeof DocActions>>()
function docOf(row: any): DocRef {
  return { no: row.invoice_no, type: 'Sales Invoice', status: row.document_status, amount: Number(row.total_amount), date: row.invoice_date, party: undefined, collabKey: docKey('sales-invoice', row.id) }
}
</script>

<template>
  <div class="page">
    <PageHeader title="Sales Invoices">
      <template #actions>
        <el-button type="primary" @click="router.push({ name: 'sales-invoices-new' })">+ New Invoice</el-button>
      </template>
    </PageHeader>

    <div class="card">
      <TransactionFilterBar
        v-model="filters"
        :fields="fields"
        :statuses="statuses"
        :secondary-statuses="paymentStatuses"
        :loading="store.loading"
        @reset="resetFilters"
        @refresh="reload"
      />

      <el-table
        :data="filtered"
        v-loading="store.loading"
        row-class-name="clickable-row"
        @row-contextmenu="(row: any, _column: any, event: MouseEvent) => docActions?.openMenu(event, docOf(row))"
        @row-click="(row: any) => router.push({ name: 'sales-invoices-detail', params: { id: row.id } })"
      >
        <el-table-column prop="invoice_no" label="Invoice No" min-width="200" />
        <el-table-column v-if="companyStore.isGroupSelected" label="Company" min-width="150">
          <template #default="{ row }">{{ companyStore.companyName(row.company_id) }}</template>
        </el-table-column>
        <el-table-column label="Sales Delivery" min-width="180">
          <template #default="{ row }">{{ row.items?.[0]?.source_delivery_item?.sales_delivery?.delivery_no ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="Date" width="120">
          <template #default="{ row }">{{ row.invoice_date?.slice(0, 10) }}</template>
        </el-table-column>
        <el-table-column label="Total" width="150">
          <template #default="{ row }">{{ formatMoney(row.total_amount) }}</template>
        </el-table-column>
        <el-table-column label="Paid" width="150">
          <template #default="{ row }">{{ formatMoney(row.paid_amount) }}</template>
        </el-table-column>
        <el-table-column label="Document Status" width="160">
          <template #default="{ row }"><StatusTag :status="row.document_status" /></template>
        </el-table-column>
        <el-table-column label="Payment Status" width="160">
          <template #default="{ row }"><PaymentStatusTag :status="row.payment_status" /></template>
        </el-table-column>
        <el-table-column label="" width="56" align="center" fixed="right" class-name="row-actions-col">
          <template #default="{ row }">
            <RowActionsButton :label="docOf(row).no" @open="(e: MouseEvent) => docActions?.openMenu(e, docOf(row))" />
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar v-if="store.meta" v-model:page="page" :page-size="pageSize" :total="store.meta.total_items" />
    </div>
    <DocActions ref="docActions" />
  </div>
</template>
