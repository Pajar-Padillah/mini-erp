<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesDeliveryApi } from '../../api/salesDeliveryApi'
import { apiErrorMessage } from '../../api/client'
import StatusTag from '../../components/StatusTag.vue'
import PageHeader from '../../components/PageHeader.vue'
import { formatQty } from '../../utils/format'
import type { SalesDelivery } from '../../types/salesDelivery'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
const router = useRouter()
const delivery = ref<SalesDelivery | null>(null)
const busy = ref(false)

async function load() {
  delivery.value = await salesDeliveryApi.get(Number(props.id))
}
onMounted(load)

async function run(action: () => Promise<SalesDelivery>, successMessage: string) {
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
    await ElMessageBox.confirm(t('salesDeliveries.detail.confirmSubmitMessage'), t('common.confirmSubmitTitle'), { type: 'warning' })
  } catch {
    return
  }
  await run(() => salesDeliveryApi.submit(Number(props.id)), t('salesDeliveries.detail.submitted'))
}

async function unsubmit() {
  try {
    await ElMessageBox.confirm(t('salesDeliveries.detail.confirmUnsubmitMessage'), t('common.confirmUnsubmitTitle'), { type: 'warning' })
  } catch {
    return
  }
  await run(() => salesDeliveryApi.unsubmit(Number(props.id)), t('salesDeliveries.detail.unsubmitted'))
}

async function remove() {
  await ElMessageBox.confirm(t('salesDeliveries.detail.confirmDeleteMessage'), t('common.confirmTitle'), { type: 'warning' })
  try {
    await salesDeliveryApi.remove(Number(props.id))
    ElMessage.success(t('salesDeliveries.detail.deleted'))
    router.push({ name: 'sales-deliveries-list' })
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  }
}

function createInvoice() {
  router.push({ name: 'sales-invoices-new', query: { sales_delivery_id: props.id } })
}
</script>

<template>
  <div class="page" v-if="delivery">
    <PageHeader
      :title="delivery.delivery_no"
      :subtitle="t('salesDeliveries.detail.fromOrder', { orderNo: delivery.sales_order?.order_no ?? t('salesDeliveries.detail.fromOrderFallback', { id: delivery.sales_order_id }) })"
      :breadcrumb="{ label: t('salesDeliveries.detail.breadcrumb'), to: '/sales-deliveries' }"
      show-back
    >
      <template #badges><StatusTag :status="delivery.document_status" /></template>
      <template #actions>
        <el-button v-if="delivery.document_status === 'DRAFT'" @click="router.push({ name: 'sales-deliveries-edit', params: { id: delivery.id } })">{{ t('common.edit') }}</el-button>
        <el-button v-if="delivery.document_status === 'DRAFT'" type="primary" :loading="busy" @click="submit">{{ t('common.submit') }}</el-button>
        <el-button v-if="delivery.document_status === 'ACTIVE'" type="warning" :loading="busy" @click="unsubmit">{{ t('common.unsubmit') }}</el-button>
        <el-button v-if="delivery.document_status === 'DRAFT'" type="danger" @click="remove">{{ t('common.delete') }}</el-button>
        <el-button v-if="delivery.document_status === 'ACTIVE' || delivery.document_status === 'PROCESSED'" type="success" @click="createInvoice">{{ t('salesDeliveries.detail.createInvoice') }}</el-button>
      </template>
    </PageHeader>

    <div class="summary-grid">
      <div class="summary-card"><div class="label">{{ t('salesDeliveries.detail.salesOrder') }}</div><div class="value">
        <router-link :to="{ name: 'sales-orders-detail', params: { id: delivery.sales_order_id } }">{{ delivery.sales_order?.order_no ?? delivery.sales_order_id }}</router-link>
      </div></div>
      <div class="summary-card"><div class="label">{{ t('salesDeliveries.detail.deliveryDate') }}</div><div class="value">{{ delivery.delivery_date?.slice(0, 10) }}</div></div>
    </div>

    <div class="section-title">{{ t('common.items') }}</div>
    <el-table :data="delivery.items" size="small">
      <el-table-column :label="t('common.product')">
        <template #default="{ row }">{{ row.product?.name ?? row.product_id }}</template>
      </el-table-column>
      <el-table-column :label="t('salesDeliveries.detail.qtyDelivered')" width="140">
        <template #default="{ row }">{{ formatQty(row.qty) }}</template>
      </el-table-column>
      <el-table-column :label="t('salesDeliveries.detail.remainingToInvoice')" width="180">
        <template #default="{ row }">{{ formatQty(row.remaining_qty ?? row.qty) }}</template>
      </el-table-column>
    </el-table>

    <template v-if="delivery.notes">
      <div class="section-title">{{ t('common.notes') }}</div>
      <p style="color: var(--gray-700); margin: 0">{{ delivery.notes }}</p>
    </template>
  </div>
</template>
