<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { HomeFilled, Fold, Expand, Close, Check, DCaret } from '@element-plus/icons-vue'
import { useSidebar } from '../composables/useSidebar'
import { MENU_MODULES } from '../navigation/menu'
import { APPS, appForModule, appOwnsModule, type AppDef, type AppKey } from '../navigation/apps'
import { useCompanyStore } from '../stores/companyStore'
import { useAccessStore } from '../stores/accessStore'

const route = useRoute()
const router = useRouter()
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

// ---------------------------------------------------------------- apps (ERP / HRIS / CMS)
const APP_STORAGE_KEY = 'mini-erp.activeApp'

function getStoredApp(): AppKey {
  try {
    const v = localStorage.getItem(APP_STORAGE_KEY)
    return APPS.some((a) => a.key === v) ? (v as AppKey) : 'erp'
  } catch {
    return 'erp'
  }
}

const activeAppKey = ref<AppKey>(getStoredApp())
watch(activeAppKey, (v) => {
  try {
    localStorage.setItem(APP_STORAGE_KEY, v)
  } catch {
    // ignore storage failures
  }
})

// Apps the user can open: ERP always (Home), others only when they have a visible module.
const availableApps = computed(() =>
  APPS.filter((app) => app.home || visibleModules.value.some((mod) => appOwnsModule(app, mod.key))),
)
const activeApp = computed(() => availableApps.value.find((a) => a.key === activeAppKey.value) ?? availableApps.value[0])
const appModules = computed(() => visibleModules.value.filter((mod) => appOwnsModule(activeApp.value, mod.key)))

// Opening a page of another app (deep link, navbar search) switches the sidebar to that app.
watch(
  () => route.path,
  (path) => {
    const mod = MENU_MODULES.find((m) => m.items.some((item) => path === item.path || path.startsWith(item.path + '/')))
    if (mod) activeAppKey.value = appForModule(mod.key).key
  },
  { immediate: true },
)

const appSwitcherOpen = ref(false)
function switchApp(app: AppDef) {
  appSwitcherOpen.value = false
  if (app.key === activeApp.value.key) return
  activeAppKey.value = app.key
  const first = visibleModules.value.find((mod) => appOwnsModule(app, mod.key))?.sections[0]?.items[0]
  router.push(app.home ? '/' : (first?.path ?? '/'))
}


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

    <div class="app-switcher" :class="{ 'is-collapsed': collapsed }">
      <el-popover
        v-model:visible="appSwitcherOpen"
        trigger="click"
        :placement="collapsed ? 'right-start' : 'bottom-start'"
        :width="216"
        :offset="10"
        :popper-class="collapsed ? 'app-switcher-popper' : 'app-switcher-popper is-below'"
      >
        <template #reference>
          <button type="button" class="app-switcher-trigger" :title="collapsed ? `App: ${activeApp.title}` : undefined">
            <span class="app-badge" :class="`is-${activeApp.color}`"><el-icon><component :is="activeApp.icon" /></el-icon></span>
            <span class="app-switcher-text sidebar-fade" :aria-hidden="collapsed">
              <span class="app-switcher-caption">Apps</span>
              <span class="app-switcher-name">{{ activeApp.title }}</span>
            </span>
            <el-icon class="app-switcher-caret sidebar-fade"><DCaret /></el-icon>
          </button>
        </template>
        <div class="app-switcher-menu">
          <div class="app-switcher-heading">Switch app</div>
          <button
            v-for="app in availableApps"
            :key="app.key"
            type="button"
            class="app-switcher-option"
            :class="{ 'is-active': app.key === activeApp.key }"
            @click="switchApp(app)"
          >
            <span class="app-badge" :class="`is-${app.color}`"><el-icon><component :is="app.icon" /></el-icon></span>
            <span class="app-switcher-option-name">{{ app.title }}</span>
            <el-icon v-if="app.key === activeApp.key" class="app-switcher-check"><Check /></el-icon>
          </button>
        </div>
      </el-popover>
    </div>

    <el-menu
      :default-active="activeMenu"
      router
      class="app-sidebar-menu"
      :collapse="collapsed"
      :collapse-transition="false"
    >
      <el-menu-item v-if="activeApp.home" index="/">
        <div class="menu-icon-bubble indigo"><el-icon><HomeFilled /></el-icon></div>
        <template #title>Home</template>
      </el-menu-item>
      <el-sub-menu v-for="mod in appModules" :key="mod.key" :index="mod.key">
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
