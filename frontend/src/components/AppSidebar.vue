<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { HomeFilled, Fold, Expand, Close } from '@element-plus/icons-vue'
import { useSidebar } from '../composables/useSidebar'
import { MENU_MODULES } from '../navigation/menu'
import { useCompanyStore } from '../stores/companyStore'
import { useAccessStore } from '../stores/accessStore'

const route = useRoute()
const companyStore = useCompanyStore()
const access = useAccessStore()

// Only menus the acting user may open (Users & Roles permissions); empty sections/modules are dropped.
const visibleModules = computed(() =>
  MENU_MODULES.map((mod) => ({
    ...mod,
    sections: mod.sections
      .map((section) => ({ ...section, items: section.items.filter((item) => access.canView(item.key)) }))
      .filter((section) => section.items.length),
  })).filter((mod) => mod.sections.length),
)


const STORAGE_KEY = 'mini-erp.sidebarCollapsed'
const SIDEBAR_WIDTH = '240px'

const { isMobile, isTablet, mobileOpen, closeMobile } = useSidebar()

function getStoredCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

// Desktop remembers the user's choice; tablet starts as an icon rail; phone always shows the full drawer.
const desktopCollapsed = ref(getStoredCollapsed())
const tabletExpanded = ref(false)
watch(desktopCollapsed, (v) => {
  try {
    localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
  } catch {
    // ignore storage failures
  }
})

const collapsed = computed(() => {
  if (isMobile.value) return false
  if (isTablet.value) return !tabletExpanded.value
  return desktopCollapsed.value
})

function toggleCollapse() {
  if (isMobile.value) closeMobile()
  else if (isTablet.value) tabletExpanded.value = !tabletExpanded.value
  else desktopCollapsed.value = !desktopCollapsed.value
}

watch(() => route.fullPath, () => {
  closeMobile()
  if (isTablet.value) tabletExpanded.value = false
})
watch(isMobile, (mobile) => {
  if (!mobile) closeMobile()
})
watch(mobileOpen, (open) => {
  document.body.classList.toggle('sidebar-drawer-open', open)
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && mobileOpen.value) closeMobile()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))


const MODULE_PATHS = ['/sales-orders', '/sales-deliveries', '/sales-invoices', '/sales-payments']

const activeMenu = computed(() => {
  const match = MODULE_PATHS.find((p) => route.path === p || route.path.startsWith(p + '/'))
  return match ?? route.path
})
</script>

<template>
  <div v-if="isMobile && mobileOpen" class="app-sidebar-backdrop" aria-hidden="true" @click="closeMobile" />
  <el-aside
    class="app-sidebar"
    :class="{
      'is-mobile': isMobile,
      'is-open': mobileOpen,
      'is-overlay': isTablet && !isMobile && !collapsed,
      'is-collapsed': collapsed,
    }"
    :width="collapsed ? '64px' : SIDEBAR_WIDTH"
    :aria-hidden="isMobile && !mobileOpen ? 'true' : undefined"
  >
    <div class="app-logo" :class="{ 'is-collapsed': collapsed }">
      <div class="app-logo-mark">
        <img class="app-logo-image" src="/sant-logo.png" alt="Sant Group" />
      </div>
      <div class="app-logo-text sidebar-fade" :aria-hidden="collapsed">
        <span class="app-logo-title">
          SANT <span class="accent">SUITE</span>
        </span>
        <span v-if="companyStore.selectedCompany" class="app-logo-company" :title="companyStore.selectedCompany.name">
          <span class="app-logo-company-dot" />
          <span class="app-logo-company-name">{{ companyStore.selectedCompany.name }}</span>
          <span v-if="companyStore.isGroupSelected" class="app-logo-company-scope">· All branches</span>
        </span>
      </div>
    </div>

    <el-menu
      :default-active="activeMenu"
      router
      class="app-sidebar-menu"
      :collapse="collapsed"
      :collapse-transition="false"
    >
      <el-menu-item index="/">
        <div class="menu-icon-bubble indigo"><el-icon><HomeFilled /></el-icon></div>
        <template #title>Home</template>
      </el-menu-item>
      <el-sub-menu v-for="mod in visibleModules" :key="mod.key" :index="mod.key">
        <template #title>
          <div class="menu-icon-bubble indigo"><el-icon><component :is="mod.icon" /></el-icon></div>
          <span>{{ mod.title }}</span>
        </template>
        <el-sub-menu v-for="section in mod.sections" :key="section.key" :index="section.key" class="menu-section">
          <template #title>
            <span class="menu-section-title">{{ section.title }}</span>
          </template>
          <el-menu-item v-for="item in section.items" :key="item.key" :index="item.path">
            <div class="menu-icon-bubble" :class="item.color"><el-icon><component :is="item.icon" /></el-icon></div>
            <template #title>{{ item.title }}</template>
          </el-menu-item>
        </el-sub-menu>
      </el-sub-menu>
    </el-menu>

    <button
      class="app-sidebar-collapse-btn"
      :class="{ 'is-collapsed': collapsed }"
      type="button"
      @click="toggleCollapse"
    >
      <el-icon><component :is="isMobile ? Close : collapsed ? Expand : Fold" /></el-icon>
      <span class="sidebar-fade" :aria-hidden="collapsed">{{ isMobile ? 'Close menu' : 'Collapse' }}</span>
    </button>
  </el-aside>
</template>
