<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesOrderApi } from '../../api/salesOrderApi'
import { salesDeliveryApi } from '../../api/salesDeliveryApi'
import { useCompanyStore } from '../../stores/companyStore'
import { apiErrorMessage } from '../../api/client'
import RemainingQtyPicker, { type PickerRow } from '../../components/RemainingQtyPicker.vue'
import PageHeader from '../../components/PageHeader.vue'
import type { SalesOrder } from '../../types/salesOrder'

const props = defineProps<{ id?: string }>()
const isEdit = !!props.id

const route = useRoute()
const router = useRouter()
const companyStore = useCompanyStore()
const submitting = ref(false)
const pendingAction = ref<'draft' | 'submit' | 'save' | null>(null)
const loading = ref(isEdit)

const availableOrders = ref<SalesOrder[]>([])
const orderId = ref<number | null>(route.query.sales_order_id ? Number(route.query.sales_order_id) : null)
const order = ref<SalesOrder | null>(null)

const form = reactive({ delivery_date: new Date().toISOString().slice(0, 10), notes: '' })
const qtyByItem = ref<Record<number, string>>({})

async function loadOrder() {
  if (!orderId.value) return
  order.value = await salesOrderApi.get(orderId.value)
}

onMounted(async () => {
  availableOrders.value = await salesOrderApi.listPickable()

  if (isEdit && props.id) {
    try {
      const delivery = await salesDeliveryApi.get(Number(props.id))
      if (delivery.document_status !== 'DRAFT') {
        ElMessage.warning('Only DRAFT deliveries can be edited')
        router.replace({ name: 'sales-deliveries-detail', params: { id: props.id } })
        return
      }
      orderId.value = delivery.sales_order_id
      form.delivery_date = delivery.delivery_date.slice(0, 10)
      form.notes = delivery.notes ?? ''
      const prefill: Record<number, string> = {}
      for (const it of delivery.items) prefill[it.source_order_item_id] = it.qty
      await loadOrder()
      qtyByItem.value = prefill
    } catch (err) {
      ElMessage.error(apiErrorMessage(err))
    } finally {
      loading.value = false
    }
  } else if (orderId.value) {
    await loadOrder()
  }
})

async function onSelectOrder(id: number) {
  orderId.value = id
  qtyByItem.value = {}
  order.value = null
  await loadOrder()
}

const selectableOrders = computed<SalesOrder[]>(() => {
  if (order.value && !availableOrders.value.some((o) => o.id === order.value!.id)) {
    return [order.value, ...availableOrders.value]
  }
  return availableOrders.value
})

const rows = computed<PickerRow[]>(() =>
  (order.value?.items ?? [])
    .filter((it) => Number(it.remaining_qty ?? it.qty_ordered) > 0 || Number(qtyByItem.value[it.id] ?? 0) > 0)
    .map((it) => ({
      sourceItemId: it.id,
      productName: it.product?.name ?? `Product #${it.product_id}`,
      available: it.remaining_qty ?? it.qty_ordered,
    })),
)

async function createDelivery(items: { source_order_item_id: number; qty: string }[], thenSubmit: boolean) {
  let delivery = await salesDeliveryApi.create({
    company_id: companyStore.selectedCompanyId!,
    sales_order_id: order.value!.id,
    delivery_date: form.delivery_date,
    notes: form.notes,
    items,
  })
  if (!thenSubmit) {
    ElMessage.success(`Created ${delivery.delivery_no}`)
    return delivery
  }
  try {
    delivery = await salesDeliveryApi.submit(delivery.id)
    ElMessage.success(`Created and submitted ${delivery.delivery_no}`)
  } catch (err) {
    ElMessage.warning(`Created ${delivery.delivery_no} as a draft, but submit failed: ${apiErrorMessage(err)}`)
  }
  return delivery
}

function actionFor(thenSubmit: boolean): 'draft' | 'submit' | 'save' {
  if (isEdit) return 'save'
  if (thenSubmit) return 'submit'
  return 'draft'
}

async function submit(thenSubmit = false) {
  if (!order.value) {
    ElMessage.warning('Select a sales order first')
    return
  }
  const items = Object.entries(qtyByItem.value)
    .filter(([, qty]) => Number(qty) > 0)
    .map(([sourceItemId, qty]) => ({ source_order_item_id: Number(sourceItemId), qty }))
  if (items.length === 0) {
    ElMessage.warning('Enter at least one quantity to deliver')
    return
  }
  if (!isEdit && !companyStore.selectedCompanyId) {
    ElMessage.warning('Select a company first')
    return
  }
  if (thenSubmit) {
    try {
      await ElMessageBox.confirm('Create and submit this delivery? Stock will be deducted.', 'Confirm Submit', { type: 'warning' })
    } catch {
      return
    }
  }
  submitting.value = true
  pendingAction.value = actionFor(thenSubmit)
  try {
    if (isEdit && props.id) {
      const delivery = await salesDeliveryApi.update(Number(props.id), {
        delivery_date: form.delivery_date,
        notes: form.notes,
        items,
      })
      ElMessage.success(`Updated ${delivery.delivery_no}`)
      router.push({ name: 'sales-deliveries-detail', params: { id: delivery.id } })
    } else {
      const delivery = await createDelivery(items, thenSubmit)
      router.push({ name: 'sales-deliveries-detail', params: { id: delivery.id } })
    }
  } catch (err) {
    ElMessage.error(apiErrorMessage(err))
  } finally {
    submitting.value = false
    pendingAction.value = null
  }
}
</script>

<template>
  <div class="page">
    <PageHeader
      :title="isEdit ? 'Edit Sales Delivery' : 'New Sales Delivery'"
      :subtitle="isEdit ? 'Only DRAFT deliveries can be edited.' : 'Pull quantities from an existing sales order.'"
      :breadcrumb="{ label: 'Deliveries', to: '/sales-deliveries' }"
      show-back
    />

    <div class="card" v-loading="loading">
      <el-form label-position="top" class="form-grid">
        <el-form-item label="Sales Order" class="span-2">
          <el-select
            :model-value="orderId ?? undefined"
            filterable
            :disabled="isEdit"
            placeholder="Select a sales order"
            style="width: 100%"
            @update:model-value="onSelectOrder"
          >
            <el-option v-for="o in selectableOrders" :key="o.id" :label="`${o.order_no} — ${o.customer_name}`" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Delivery Date">
          <el-date-picker v-model="form.delivery_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Notes">
          <el-input v-model="form.notes" type="textarea" :rows="1" placeholder="Optional" />
        </el-form-item>
      </el-form>

      <div class="section-title">Pull quantities from order rows</div>
      <RemainingQtyPicker :rows="rows" v-model="qtyByItem" />

      <div class="form-footer">
        <el-button @click="router.back()">Cancel</el-button>
        <template v-if="isEdit">
          <el-button type="primary" :loading="submitting" @click="submit()">Save Changes</el-button>
        </template>
        <template v-else>
          <el-button :loading="pendingAction === 'draft'" :disabled="submitting" @click="submit(false)">Create Draft</el-button>
          <el-button type="primary" :loading="pendingAction === 'submit'" :disabled="submitting" @click="submit(true)">
            Create &amp; Submit
          </el-button>
        </template>
      </div>
    </div>
  </div>
</template>
