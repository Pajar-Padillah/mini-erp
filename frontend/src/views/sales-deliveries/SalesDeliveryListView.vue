<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSalesDeliveryStore } from '../../stores/salesDeliveryStore'
import { useCompanyStore } from '../../stores/companyStore'
import StatusTag from '../../components/StatusTag.vue'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'

const store = useSalesDeliveryStore()
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
  return store.list.filter((d) => d.delivery_no.toLowerCase().includes(q))
})
</script>

<template>
  <div class="page">
    <PageHeader title="Sales Deliveries" subtitle="Deliveries pulled from sales orders. Stock is deducted on submit.">
      <template #actions>
        <el-button type="primary" @click="router.push({ name: 'sales-deliveries-new' })">+ New Delivery</el-button>
      </template>
    </PageHeader>

    <div class="card">
      <div class="filter-bar">
        <el-input v-model="search" placeholder="Search by delivery no..." clearable style="width: 280px" />
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
        @row-click="(row: any) => router.push({ name: 'sales-deliveries-detail', params: { id: row.id } })"
      >
        <el-table-column prop="delivery_no" label="Delivery No" min-width="200" />
        <el-table-column label="Sales Order" min-width="200">
          <template #default="{ row }">{{ row.sales_order?.order_no ?? row.sales_order_id }}</template>
        </el-table-column>
        <el-table-column label="Date" width="120">
          <template #default="{ row }">{{ row.delivery_date?.slice(0, 10) }}</template>
        </el-table-column>
        <el-table-column label="Status" width="140">
          <template #default="{ row }"><StatusTag :status="row.document_status" /></template>
        </el-table-column>
      </el-table>

      <PaginationBar v-if="store.meta" v-model:page="page" :page-size="pageSize" :total="store.meta.total_items" />
    </div>
  </div>
</template>
