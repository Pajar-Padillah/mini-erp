<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useCatalogStore } from '../stores/catalogStore'
import { formatQty } from '../utils/format'

const catalogStore = useCatalogStore()
const visible = ref(false)
const search = ref('')
const loading = ref(false)

async function open() {
  visible.value = true
  search.value = ''
  loading.value = true
  try {
    await catalogStore.loadStocks()
  } finally {
    loading.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  const isMac = navigator.platform.toUpperCase().includes('MAC')
  const isCmdK = (isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'k'
  if (isCmdK) {
    e.preventDefault()
    open()
    return
  }
  const target = e.target as HTMLElement | null
  const isTyping = !!target && (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable)
  if (e.key === '/' && !isTyping && !visible.value) {
    e.preventDefault()
    open()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return catalogStore.stocks
  return catalogStore.stocks.filter(
    (s) => s.product?.name.toLowerCase().includes(q) || s.product?.sku.toLowerCase().includes(q),
  )
})
</script>

<template>
  <el-dialog v-model="visible" title="Check Stock" width="700px" align-center>
    <el-input v-model="search" placeholder="Search by product name or SKU..." clearable autofocus />
    <el-table :data="filtered" v-loading="loading" size="small" style="margin-top: 12px" max-height="360">
      <el-table-column label="Product" min-width="200">
        <template #default="{ row }">{{ row.product?.name ?? `#${row.product_id}` }}</template>
      </el-table-column>
      <el-table-column label="Brand" width="110">
        <template #default="{ row }">{{ row.product?.brand?.name ?? '—' }}</template>
      </el-table-column>
      <el-table-column label="SKU" width="120">
        <template #default="{ row }">{{ row.product?.sku ?? '—' }}</template>
      </el-table-column>
      <el-table-column label="Qty on Hand" width="130" align="right">
        <template #default="{ row }">{{ formatQty(row.quantity_on_hand) }} {{ row.product?.uom }}</template>
      </el-table-column>
    </el-table>
  </el-dialog>
</template>
