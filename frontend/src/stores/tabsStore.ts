import { defineStore } from 'pinia'
import type { Router, RouteLocationNormalized } from 'vue-router'

export interface AppTab {
  key: string
  title: string
  icon: 'home' | 'cart' | 'van' | 'document' | 'wallet'
  closable: boolean
}

const STORAGE_KEY = 'mini-erp.tabs'
const HOME_TAB: AppTab = { key: '/', title: 'Home', icon: 'home', closable: false }

const TITLES: Record<string, string> = {
  home: 'Home',
  'sales-orders-list': 'Sales Orders',
  'sales-orders-new': 'New Sales Order',
  'sales-orders-edit': 'Sales Order - Edit',
  'sales-orders-detail': 'Sales Order - Detail',
  'sales-deliveries-list': 'Sales Deliveries',
  'sales-deliveries-new': 'New Delivery',
  'sales-deliveries-edit': 'Sales Delivery - Edit',
  'sales-deliveries-detail': 'Sales Delivery - Detail',
  'sales-invoices-list': 'Sales Invoices',
  'sales-invoices-new': 'New Invoice',
  'sales-invoices-edit': 'Sales Invoice - Edit',
  'sales-invoices-detail': 'Sales Invoice - Detail',
  'sales-payments-list': 'Sales Payments',
  'sales-payments-new': 'New Payment',
  'sales-payments-edit': 'Sales Payment - Edit',
  'sales-payments-detail': 'Sales Payment - Detail',
}

function titleFor(route: RouteLocationNormalized): string {
  const name = route.name?.toString() ?? ''
  return TITLES[name] ?? name
}

function iconFor(route: RouteLocationNormalized): AppTab['icon'] {
  const name = route.name?.toString() ?? ''
  if (name.startsWith('sales-orders')) return 'cart'
  if (name.startsWith('sales-deliveries')) return 'van'
  if (name.startsWith('sales-invoices')) return 'document'
  if (name.startsWith('sales-payments')) return 'wallet'
  return 'home'
}

function loadTabs(): AppTab[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppTab[]
      if (Array.isArray(parsed) && parsed.length && parsed[0]?.key === '/') return parsed
    }
  } catch {
    // ignore storage failures
  }
  return [HOME_TAB]
}

export const useTabsStore = defineStore('tabs', {
  state: () => ({
    tabs: loadTabs() as AppTab[],
    activeKey: '/' as string,
  }),
  actions: {
    persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tabs))
      } catch {
        // ignore storage failures
      }
    },
    openTab(route: RouteLocationNormalized) {
      const key = route.fullPath
      this.activeKey = key
      const existing = this.tabs.find((t) => t.key === key)
      if (!existing) {
        this.tabs.push({ key, title: titleFor(route), icon: iconFor(route), closable: key !== '/' })
      }
      this.persist()
    },
    closeTab(key: string, router: Router) {
      if (key === '/') return
      const idx = this.tabs.findIndex((t) => t.key === key)
      if (idx === -1) return
      const wasActive = this.activeKey === key
      this.tabs.splice(idx, 1)
      this.persist()
      if (wasActive) {
        const next = this.tabs[idx] ?? this.tabs[idx - 1] ?? this.tabs[0]
        this.activeKey = next.key
        router.push(next.key)
      }
    },
    closeOthers(key: string, router: Router) {
      this.tabs = this.tabs.filter((t) => t.key === key || !t.closable)
      this.persist()
      if (this.activeKey !== key) {
        this.activeKey = key
        router.push(key)
      }
    },
    closeAll(router: Router) {
      this.tabs = this.tabs.filter((t) => !t.closable)
      this.activeKey = '/'
      this.persist()
      if (router.currentRoute.value.fullPath !== '/') router.push('/')
    },
    reorder(fromIndex: number, toIndex: number) {
      if (fromIndex === toIndex || fromIndex === 0 || toIndex === 0) return
      const tabs = [...this.tabs]
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      this.tabs = tabs
      this.persist()
    },
  },
})
