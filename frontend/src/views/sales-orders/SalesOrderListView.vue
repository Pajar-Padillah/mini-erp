<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSalesOrderStore } from '../../stores/salesOrderStore'
import { useCompanyStore } from '../../stores/companyStore'
import StatusTag from '../../components/StatusTag.vue'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import { formatMoney } from '../../utils/format'

const store = useSalesOrderStore()
const companyStore = useCompanyStore()
const router = useRouter()
const statusFilter = ref('')
const search = ref('')
const page = ref(1)
const pageSize = 10

async function reload() {
  if (!companyStore.selectedCompanyId) return
  await store.fetchList({ status: statusFilter.value || undefined, page: page.value, page_size: pageSize })
}

onMounted(async () => {
  await companyStore.loadCompanies()
  await reload()
})
watch(() => companyStore.selectedCompanyId, () => {
  page.value = 1
  reload()
})
watch(statusFilter, () => {
  page.value = 1
  reload()
})
watch(page, reload)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return store.list
  return store.list.filter((o) => o.order_no.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q))
})
</script>

<template>
  <div class="page">
    <PageHeader title="Sales Orders" subtitle="Manage sales orders and their delivery/invoice/payment progress.">
      <template #actions>
        <el-button type="primary" @click="router.push({ name: 'sales-orders-new' })">+ New Sales Order</el-button>
      </template>
    </PageHeader>

    <div class="card">
      <div class="filter-bar">
        <el-input v-model="search" placeholder="Search by order no or customer..." clearable style="width: 280px" />
        <el-select v-model="statusFilter" placeholder="Filter by status" clearable style="width: 180px">
          <el-option label="DRAFT" value="DRAFT" />
          <el-option label="ACTIVE" value="ACTIVE" />
          <el-option label="PROCESSED" value="PROCESSED" />
          <el-option label="COMPLETED" value="COMPLETED" />
        </el-select>
      </div>

      <el-table
        :data="filtered"
        v-loading="store.loading"
        row-class-name="clickable-row"
        @row-click="(row: any) => router.push({ name: 'sales-orders-detail', params: { id: row.id } })"
      >
        <el-table-column prop="order_no" label="Order No" min-width="180" />
        <el-table-column prop="customer_name" label="Customer" min-width="200" />
        <el-table-column prop="order_date" label="Date" width="120">
          <template #default="{ row }">{{ row.order_date?.slice(0, 10) }}</template>
        </el-table-column>
        <el-table-column label="Total" width="160">
          <template #default="{ row }">{{ formatMoney(row.total_amount) }}</template>
        </el-table-column>
        <el-table-column label="Status" width="140">
          <template #default="{ row }"><StatusTag :status="row.document_status" /></template>
        </el-table-column>
      </el-table>

      <PaginationBar v-if="store.meta" v-model:page="page" :page-size="pageSize" :total="store.meta.total_items" />
    </div>
  </div>
</template>
