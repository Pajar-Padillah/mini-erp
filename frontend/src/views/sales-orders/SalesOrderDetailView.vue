<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesOrderApi } from '../../api/salesOrderApi'
import { apiErrorMessage } from '../../api/client'
import StatusTag from '../../components/StatusTag.vue'
import PageHeader from '../../components/PageHeader.vue'
import { formatMoney, formatQty } from '../../utils/format'
import type { SalesOrder } from '../../types/salesOrder'

const props = defineProps<{ id: string }>()
const router = useRouter()
const order = ref<SalesOrder | null>(null)
const busy = ref(false)

async function load() {
  order.value = await salesOrderApi.get(Number(props.id))
}
onMounted(load)

async function run(action: () => Promise<SalesOrder>, successMessage: string) {
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
    await ElMessageBox.confirm('Submit this order? It will become ACTIVE and ready for delivery.', 'Confirm Submit', { type: 'warning' })
  } catch {
    return
  }
  await run(() => salesOrderApi.submit(Number(props.id)), 'Order submitted — now ACTIVE')
}

async function unsubmit() {
  try {
    await ElMessageBox.confirm('Unsubmit this order? It will go back to DRAFT.', 'Confirm Unsubmit', { type: 'warning' })
  } catch {
    return
  }
  await run(() => salesOrderApi.unsubmit(Number(props.id)), 'Order unsubmitted — back to DRAFT')
}

async function remove() {
  await ElMessageBox.confirm('Delete this DRAFT order?', 'Confirm', { type: 'warning' })
  try {
    await salesOrderApi.remove(Number(props.id))
    ElMessage.success('Order deleted')
    router.push({ name: 'sales-orders-list' })
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  }
}

function createDelivery() {
  router.push({ name: 'sales-deliveries-new', query: { sales_order_id: props.id } })
}
</script>

<template>
  <div class="page" v-if="order">
    <PageHeader :title="order.order_no" :subtitle="order.customer_name" :breadcrumb="{ label: 'Sales Orders', to: '/sales-orders' }" show-back>
      <template #badges><StatusTag :status="order.document_status" /></template>
      <template #actions>
        <el-button v-if="order.document_status === 'DRAFT'" @click="router.push({ name: 'sales-orders-edit', params: { id: order.id } })">Edit</el-button>
        <el-button v-if="order.document_status === 'DRAFT'" type="primary" :loading="busy" @click="submit">Submit</el-button>
        <el-button v-if="order.document_status === 'ACTIVE'" type="warning" :loading="busy" @click="unsubmit">Unsubmit</el-button>
        <el-button v-if="order.document_status === 'DRAFT'" type="danger" @click="remove">Delete</el-button>
        <el-button v-if="order.document_status === 'ACTIVE' || order.document_status === 'PROCESSED'" type="success" @click="createDelivery">Create Delivery</el-button>
      </template>
    </PageHeader>

    <div class="summary-grid">
      <div class="summary-card"><div class="label">Customer</div><div class="value">{{ order.customer_name }}</div></div>
      <div class="summary-card"><div class="label">Order Date</div><div class="value">{{ order.order_date?.slice(0, 10) }}</div></div>
      <div class="summary-card"><div class="label">Total</div><div class="value">{{ formatMoney(order.total_amount) }}</div></div>
      <div class="summary-card"><div class="label">Company</div><div class="value">{{ order.company?.code }}</div></div>
    </div>

    <div class="section-title">Items</div>
    <el-table :data="order.items" size="small">
      <el-table-column label="Product">
        <template #default="{ row }">{{ row.product?.name ?? row.product_id }}</template>
      </el-table-column>
      <el-table-column label="Qty Ordered" width="140">
        <template #default="{ row }">{{ formatQty(row.qty_ordered) }}</template>
      </el-table-column>
      <el-table-column label="Remaining" width="140">
        <template #default="{ row }">{{ formatQty(row.remaining_qty ?? row.qty_ordered) }}</template>
      </el-table-column>
      <el-table-column label="Unit Price" width="160">
        <template #default="{ row }">{{ formatMoney(row.unit_price) }}</template>
      </el-table-column>
    </el-table>

    <template v-if="order.notes">
      <div class="section-title">Notes</div>
      <p style="color: var(--gray-700); margin: 0">{{ order.notes }}</p>
    </template>
  </div>
</template>
