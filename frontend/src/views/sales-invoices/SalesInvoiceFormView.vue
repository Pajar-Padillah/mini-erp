<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesDeliveryApi } from '../../api/salesDeliveryApi'
import { salesInvoiceApi } from '../../api/salesInvoiceApi'
import { useCompanyStore } from '../../stores/companyStore'
import { apiErrorMessage } from '../../api/client'
import RemainingQtyPicker, { type PickerRow } from '../../components/RemainingQtyPicker.vue'
import PageHeader from '../../components/PageHeader.vue'
import type { SalesDelivery } from '../../types/salesDelivery'

const props = defineProps<{ id?: string }>()
const isEdit = !!props.id

const route = useRoute()
const router = useRouter()
const companyStore = useCompanyStore()
const submitting = ref(false)
const pendingAction = ref<'draft' | 'submit' | 'save' | null>(null)
const loading = ref(isEdit)

const availableDeliveries = ref<SalesDelivery[]>([])
const deliveryId = ref<number | null>(route.query.sales_delivery_id ? Number(route.query.sales_delivery_id) : null)
const delivery = ref<SalesDelivery | null>(null)

const form = reactive({ invoice_date: new Date().toISOString().slice(0, 10), notes: '' })
const qtyByItem = ref<Record<number, string>>({})

async function loadDelivery() {
  if (!deliveryId.value) return
  delivery.value = await salesDeliveryApi.get(deliveryId.value)
}

onMounted(async () => {
  availableDeliveries.value = await salesDeliveryApi.listPickable()

  if (isEdit && props.id) {
    try {
      const invoice = await salesInvoiceApi.get(Number(props.id))
      if (invoice.document_status !== 'DRAFT') {
        ElMessage.warning('Only DRAFT invoices can be edited')
        router.replace({ name: 'sales-invoices-detail', params: { id: props.id } })
        return
      }
      const firstDeliveryId = invoice.items[0]?.source_delivery_item?.sales_delivery_id
      if (!firstDeliveryId) {
        ElMessage.error('Could not determine the source delivery for this invoice')
        router.replace({ name: 'sales-invoices-detail', params: { id: props.id } })
        return
      }
      deliveryId.value = firstDeliveryId
      form.invoice_date = invoice.invoice_date.slice(0, 10)
      form.notes = invoice.notes ?? ''
      const prefill: Record<number, string> = {}
      for (const it of invoice.items) prefill[it.source_delivery_item_id] = it.qty
      await loadDelivery()
      qtyByItem.value = prefill
    } catch (err) {
      ElMessage.error(apiErrorMessage(err))
    } finally {
      loading.value = false
    }
  } else if (deliveryId.value) {
    await loadDelivery()
  }
})

async function onSelectDelivery(id: number) {
  deliveryId.value = id
  qtyByItem.value = {}
  delivery.value = null
  await loadDelivery()
}

const selectableDeliveries = computed<SalesDelivery[]>(() => {
  if (delivery.value && !availableDeliveries.value.some((d) => d.id === delivery.value!.id)) {
    return [delivery.value, ...availableDeliveries.value]
  }
  return availableDeliveries.value
})

const rows = computed<PickerRow[]>(() =>
  (delivery.value?.items ?? [])
    .filter((it) => Number(it.remaining_qty ?? it.qty) > 0 || Number(qtyByItem.value[it.id] ?? 0) > 0)
    .map((it) => ({
      sourceItemId: it.id,
      productName: it.product?.name ?? `Product #${it.product_id}`,
      available: it.remaining_qty ?? it.qty,
      unitPrice: it.unit_price,
    })),
)

async function createInvoice(items: { source_delivery_item_id: number; qty: string }[], thenSubmit: boolean) {
  let invoice = await salesInvoiceApi.create({
    company_id: companyStore.selectedCompanyId!,
    invoice_date: form.invoice_date,
    notes: form.notes,
    items,
  })
  if (!thenSubmit) {
    ElMessage.success(`Created ${invoice.invoice_no}`)
    return invoice
  }
  try {
    invoice = await salesInvoiceApi.submit(invoice.id)
    ElMessage.success(`Created and submitted ${invoice.invoice_no}`)
  } catch (err) {
    ElMessage.warning(`Created ${invoice.invoice_no} as a draft, but submit failed: ${apiErrorMessage(err)}`)
  }
  return invoice
}

function actionFor(thenSubmit: boolean): 'draft' | 'submit' | 'save' {
  if (isEdit) return 'save'
  if (thenSubmit) return 'submit'
  return 'draft'
}

async function submit(thenSubmit = false) {
  if (!delivery.value) {
    ElMessage.warning('Select a sales delivery first')
    return
  }
  const items = Object.entries(qtyByItem.value)
    .filter(([, qty]) => Number(qty) > 0)
    .map(([sourceItemId, qty]) => ({ source_delivery_item_id: Number(sourceItemId), qty }))
  if (items.length === 0) {
    ElMessage.warning('Enter at least one quantity to invoice')
    return
  }
  if (!isEdit && !companyStore.selectedCompanyId) {
    ElMessage.warning('Select a company first')
    return
  }
  if (thenSubmit) {
    try {
      await ElMessageBox.confirm('Create and submit this invoice? It will become ACTIVE and ready for payment.', 'Confirm Submit', { type: 'warning' })
    } catch {
      return
    }
  }
  submitting.value = true
  pendingAction.value = actionFor(thenSubmit)
  try {
    if (isEdit && props.id) {
      const invoice = await salesInvoiceApi.update(Number(props.id), {
        invoice_date: form.invoice_date,
        notes: form.notes,
        items,
      })
      ElMessage.success(`Updated ${invoice.invoice_no}`)
      router.push({ name: 'sales-invoices-detail', params: { id: invoice.id } })
    } else {
      const invoice = await createInvoice(items, thenSubmit)
      router.push({ name: 'sales-invoices-detail', params: { id: invoice.id } })
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
      :title="isEdit ? 'Edit Sales Invoice' : 'New Sales Invoice'"
      :subtitle="isEdit ? 'Only DRAFT invoices can be edited.' : 'Pull quantities from an existing sales delivery.'"
      :breadcrumb="{ label: 'Invoices', to: '/sales-invoices' }"
      show-back
    />

    <div class="card" v-loading="loading">
      <el-form label-position="top" class="form-grid">
        <el-form-item label="Sales Delivery" class="span-2">
          <el-select
            :model-value="deliveryId ?? undefined"
            filterable
            :disabled="isEdit"
            placeholder="Select a sales delivery"
            style="width: 100%"
            @update:model-value="onSelectDelivery"
          >
            <el-option v-for="d in selectableDeliveries" :key="d.id" :label="d.delivery_no" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Invoice Date">
          <el-date-picker v-model="form.invoice_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Notes" class="span-2">
          <el-input v-model="form.notes" type="textarea" :rows="1" placeholder="Optional" />
        </el-form-item>
      </el-form>

      <div class="section-title">Pull quantities from delivery lines</div>
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
