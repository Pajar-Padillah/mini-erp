<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Calendar, Money, OfficeBuilding, User } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesOrderApi } from '../../api/salesOrderApi'
import { apiErrorMessage } from '../../api/client'
import StatusTag from '../../components/StatusTag.vue'
import PageHeader from '../../components/PageHeader.vue'
import DetailStat from '../../components/detail/DetailStat.vue'
import DetailCard from '../../components/detail/DetailCard.vue'
import DocCollabPanel from '../../components/doc-collab/DocCollabPanel.vue'
import { docKey } from '../../stores/docCollabStore'
import { formatDate, formatMoney, formatQty } from '../../utils/format'
import type { SalesOrder } from '../../types/salesOrder'

const props = defineProps<{ id: string }>()
const router = useRouter()
const order = ref<SalesOrder | null>(null)
const busy = ref(false)
const totalQty = computed(() => order.value?.items.reduce((a, i) => a + Number(i.qty_ordered), 0) ?? 0)

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
  <div class="page detail-page" v-if="order">
    <PageHeader :title="order.order_no" :breadcrumb="{ label: 'Sales Orders', to: '/sales-orders' }" show-back>
      <template #badges><StatusTag :status="order.document_status" /></template>
      <template #actions>
        <el-button v-if="order.document_status === 'DRAFT'" @click="router.push({ name: 'sales-orders-edit', params: { id: order.id } })">Edit</el-button>
        <el-button v-if="order.document_status === 'DRAFT'" type="primary" :loading="busy" @click="submit">Submit</el-button>
        <el-button v-if="order.document_status === 'ACTIVE'" type="warning" plain :loading="busy" @click="unsubmit">Unsubmit</el-button>
        <el-button v-if="order.document_status === 'DRAFT'" type="danger" plain @click="remove">Delete</el-button>
        <el-button v-if="order.document_status === 'ACTIVE' || order.document_status === 'PROCESSED'" type="primary" @click="createDelivery">Create Delivery</el-button>
      </template>
    </PageHeader>

    <div class="detail-stats">
      <DetailStat label="Customer" :value="order.customer_name" :icon="User" />
      <DetailStat label="Order date" :value="formatDate(order.order_date)" :icon="Calendar" tone="gray" />
      <DetailStat label="Total" :value="formatMoney(order.total_amount)" :hint="`${order.items.length} line(s)`" :icon="Money" tone="green" />
      <DetailStat label="Company" :value="order.company?.name ?? order.company?.code ?? '-'" :hint="order.company?.code" :icon="OfficeBuilding" tone="amber" />
    </div>

    <DetailCard title="Items" :subtitle="`${order.items.length} line(s) · ${formatQty(totalQty)} unit(s) ordered`">
      <el-table :data="order.items" size="small">
        <el-table-column label="#" width="50">
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column label="Product" min-width="240">
          <template #default="{ row }">
            <div class="detail-product-name">{{ row.product?.name ?? row.product_id }}</div>
            <div v-if="row.product?.sku" class="detail-product-sku">{{ row.product.sku }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Qty ordered" width="130" align="right">
          <template #default="{ row }">{{ formatQty(row.qty_ordered) }}</template>
        </el-table-column>
        <el-table-column label="Remaining" width="130" align="right">
          <template #default="{ row }">{{ formatQty(row.remaining_qty ?? row.qty_ordered) }}</template>
        </el-table-column>
        <el-table-column label="Price" width="160" align="right">
          <template #default="{ row }">{{ formatMoney(row.unit_price) }}</template>
        </el-table-column>
        <el-table-column label="Total" width="170" align="right">
          <template #default="{ row }">{{ formatMoney(Number(row.qty_ordered) * Number(row.unit_price)) }}</template>
        </el-table-column>
      </el-table>
      <template #footer>
        <dl class="detail-totals">
          <dt>Total qty</dt><dd>{{ formatQty(totalQty) }}</dd>
          <dt class="is-grand">Grand total</dt><dd class="is-grand">{{ formatMoney(order.total_amount) }}</dd>
        </dl>
      </template>
    </DetailCard>

    <DetailCard title="Notes">
      <p class="detail-notes" :class="{ 'is-empty': !order.notes }">{{ order.notes || 'No notes.' }}</p>
    </DetailCard>

    <DocCollabPanel :doc-key="docKey('sales-order', props.id)" />
  </div>
</template>
