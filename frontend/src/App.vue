<script setup lang="ts">
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from './components/AppSidebar.vue'
import NavSearch from './components/NavSearch.vue'
import EnvBadge from './components/EnvBadge.vue'
import NavQuickActions from './components/NavQuickActions.vue'
import UserAvatar from './components/UserAvatar.vue'
import StockCheckModal from './components/StockCheckModal.vue'
import TabBar from './components/TabBar.vue'
import { useCompanyStore } from './stores/companyStore'
import { useTabsStore } from './stores/tabsStore'
import { useSidebar } from './composables/useSidebar'
import { Menu } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const companyStore = useCompanyStore()
const tabsStore = useTabsStore()
const { isMobile, openMobile } = useSidebar()

router.afterEach((to) => {
  if (!to.meta.public) tabsStore.openTab(to)
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
    <router-view v-if="route.meta.public" />
    <el-container v-else class="app-shell">
      <AppSidebar />
      <el-container class="app-body">
        <el-header class="app-header" height="64px">
          <div class="app-header-inner">
            <button v-if="isMobile" type="button" class="app-menu-toggle" aria-label="Open menu" @click="openMobile">
              <el-icon><Menu /></el-icon>
            </button>
            <div class="app-header-search">
              <NavSearch />
              <EnvBadge />
            </div>
            <div class="app-header-actions">
              <NavQuickActions />
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
