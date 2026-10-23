<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChatDotRound, Search, ShoppingCart, Van, Document, Wallet, User, OfficeBuilding, Goods, House, Notebook, Discount, CreditCard, Files, Memo, RefreshLeft, ShoppingBag, Tickets, Box } from '@element-plus/icons-vue'

import { STATIC_MENU_ITEMS } from '../navigation/menu'
import { useAccessStore } from '../stores/accessStore'

const router = useRouter()
const searchValue = ref('')
const access = useAccessStore()

const SEARCHABLE = [
  { label: 'Chat', name: 'chat', keywords: 'chat message pesan group personal', icon: ChatDotRound, color: 'blue' },
  // { label: 'Home', name: 'home', keywords: 'home dashboard' },
  { label: 'Customers', name: 'customers-list', keywords: 'master data customer client', icon: User, color: 'indigo' },
  { label: 'Suppliers', name: 'suppliers-list', keywords: 'master data supplier vendor', icon: OfficeBuilding, color: 'blue' },
  { label: 'Products', name: 'products-list', keywords: 'master data product item sku', icon: Goods, color: 'amber' },
  { label: 'Warehouses', name: 'warehouses-list', keywords: 'master data warehouse gudang', icon: House, color: 'green' },
  { label: 'Chart of Accounts', name: 'chart-of-accounts-list', keywords: 'master data coa account', icon: Notebook, color: 'indigo' },
  { label: 'Tax Codes', name: 'tax-codes-list', keywords: 'master data tax ppn pph', icon: Discount, color: 'blue' },
  { label: 'Sales Quotes', name: 'sales-quotes-list', keywords: 'sales quote quotation sq', icon: Tickets, color: 'indigo' },
  { label: 'Sales Orders', name: 'sales-orders-list', keywords: 'sales order so', icon: ShoppingCart, color: 'indigo' },
  { label: 'Sales Deliveries', name: 'sales-deliveries-list', keywords: 'sales delivery deliveries shipment', icon: Van, color: 'blue' },
  { label: 'Sales Invoices', name: 'sales-invoices-list', keywords: 'sales invoice billing', icon: Document, color: 'amber' },
  { label: 'Sales Payments', name: 'sales-payments-list', keywords: 'sales payment payments receipt', icon: Wallet, color: 'green' },
  { label: 'Sales Returns', name: 'sales-returns-list', keywords: 'sales return retur penjualan', icon: RefreshLeft, color: 'indigo' },
  { label: 'Purchase Requests', name: 'purchase-requests-list', keywords: 'purchase request pr', icon: Memo, color: 'indigo' },
  { label: 'Purchase Orders', name: 'purchase-orders-list', keywords: 'purchase order po', icon: ShoppingBag, color: 'blue' },
  { label: 'Purchase Receipts', name: 'purchase-receipts-list', keywords: 'purchase receipt goods receipt grn penerimaan barang', icon: Box, color: 'green' },
  { label: 'Purchase Invoices', name: 'purchase-invoices-list', keywords: 'purchase invoice bill', icon: Files, color: 'amber' },
  { label: 'Purchase Payments', name: 'purchase-payments-list', keywords: 'purchase payment pay supplier', icon: CreditCard, color: 'green' },
  { label: 'Purchase Returns', name: 'purchase-returns-list', keywords: 'purchase return retur', icon: RefreshLeft, color: 'blue' },
  ...STATIC_MENU_ITEMS.map((item) => ({
    label: item.title,
    name: item.key,
    keywords: `${item.module.title} ${item.key.replace(/-/g, ' ')}`,
    icon: item.icon,
    color: item.color as string,
  })),
]

type Suggestion = (typeof SEARCHABLE)[number] & { value: string }

function querySearch(query: string, cb: (results: Suggestion[]) => void) {
  const q = query.trim().toLowerCase()
  const allowed = SEARCHABLE.filter((item) => access.canView(item.name))
  const results = !q
    ? allowed
    : allowed.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(q))
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
