<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ShoppingCart, Van, Document, Wallet } from '@element-plus/icons-vue'

const router = useRouter()

const shortcuts = [
  { label: 'Sales Orders', desc: 'Create and track customer orders', name: 'sales-orders-list', icon: ShoppingCart, color: 'indigo' },
  { label: 'Sales Deliveries', desc: 'Record goods shipped to customers', name: 'sales-deliveries-list', icon: Van, color: 'blue' },
  { label: 'Sales Invoices', desc: 'Bill customers for delivered goods', name: 'sales-invoices-list', icon: Document, color: 'amber' },
  { label: 'Sales Payments', desc: 'Track incoming customer payments', name: 'sales-payments-list', icon: Wallet, color: 'green' },
]
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div class="page-header-left">
        <div>
          <h2>Welcome back</h2>
          <div class="page-subtitle">Here's a quick jump into the Sales workflow.</div>
        </div>
      </div>
    </div>

    <div class="home-shortcut-grid">
      <div
        v-for="s in shortcuts"
        :key="s.name"
        class="home-shortcut-card"
        @click="router.push({ name: s.name })"
      >
        <div class="home-shortcut-icon" :class="s.color">
          <el-icon><component :is="s.icon" /></el-icon>
        </div>
        <div class="home-shortcut-title">{{ s.label }}</div>
        <div class="home-shortcut-desc">{{ s.desc }}</div>
      </div>
    </div>
  </div>
</template>
