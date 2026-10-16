<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Box, Calendar, Tickets, User } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesDeliveryApi } from '../../api/salesDeliveryApi'
import { apiErrorMessage } from '../../api/client'
import StatusTag from '../../components/StatusTag.vue'
import PageHeader from '../../components/PageHeader.vue'
import DetailStat from '../../components/detail/DetailStat.vue'
import DetailCard from '../../components/detail/DetailCard.vue'
import DocCollabPanel from '../../components/doc-collab/DocCollabPanel.vue'
import { docKey } from '../../stores/docCollabStore'
import { formatDate, formatQty } from '../../utils/format'
import type { SalesDelivery } from '../../types/salesDelivery'

const props = defineProps<{ id: string }>()
const router = useRouter()
const delivery = ref<SalesDelivery | null>(null)
const busy = ref(false)
const totalQty = computed(() => delivery.value?.items.reduce((a, i) => a + Number(i.qty), 0) ?? 0)

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
    await ElMessageBox.confirm('Submit this delivery? Stock will be deducted.', 'Confirm Submit', { type: 'warning' })
  } catch {
    return
  }
  await run(() => salesDeliveryApi.submit(Number(props.id)), 'Delivery submitted — stock deducted')
}

async function unsubmit() {
  try {
    await ElMessageBox.confirm('Unsubmit this delivery? Stock will be restored.', 'Confirm Unsubmit', { type: 'warning' })
  } catch {
    return
  }
  await run(() => salesDeliveryApi.unsubmit(Number(props.id)), 'Delivery unsubmitted — stock restored')
}

async function remove() {
  await ElMessageBox.confirm('Delete this DRAFT delivery?', 'Confirm', { type: 'warning' })
  try {
    await salesDeliveryApi.remove(Number(props.id))
    ElMessage.success('Delivery deleted')
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
  <div class="page detail-page" v-if="delivery">
    <PageHeader :title="delivery.delivery_no" :breadcrumb="{ label: 'Deliveries', to: '/sales-deliveries' }" show-back>
      <template #badges><StatusTag :status="delivery.document_status" /></template>
      <template #actions>
        <el-button v-if="delivery.document_status === 'DRAFT'" @click="router.push({ name: 'sales-deliveries-edit', params: { id: delivery.id } })">Edit</el-button>
        <el-button v-if="delivery.document_status === 'DRAFT'" type="primary" :loading="busy" @click="submit">Submit</el-button>
        <el-button v-if="delivery.document_status === 'ACTIVE'" type="warning" plain :loading="busy" @click="unsubmit">Unsubmit</el-button>
        <el-button v-if="delivery.document_status === 'DRAFT'" type="danger" plain @click="remove">Delete</el-button>
        <el-button v-if="delivery.document_status === 'ACTIVE' || delivery.document_status === 'PROCESSED'" type="primary" @click="createInvoice">Create Invoice</el-button>
      </template>
    </PageHeader>

    <div class="detail-stats">
      <DetailStat
        label="Sales order"
        :value="delivery.sales_order?.order_no ?? String(delivery.sales_order_id)"
        :to="{ name: 'sales-orders-detail', params: { id: delivery.sales_order_id } }"
        :icon="Tickets"
      />
      <DetailStat label="Customer" :value="delivery.sales_order?.customer_name ?? '-'" :icon="User" tone="gray" />
      <DetailStat label="Delivery date" :value="formatDate(delivery.delivery_date)" :icon="Calendar" tone="amber" />
      <DetailStat label="Qty delivered" :value="formatQty(totalQty)" :hint="`${delivery.items.length} line(s)`" :icon="Box" tone="green" />
    </div>

    <DetailCard title="Items" :subtitle="`${delivery.items.length} line(s) · ${formatQty(totalQty)} unit(s) delivered`">
      <el-table :data="delivery.items" size="small">
        <el-table-column label="#" width="50">
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column label="Product" min-width="240">
          <template #default="{ row }">
            <div class="detail-product-name">{{ row.product?.name ?? row.product_id }}</div>
            <div v-if="row.product?.sku" class="detail-product-sku">{{ row.product.sku }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Qty delivered" width="150" align="right">
          <template #default="{ row }">{{ formatQty(row.qty) }}</template>
        </el-table-column>
        <el-table-column label="Remaining (to invoice)" width="190" align="right">
          <template #default="{ row }">{{ formatQty(row.remaining_qty ?? row.qty) }}</template>
        </el-table-column>
      </el-table>
      <template #footer>
        <dl class="detail-totals">
          <dt class="is-grand">Total delivered</dt><dd class="is-grand">{{ formatQty(totalQty) }}</dd>
        </dl>
      </template>
    </DetailCard>

    <DetailCard title="Notes">
      <p class="detail-notes" :class="{ 'is-empty': !delivery.notes }">{{ delivery.notes || 'No notes.' }}</p>
    </DetailCard>

    <DocCollabPanel :doc-key="docKey('sales-delivery', props.id)" />
  </div>
</template>
