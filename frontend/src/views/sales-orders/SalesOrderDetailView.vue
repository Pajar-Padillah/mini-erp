<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesOrderApi } from '../../api/salesOrderApi'
import { apiErrorMessage } from '../../api/client'
import StatusTag from '../../components/StatusTag.vue'
import PageHeader from '../../components/PageHeader.vue'
import { formatMoney, formatQty } from '../../utils/format'
import type { SalesOrder } from '../../types/salesOrder'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
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
    await ElMessageBox.confirm(t('salesOrders.detail.confirmSubmitMessage'), t('common.confirmSubmitTitle'), { type: 'warning' })
  } catch {
    return
  }
  await run(() => salesOrderApi.submit(Number(props.id)), t('salesOrders.detail.submitted'))
}

async function unsubmit() {
  try {
    await ElMessageBox.confirm(t('salesOrders.detail.confirmUnsubmitMessage'), t('common.confirmUnsubmitTitle'), { type: 'warning' })
  } catch {
    return
  }
  await run(() => salesOrderApi.unsubmit(Number(props.id)), t('salesOrders.detail.unsubmitted'))
}

async function remove() {
  await ElMessageBox.confirm(t('salesOrders.detail.confirmDeleteMessage'), t('common.confirmTitle'), { type: 'warning' })
  try {
    await salesOrderApi.remove(Number(props.id))
    ElMessage.success(t('salesOrders.detail.deleted'))
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
    <PageHeader :title="order.order_no" :subtitle="order.customer_name" :breadcrumb="{ label: t('salesOrders.detail.breadcrumb'), to: '/sales-orders' }" show-back>
      <template #badges><StatusTag :status="order.document_status" /></template>
      <template #actions>
        <el-button v-if="order.document_status === 'DRAFT'" @click="router.push({ name: 'sales-orders-edit', params: { id: order.id } })">{{ t('common.edit') }}</el-button>
        <el-button v-if="order.document_status === 'DRAFT'" type="primary" :loading="busy" @click="submit">{{ t('common.submit') }}</el-button>
        <el-button v-if="order.document_status === 'ACTIVE'" type="warning" :loading="busy" @click="unsubmit">{{ t('common.unsubmit') }}</el-button>
        <el-button v-if="order.document_status === 'DRAFT'" type="danger" @click="remove">{{ t('common.delete') }}</el-button>
        <el-button v-if="order.document_status === 'ACTIVE' || order.document_status === 'PROCESSED'" type="success" @click="createDelivery">{{ t('salesOrders.detail.createDelivery') }}</el-button>
      </template>
    </PageHeader>

    <div class="summary-grid">
      <div class="summary-card"><div class="label">{{ t('salesOrders.detail.customer') }}</div><div class="value">{{ order.customer_name }}</div></div>
      <div class="summary-card"><div class="label">{{ t('salesOrders.detail.orderDate') }}</div><div class="value">{{ order.order_date?.slice(0, 10) }}</div></div>
      <div class="summary-card"><div class="label">{{ t('common.total') }}</div><div class="value">{{ formatMoney(order.total_amount) }}</div></div>
      <div class="summary-card"><div class="label">{{ t('salesOrders.detail.company') }}</div><div class="value">{{ order.company?.code }}</div></div>
    </div>

    <div class="section-title">{{ t('common.items') }}</div>
    <el-table :data="order.items" size="small">
      <el-table-column :label="t('common.product')">
        <template #default="{ row }">{{ row.product?.name ?? row.product_id }}</template>
      </el-table-column>
      <el-table-column :label="t('salesOrders.detail.qtyOrdered')" width="140">
        <template #default="{ row }">{{ formatQty(row.qty_ordered) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.remaining')" width="140">
        <template #default="{ row }">{{ formatQty(row.remaining_qty ?? row.qty_ordered) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.price')" width="160">
        <template #default="{ row }">{{ formatMoney(row.unit_price) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.total')" width="160" align="right">
        <template #default="{ row }">{{ formatMoney(Number(row.qty_ordered) * Number(row.unit_price)) }}</template>
      </el-table-column>
    </el-table>

    <div class="grand-total">
      <span class="grand-total-label">{{ t('common.grandTotal') }}</span>
      <span class="grand-total-value">{{ formatMoney(order.total_amount) }}</span>
    </div>

    <template v-if="order.notes">
      <div class="section-title">{{ t('common.notes') }}</div>
      <p style="color: var(--gray-700); margin: 0">{{ order.notes }}</p>
    </template>
  </div>
</template>
