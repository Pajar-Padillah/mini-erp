<script setup lang="ts">
// Approval inbox: requests from every module waiting for the current user; a row opens its approval form.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import TransactionFilterBar from '../../components/TransactionFilterBar.vue'
import { useListFilter } from '../wms/useListFilter'
import { fmtDateTime } from '../wms/wmsUi'
import {
  APPROVAL_STATUS_COLOR, APPROVAL_STATUS_LABEL, tableLabel, useApprovalStore, type ApprovalRequest, type DecidedStatus,
} from '../../stores/approvalStore'

const router = useRouter()
const store = useApprovalStore()

const page = ref(1)
const pageSize = 10

const sorted = computed(() => [...store.requests].sort((a, b) => b.requestDate.localeCompare(a.requestDate)))
const { filters, fieldOptions, filtered, reset, refresh, refreshing } = useListFilter(() => sorted.value, {
  date: (r) => r.requestDate,
  status: (r) => r.status,
  fields: [
    { label: 'Transaction No', value: 'no', get: (r) => r.no },
    { label: 'Transaction Table', value: 'table', get: (r) => tableLabel(r.table) },
    { label: 'Request By User', value: 'requestedBy', get: (r) => r.requestedBy },
    { label: 'Division', value: 'division', get: (r) => r.division },
    { label: 'Transaction Company', value: 'office', get: (r) => r.office },
  ],
}, page)

const statusOptions = (Object.keys(APPROVAL_STATUS_LABEL) as DecidedStatus[]).map((s) => ({
  label: APPROVAL_STATUS_LABEL[s],
  value: s,
  color: APPROVAL_STATUS_COLOR[s],
}))

const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

function open(row: ApprovalRequest) {
  router.push({ name: 'pending-approvals-detail', params: { id: row.id } })
}
</script>

<template>
  <div class="page">
    <PageHeader title="Pending Approval List" subtitle="Requests from every module waiting for your approval." />

    <div class="card">
      <TransactionFilterBar
        v-model="filters"
        :fields="fieldOptions"
        :statuses="statusOptions"
        :loading="refreshing"
        @reset="reset"
        @refresh="refresh"
      />

      <el-table :data="paged" empty-text="Nothing waiting for your approval" class="is-clickable" @row-click="open">
        <el-table-column label="Request Date" width="160">
          <template #default="{ row }">{{ fmtDateTime(row.requestDate) }}</template>
        </el-table-column>
        <el-table-column label="Division" prop="division" width="120" />
        <el-table-column label="Request By User" prop="requestedBy" min-width="150" />
        <el-table-column label="Transaction Company" prop="office" min-width="190" />
        <el-table-column label="Transaction Table" width="160">
          <template #default="{ row }">{{ tableLabel(row.table) }}</template>
        </el-table-column>
        <el-table-column label="Transaction No" min-width="170">
          <template #default="{ row }"><span class="cell-strong">{{ row.no }}</span></template>
        </el-table-column>
        <el-table-column label="Approval Date" width="160">
          <template #default="{ row }">{{ row.approvalDate ? fmtDateTime(row.approvalDate) : '' }}</template>
        </el-table-column>
        <el-table-column label="Approval Status" width="140">
          <template #default="{ row }">
            <span v-if="row.status !== 'PENDING'" class="status-pill" :class="APPROVAL_STATUS_COLOR[row.status as DecidedStatus]">{{ APPROVAL_STATUS_LABEL[row.status as DecidedStatus] }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Last Updated On" width="160">
          <template #default="{ row }">{{ fmtDateTime(row.updatedAt) }}</template>
        </el-table-column>
      </el-table>

      <PaginationBar v-model:page="page" :page-size="pageSize" :total="filtered.length" />
    </div>
  </div>
</template>

<style scoped>
.is-clickable :deep(.el-table__row) {
  cursor: pointer;
}
</style>
