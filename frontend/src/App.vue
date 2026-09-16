<script setup lang="ts">
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CompanySwitcher from './components/CompanySwitcher.vue'
import StockCheckModal from './components/StockCheckModal.vue'
import { useCompanyStore } from './stores/companyStore'

const route = useRoute()
const router = useRouter()
const companyStore = useCompanyStore()

function isActiveModule(prefix: string) {
  return route.path === prefix || route.path.startsWith(prefix + '/')
}

watch(
  () => companyStore.selectedCompanyId,
  (newId, oldId) => {
    if (!oldId || newId === oldId) return
    const name = route.name?.toString()
    if (!name || name.endsWith('-list')) return
    const moduleName = name.replace(/-(new|edit|detail)$/, '')
    router.push({ name: `${moduleName}-list` })
  },
)
</script>

<template>
  <el-container class="app-shell">
    <el-header class="app-header" height="64px">
      <div class="app-header-inner">
        <div class="app-logo">Mini<span class="accent">ERP</span></div>
        <nav class="app-nav">
          <router-link to="/sales-orders" :class="{ 'router-link-active': isActiveModule('/sales-orders') }">Sales Orders</router-link>
          <router-link to="/sales-deliveries" :class="{ 'router-link-active': isActiveModule('/sales-deliveries') }">Sales Deliveries</router-link>
          <router-link to="/sales-invoices" :class="{ 'router-link-active': isActiveModule('/sales-invoices') }">Sales Invoices</router-link>
          <router-link to="/sales-payments" :class="{ 'router-link-active': isActiveModule('/sales-payments') }">Sales Payments</router-link>
        </nav>
        <StockCheckModal />
        <CompanySwitcher />
      </div>
    </el-header>
    <el-main class="app-main">
      <router-view />
    </el-main>
  </el-container>
</template>
