<script setup lang="ts">
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import AppSidebar from './components/AppSidebar.vue'
import NavSearch from './components/NavSearch.vue'
import UserAvatar from './components/UserAvatar.vue'
import StockCheckModal from './components/StockCheckModal.vue'
import TabBar from './components/TabBar.vue'
import { useCompanyStore } from './stores/companyStore'
import { useTabsStore } from './stores/tabsStore'

const router = useRouter()
const companyStore = useCompanyStore()
const tabsStore = useTabsStore()

router.afterEach((to) => {
  tabsStore.openTab(to)
})

watch(
  () => companyStore.selectedCompanyId,
  (newId, oldId) => {
    // Open tabs may hold another company's documents - start fresh rather
    // than risk showing stale, cross-company data from a cached tab.
    if (!oldId || newId === oldId) return
    tabsStore.closeAll(router)
  },
)
</script>

<template>
  <el-config-provider :message="{ showClose: true }">
    <el-container class="app-shell">
      <AppSidebar />
      <el-container class="app-body">
        <el-header class="app-header" height="64px">
          <div class="app-header-inner">
            <NavSearch />
            <div class="app-header-actions">
              <StockCheckModal />
              <UserAvatar />
            </div>
          </div>
        </el-header>
        <TabBar />
        <el-main class="app-main">
          <router-view v-slot="{ Component, route }">
            <keep-alive :max="20">
              <component :is="Component" :key="route.fullPath" />
            </keep-alive>
          </router-view>
        </el-main>
      </el-container>
    </el-container>
  </el-config-provider>
</template>
