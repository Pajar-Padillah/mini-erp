<script setup lang="ts">
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AppearanceSwitcher from './components/AppearanceSwitcher.vue'
import CompanySwitcher from './components/CompanySwitcher.vue'
import LanguageSwitcher from './components/LanguageSwitcher.vue'
import StockCheckModal from './components/StockCheckModal.vue'
import { useCompanyStore } from './stores/companyStore'
import { useThemeStore } from './stores/themeStore'
import { useLocaleStore } from './stores/localeStore'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const companyStore = useCompanyStore()
const localeStore = useLocaleStore()
useThemeStore().applyTheme()

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
  <el-config-provider :message="{ showClose: true }" :locale="localeStore.elementLocale">
    <el-container class="app-shell">
      <el-header class="app-header" height="64px">
        <div class="app-header-inner">
          <div class="app-logo">Mini<span class="accent">ERP</span></div>
          <nav class="app-nav">
            <router-link to="/sales-orders" :class="{ 'router-link-active': isActiveModule('/sales-orders') }">{{ t('nav.salesOrders') }}</router-link>
            <router-link to="/sales-deliveries" :class="{ 'router-link-active': isActiveModule('/sales-deliveries') }">{{ t('nav.salesDeliveries') }}</router-link>
            <router-link to="/sales-invoices" :class="{ 'router-link-active': isActiveModule('/sales-invoices') }">{{ t('nav.salesInvoices') }}</router-link>
            <router-link to="/sales-payments" :class="{ 'router-link-active': isActiveModule('/sales-payments') }">{{ t('nav.salesPayments') }}</router-link>
          </nav>
          <StockCheckModal />
          <CompanySwitcher />
          <LanguageSwitcher />
          <AppearanceSwitcher />
        </div>
      </el-header>
      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>
  </el-config-provider>
</template>
