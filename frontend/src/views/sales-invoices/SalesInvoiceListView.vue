<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSalesInvoiceStore } from '../../stores/salesInvoiceStore'
import { useCompanyStore } from '../../stores/companyStore'
import StatusTag from '../../components/StatusTag.vue'
import PaymentStatusTag from '../../components/PaymentStatusTag.vue'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import { formatMoney } from '../../utils/format'

const store = useSalesInvoiceStore()
const companyStore = useCompanyStore()
const router = useRouter()
const statusFilter = ref('')
const paymentStatusFilter = ref('')
const search = ref('')
const page = ref(1)
const pageSize = 10

async function reload() {
  if (!companyStore.selectedCompanyId) return
  await store.fetchList({
    status: statusFilter.value || undefined,
    payment_status: paymentStatusFilter.value || undefined,
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
watch([statusFilter, paymentStatusFilter], () => {
  page.value = 1
  reload()
})
watch(page, reload)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return store.list
  return store.list.filter((i) => i.invoice_no.toLowerCase().includes(q))
})
</script>

<template>
  <div class="page">
    <PageHeader title="Sales Invoices" subtitle="Document Status tracks payment allocation progress; Payment Status tracks how much has been paid.">
      <template #actions>
        <el-button type="primary" @click="router.push({ name: 'sales-invoices-new' })">+ New Invoice</el-button>
      </template>
    </PageHeader>

    <div class="filter-bar">
      <el-input v-model="search" placeholder="Search by invoice no..." clearable style="width: 280px" />
      <el-select v-model="statusFilter" placeholder="Document status" clearable style="width: 180px">
        <el-option label="DRAFT" value="DRAFT" />
        <el-option label="ACTIVE" value="ACTIVE" />
        <el-option label="PROCESSED" value="PROCESSED" />
        <el-option label="COMPLETED" value="COMPLETED" />
      </el-select>
      <el-select v-model="paymentStatusFilter" placeholder="Payment status" clearable style="width: 180px">
        <el-option label="UNPAID" value="UNPAID" />
        <el-option label="PARTIALLY_PAID" value="PARTIALLY_PAID" />
        <el-option label="PAID" value="PAID" />
      </el-select>
    </div>

    <el-table
      :data="filtered"
      v-loading="store.loading"
      row-class-name="clickable-row"
      @row-click="(row: any) => router.push({ name: 'sales-invoices-detail', params: { id: row.id } })"
    >
      <el-table-column prop="invoice_no" label="Invoice No" min-width="200" />
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
    </el-table>

    <PaginationBar v-if="store.meta" v-model:page="page" :page-size="pageSize" :total="store.meta.total_items" />
  </div>
</template>
