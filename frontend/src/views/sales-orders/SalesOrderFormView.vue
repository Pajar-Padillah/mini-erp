<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus } from '@element-plus/icons-vue'
import { salesOrderApi } from '../../api/salesOrderApi'
import { useCatalogStore } from '../../stores/catalogStore'
import { useCompanyStore } from '../../stores/companyStore'
import { apiErrorMessage } from '../../api/client'
import PageHeader from '../../components/PageHeader.vue'

interface FormLine {
  product_id: number | null
  qty_ordered: number
  unit_price: number
}

const props = defineProps<{ id?: string }>()
const isEdit = !!props.id

const router = useRouter()
const catalogStore = useCatalogStore()
const companyStore = useCompanyStore()
const submitting = ref(false)
const pendingAction = ref<'draft' | 'submit' | 'save' | null>(null)
const loading = ref(isEdit)

const form = reactive({
  customer_name: '',
  order_date: new Date().toISOString().slice(0, 10),
  notes: '',
})
const items = ref<FormLine[]>([{ product_id: null, qty_ordered: 1, unit_price: 0 }])

onMounted(async () => {
  await catalogStore.loadProducts()
  if (isEdit && props.id) {
    try {
      const order = await salesOrderApi.get(Number(props.id))
      if (order.document_status !== 'DRAFT') {
        ElMessage.warning('Only DRAFT orders can be edited')
        router.replace({ name: 'sales-orders-detail', params: { id: props.id } })
        return
      }
      form.customer_name = order.customer_name
      form.order_date = order.order_date.slice(0, 10)
      form.notes = order.notes ?? ''
      items.value = order.items.map((it) => ({
        product_id: it.product_id,
        qty_ordered: Number(it.qty_ordered),
        unit_price: Number(it.unit_price),
      }))
    } catch (err) {
      ElMessage.error(apiErrorMessage(err))
    } finally {
      loading.value = false
    }
  }
})

function addRow() {
  items.value.push({ product_id: null, qty_ordered: 1, unit_price: 0 })
}
function deleteRow(i: number) {
  items.value.splice(i, 1)
}
function onProductChange(i: number, productId: number) {
  const p = catalogStore.products.find((p) => p.id === productId)
  if (p) items.value[i].unit_price = Number(p.unit_price)
}

function buildLineItems() {
  return items.value.map((it) => ({
    product_id: it.product_id as number,
    qty_ordered: String(it.qty_ordered),
    unit_price: String(it.unit_price),
  }))
}

async function createOrder(lineItems: ReturnType<typeof buildLineItems>, thenSubmit: boolean) {
  let order = await salesOrderApi.create({
    company_id: companyStore.selectedCompanyId!,
    customer_name: form.customer_name,
    order_date: form.order_date,
    notes: form.notes,
    items: lineItems,
  })
  if (!thenSubmit) {
    ElMessage.success(`Created ${order.order_no}`)
    return order
  }
  try {
    order = await salesOrderApi.submit(order.id)
    ElMessage.success(`Created and submitted ${order.order_no}`)
  } catch (err) {
    ElMessage.warning(`Created ${order.order_no} as a draft, but submit failed: ${apiErrorMessage(err)}`)
  }
  return order
}

function actionFor(thenSubmit: boolean): 'draft' | 'submit' | 'save' {
  if (isEdit) return 'save'
  if (thenSubmit) return 'submit'
  return 'draft'
}

async function submit(thenSubmit = false) {
  if (!isEdit && !companyStore.selectedCompanyId) {
    ElMessage.warning('Select a company first')
    return
  }
  if (items.value.some((it) => !it.product_id)) {
    ElMessage.warning('Select a product for every line')
    return
  }
  if (thenSubmit) {
    try {
      await ElMessageBox.confirm('Create and submit this order? It will become ACTIVE and ready for delivery.', 'Confirm Submit', { type: 'warning' })
    } catch {
      return
    }
  }
  submitting.value = true
  pendingAction.value = actionFor(thenSubmit)
  try {
    const lineItems = buildLineItems()
    if (isEdit && props.id) {
      const order = await salesOrderApi.update(Number(props.id), {
        customer_name: form.customer_name,
        order_date: form.order_date,
        notes: form.notes,
        items: lineItems,
      })
      ElMessage.success(`Updated ${order.order_no}`)
      router.push({ name: 'sales-orders-detail', params: { id: order.id } })
    } else {
      const order = await createOrder(lineItems, thenSubmit)
      router.push({ name: 'sales-orders-detail', params: { id: order.id } })
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
      :title="isEdit ? 'Edit Sales Order' : 'New Sales Order'"
      :subtitle="isEdit ? 'Only DRAFT orders can be edited.' : 'Create a draft order, then submit it to make it active.'"
      :breadcrumb="{ label: 'Sales Orders', to: '/sales-orders' }"
      show-back
    />

    <div class="card" v-loading="loading">
      <el-form label-position="top" class="form-grid">
        <el-form-item label="Customer">
          <el-input v-model="form.customer_name" placeholder="e.g. Toko Kosmetik Sukses Mandiri" />
        </el-form-item>
        <el-form-item label="Order Date">
          <el-date-picker v-model="form.order_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Notes" class="span-2">
          <el-input v-model="form.notes" type="textarea" :rows="2" placeholder="Optional" />
        </el-form-item>
      </el-form>

      <div class="section-header">
        <div class="section-title">Items</div>
        <el-button size="small" :icon="Plus" @click="addRow">Add Row</el-button>
      </div>
      <el-table :data="items" size="small">
        <el-table-column label="Product" min-width="260">
          <template #default="{ row, $index }">
            <el-select v-model="row.product_id" filterable placeholder="Select product" style="width: 100%" @change="(v: number) => onProductChange($index, v)">
              <el-option v-for="p in catalogStore.products" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="Qty" width="160">
          <template #default="{ row }">
            <el-input-number v-model="row.qty_ordered" :min="0.001" :controls="false" style="width: 100%" />
          </template>
        </el-table-column>
        <el-table-column label="Unit Price" width="180">
          <template #default="{ row }">
            <el-input-number v-model="row.unit_price" :min="0" :controls="false" style="width: 100%" />
          </template>
        </el-table-column>
        <el-table-column label="" width="56" align="center">
          <template #default="{ $index }">
            <el-tooltip content="Delete row" placement="top">
              <el-button
                type="danger"
                :icon="Delete"
                circle
                plain
                size="small"
                :disabled="items.length <= 1"
                @click="deleteRow($index)"
              />
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>

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
