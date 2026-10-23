<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { ChatDotRound, Close, HomeFilled, ShoppingCart, Van, Document, Wallet, User, OfficeBuilding, Goods, House, Notebook, Discount, CreditCard, Files, Memo, ShoppingBag, Tickets, RefreshLeft, Box } from '@element-plus/icons-vue'
import { useTabsStore } from '../stores/tabsStore'
import { staticMenuItem } from '../navigation/menu'

const router = useRouter()
const tabsStore = useTabsStore()

const ICONS: Record<string, Component> = {
  home: HomeFilled, chat: ChatDotRound, approval: Tickets, cart: ShoppingCart, van: Van, document: Document, wallet: Wallet,
  customer: User, supplier: OfficeBuilding, product: Goods, warehouse: House, coa: Notebook, tax: Discount,
  'quote': Tickets, 'purchase-request': Memo, 'purchase-order': ShoppingBag, 'purchase-receipt': Box, 'purchase-invoice': Files, 'purchase-payment': CreditCard, 'purchase-return': RefreshLeft, 'sales-return': RefreshLeft,
}
const ICON_COLORS: Record<string, string> = {
  home: 'indigo', chat: 'blue', approval: 'amber', cart: 'indigo', van: 'blue', document: 'amber', wallet: 'green',
  customer: 'indigo', supplier: 'blue', product: 'amber', warehouse: 'green', coa: 'indigo', tax: 'blue',
  'quote': 'indigo', 'purchase-request': 'indigo', 'purchase-order': 'blue', 'purchase-receipt': 'green', 'purchase-invoice': 'amber', 'purchase-payment': 'green', 'purchase-return': 'blue', 'sales-return': 'indigo',
}

function tabIcon(key: string): Component {
  return ICONS[key] ?? staticMenuItem(key)?.icon ?? HomeFilled
}
function tabColor(key: string): string {
  return ICON_COLORS[key] ?? staticMenuItem(key)?.color ?? 'indigo'
}

const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function activate(key: string) {
  if (key !== router.currentRoute.value.fullPath) router.push(key)
}

function close(key: string, e?: Event) {
  e?.stopPropagation()
  tabsStore.closeTab(key, router)
}

function onDragStart(index: number, e: DragEvent) {
  if (index === 0) return
  dragIndex.value = index
  e.dataTransfer?.setData('text/plain', String(index))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(index: number, e: DragEvent) {
  if (dragIndex.value === null || index === 0) return
  e.preventDefault()
  dragOverIndex.value = index
}
function onDrop(index: number) {
  if (dragIndex.value !== null && index !== 0) {
    tabsStore.reorder(dragIndex.value, index)
  }
  dragIndex.value = null
  dragOverIndex.value = null
}
function onDragEnd() {
  dragIndex.value = null
  dragOverIndex.value = null
}

const ctxMenu = ref<{ x: number; y: number; key: string } | null>(null)

function openContextMenu(key: string, e: MouseEvent) {
  ctxMenu.value = { x: e.clientX, y: e.clientY, key }
}
function closeContextMenu() {
  ctxMenu.value = null
}
const ctxTab = computed(() => tabsStore.tabs.find((t) => t.key === ctxMenu.value?.key))
const canCloseOthers = computed(
  () => ctxMenu.value != null && tabsStore.tabs.some((t) => t.closable && t.key !== ctxMenu.value!.key),
)
const canCloseAll = computed(() => tabsStore.tabs.some((t) => t.closable))

function ctxClose() {
  if (ctxMenu.value) close(ctxMenu.value.key)
  closeContextMenu()
}
function ctxCloseOthers() {
  if (ctxMenu.value) tabsStore.closeOthers(ctxMenu.value.key, router)
  closeContextMenu()
}
function ctxCloseAll() {
  tabsStore.closeAll(router)
  closeContextMenu()
}
</script>

<template>
  <TransitionGroup tag="div" name="app-tab" class="tab-bar" @click="closeContextMenu">
    <div
      v-for="(tab, index) in tabsStore.tabs"
      :key="tab.key"
      class="app-tab"
      :class="{
        'is-active': tab.key === tabsStore.activeKey,
        'is-drag-over': dragOverIndex === index,
        'is-home': !tab.closable,
      }"
      :draggable="index !== 0"
      @click="activate(tab.key)"
      @contextmenu.prevent="openContextMenu(tab.key, $event)"
      @dragstart="onDragStart(index, $event)"
      @dragover="onDragOver(index, $event)"
      @drop="onDrop(index)"
      @dragend="onDragEnd"
    >
      <el-icon class="app-tab-icon" :class="tabColor(tab.icon)"><component :is="tabIcon(tab.icon)" /></el-icon>
      <span class="app-tab-title">{{ tab.title }}</span>
      <button v-if="tab.closable" class="app-tab-close" type="button" @click="close(tab.key, $event)">
        <el-icon><Close /></el-icon>
      </button>
    </div>
  </TransitionGroup>

  <Teleport to="body">
    <div v-if="ctxMenu" class="tab-context-backdrop" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu">
      <div class="tab-context-menu" :style="{ top: `${ctxMenu.y}px`, left: `${ctxMenu.x}px` }" @click.stop>
        <button v-if="ctxTab?.closable" type="button" @click="ctxClose">Close Tab</button>
        <button type="button" :disabled="!canCloseOthers" @click="ctxCloseOthers">Close Other Tabs</button>
        <button type="button" :disabled="!canCloseAll" @click="ctxCloseAll">Close All Tabs</button>
      </div>
    </div>
  </Teleport>
</template>
