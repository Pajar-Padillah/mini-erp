<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSalesPaymentStore } from '../../stores/salesPaymentStore'
import { useCompanyStore } from '../../stores/companyStore'
import StatusTag from '../../components/StatusTag.vue'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import TransactionFilterBar, { type TransactionFilterState } from '../../components/TransactionFilterBar.vue'
import { docKey } from '../../stores/docCollabStore'
import DocActions from '../../components/doc-actions/DocActions.vue'
import RowActionsButton from '../../components/doc-actions/RowActionsButton.vue'
import type { DocRef } from '../../components/doc-actions/docActionsData'
import { formatMoney } from '../../utils/format'
import { currentMonthRange, matchesTransactionDate, matchesTransactionValue } from '../../utils/transactionFilters'

const store = useSalesPaymentStore()
const companyStore = useCompanyStore()
const router = useRouter()
const filters = ref<TransactionFilterState>({
  dateRange: currentMonthRange(),
  status: [],
  secondaryStatus: [],
  conditions: [],
})
const fields = [
  { label: 'Payment No', value: 'payment_no' },
  { label: 'Date', value: 'date' },
  { label: 'Method', value: 'method' },
  { label: 'Total', value: 'total' },
  { label: 'Status', value: 'status' },
]
const statuses = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Submitted', value: 'SUBMITTED' },
]
const page = ref(1)
const pageSize = 10

async function reload() {
  if (!companyStore.selectedCompanyId) return
  await store.fetchList({ status: filters.value.status.join(',') || undefined, page: page.value, page_size: pageSize })
}

onMounted(async () => {
  await companyStore.loadCompanies()
  await reload()
})
watch(() => companyStore.selectedCompanyId, () => {
  page.value = 1
  reload()
})
watch(() => filters.value.status, () => {
  page.value = 1
  reload()
}, { deep: true })
watch([() => filters.value.dateRange, () => filters.value.conditions], () => {
  page.value = 1
}, { deep: true })
watch(page, reload)

const filtered = computed(() => {
  return store.list.filter((payment) => {
    const values: Record<string, string> = {
      payment_no: payment.payment_no,
      date: payment.payment_date?.slice(0, 10) ?? '',
      method: payment.payment_method ?? '',
      total: formatMoney(payment.total_amount),
      status: payment.document_status,
    }
    return (
      matchesTransactionDate(payment.payment_date, filters.value.dateRange) &&
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
  return { no: row.payment_no, type: 'Sales Payment', status: row.document_status, amount: Number(row.total_amount), date: row.payment_date, party: undefined, collabKey: docKey('sales-payment', row.id) }
}
</script>

<template>
  <div class="page">
    <PageHeader title="Sales Payments">
      <template #actions>
        <el-button type="primary" @click="router.push({ name: 'sales-payments-new' })">+ New Payment</el-button>
      </template>
    </PageHeader>

    <div class="card">
      <TransactionFilterBar
        v-model="filters"
        :fields="fields"
        :statuses="statuses"
        :loading="store.loading"
        @reset="resetFilters"
        @refresh="reload"
      />

      <el-table
        :data="filtered"
        v-loading="store.loading"
        row-class-name="clickable-row"
        @row-contextmenu="(row: any, _column: any, event: MouseEvent) => docActions?.openMenu(event, docOf(row))"
        @row-click="(row: any) => router.push({ name: 'sales-payments-detail', params: { id: row.id } })"
      >
        <el-table-column prop="payment_no" label="Payment No" min-width="200" />
        <el-table-column v-if="companyStore.isGroupSelected" label="Company" min-width="150">
          <template #default="{ row }">{{ companyStore.companyName(row.company_id) }}</template>
        </el-table-column>
        <el-table-column label="Date" width="120">
          <template #default="{ row }">{{ row.payment_date?.slice(0, 10) }}</template>
        </el-table-column>
        <el-table-column prop="payment_method" label="Method" min-width="160" />
        <el-table-column label="Total" width="160">
          <template #default="{ row }">{{ formatMoney(row.total_amount) }}</template>
        </el-table-column>
        <el-table-column label="Status" width="140">
          <template #default="{ row }"><StatusTag :status="row.document_status" /></template>
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
