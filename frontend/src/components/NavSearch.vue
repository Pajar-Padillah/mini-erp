<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search, ShoppingCart, Van, Document, Wallet } from '@element-plus/icons-vue'

const router = useRouter()
const searchValue = ref('')

const SEARCHABLE = [
  // { label: 'Home', name: 'home', keywords: 'home dashboard' },
  { label: 'Sales Orders', name: 'sales-orders-list', keywords: 'sales order so', icon: ShoppingCart, color: 'indigo' },
  { label: 'Sales Deliveries', name: 'sales-deliveries-list', keywords: 'sales delivery deliveries shipment', icon: Van, color: 'blue' },
  { label: 'Sales Invoices', name: 'sales-invoices-list', keywords: 'sales invoice billing', icon: Document, color: 'amber' },
  { label: 'Sales Payments', name: 'sales-payments-list', keywords: 'sales payment payments receipt', icon: Wallet, color: 'green' },
]

type Suggestion = (typeof SEARCHABLE)[number] & { value: string }

function querySearch(query: string, cb: (results: Suggestion[]) => void) {
  const q = query.trim().toLowerCase()
  const results = !q
    ? SEARCHABLE
    : SEARCHABLE.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(q))
  cb(results.map((item) => ({ ...item, value: item.label })))
}

function goTo(item: { name: string } | null | undefined) {
  if (!item?.name) return
  router.push({ name: item.name })
  searchValue.value = ''
}

function onEnter() {
  const value = searchValue.value.trim().toLowerCase()
  goTo(SEARCHABLE.find((s) => s.label.toLowerCase() === value))
}
</script>

<template>
  <el-autocomplete
    v-model="searchValue"
    class="nav-search"
    placeholder="Search something..."
    :prefix-icon="Search"
    :fetch-suggestions="querySearch"
    popper-class="nav-search-popper"
    clearable
    @select="goTo"
    @keyup.enter="onEnter"
  >
    <template #default="{ item }">
      <div class="nav-search-item">
        <el-icon class="nav-search-item-icon" :class="item.color"><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span>
      </div>
    </template>
  </el-autocomplete>
</template>
