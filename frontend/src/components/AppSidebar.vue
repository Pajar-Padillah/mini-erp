<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { HomeFilled, Van, Document, Wallet, ShoppingCart, Fold, Expand } from '@element-plus/icons-vue'
import CompanySwitcher from './CompanySwitcher.vue'

const route = useRoute()

const STORAGE_KEY = 'mini-erp.sidebarCollapsed'
const collapsed = ref(localStorage.getItem(STORAGE_KEY) === '1')
watch(collapsed, (v) => {
  try {
    localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
  } catch {
    // ignore storage failures
  }
})

const MODULE_PATHS = ['/sales-orders', '/sales-deliveries', '/sales-invoices', '/sales-payments']

const activeMenu = computed(() => {
  const match = MODULE_PATHS.find((p) => route.path === p || route.path.startsWith(p + '/'))
  return match ?? route.path
})
</script>

<template>
  <el-aside class="app-sidebar" :width="collapsed ? '64px' : '220px'">
    <div class="app-logo" :class="{ 'is-collapsed': collapsed }">
      <span v-if="!collapsed">Mini<span class="accent">ERP</span></span>
      <span v-else class="accent">M</span>
    </div>

    <div class="app-sidebar-office" :class="{ 'is-collapsed': collapsed }">
      <CompanySwitcher :collapsed="collapsed" />
    </div>

    <el-menu :default-active="activeMenu" router class="app-sidebar-menu" :collapse="collapsed" :default-openeds="['sales']">
      <el-menu-item index="/">
        <div class="menu-icon-bubble indigo"><el-icon><HomeFilled /></el-icon></div>
        <template #title>Home</template>
      </el-menu-item>
      <el-sub-menu index="sales">
        <template #title>
          <div class="menu-icon-bubble indigo"><el-icon><ShoppingCart /></el-icon></div>
          <span>Sales</span>
        </template>
        <el-menu-item index="/sales-orders">
          <div class="menu-icon-bubble indigo"><el-icon><ShoppingCart /></el-icon></div>
          <template #title>Sales Orders</template>
        </el-menu-item>
        <el-menu-item index="/sales-deliveries">
          <div class="menu-icon-bubble blue"><el-icon><Van /></el-icon></div>
          <template #title>Sales Deliveries</template>
        </el-menu-item>
        <el-menu-item index="/sales-invoices">
          <div class="menu-icon-bubble amber"><el-icon><Document /></el-icon></div>
          <template #title>Sales Invoices</template>
        </el-menu-item>
        <el-menu-item index="/sales-payments">
          <div class="menu-icon-bubble green"><el-icon><Wallet /></el-icon></div>
          <template #title>Sales Payments</template>
        </el-menu-item>
      </el-sub-menu>
    </el-menu>

    <button
      class="app-sidebar-collapse-btn"
      :class="{ 'is-collapsed': collapsed }"
      type="button"
      @click="collapsed = !collapsed"
    >
      <el-icon><component :is="collapsed ? Expand : Fold" /></el-icon>
      <span v-if="!collapsed">Collapse</span>
    </button>
  </el-aside>
</template>
