import { defineStore } from 'pinia'
import type { Router, RouteLocationNormalized } from 'vue-router'
import appRouter from '../router'

export interface AppTab {
  key: string
  title: string
  /** Built-in icon name, or a static menu item key (see navigation/menu.ts). */
  icon: string
  closable: boolean
}

const STORAGE_KEY = 'mini-erp.tabs'
const HOME_TAB: AppTab = { key: '/', title: 'Home', icon: 'home', closable: false }

const TITLES: Record<string, string> = {
  home: 'Home',
  'customers-list': 'Customers',
  'suppliers-list': 'Suppliers',
  'products-list': 'Products',
  'warehouses-list': 'Warehouses',
  'chart-of-accounts-list': 'Chart of Accounts',
  'tax-codes-list': 'Tax Codes',
  'sales-quotes-list': 'Sales Quotes',
  'sales-returns-list': 'Sales Returns',
  'purchase-requests-list': 'Purchase Requests',
  'purchase-orders-list': 'Purchase Orders',
  'purchase-receipts-list': 'Purchase Receipts',
  'purchase-invoices-list': 'Purchase Invoices',
  'purchase-payments-list': 'Purchase Payments',
  'purchase-returns-list': 'Purchase Returns',
  'pending-approvals': 'Pending Approval List',
  'pending-approvals-detail': 'Approval',
  'sales-orders-list': 'Sales Orders',
  'sales-orders-new': 'New Sales Order',
  'sales-orders-detail': 'Sales Order',
  'sales-deliveries-list': 'Sales Deliveries',
  'sales-deliveries-new': 'New Delivery',
  'sales-deliveries-detail': 'Sales Delivery',
  'sales-invoices-list': 'Sales Invoices',
  'sales-invoices-new': 'New Invoice',
  'sales-invoices-detail': 'Sales Invoice',
  'sales-payments-list': 'Sales Payments',
  'sales-payments-new': 'New Payment',
  'sales-payments-detail': 'Sales Payment',
}

function titleFor(route: RouteLocationNormalized): string {
  const name = route.name?.toString() ?? ''
  return TITLES[name] ?? (route.meta.title as string | undefined) ?? name
}

function iconFor(route: RouteLocationNormalized): AppTab['icon'] {
  const name = route.name?.toString() ?? ''
  if (route.meta.title && route.meta.staticKey) return String(route.meta.staticKey)
  if (name === 'chat') return 'chat'
  if (name.startsWith('pending-approvals')) return 'approval'
  if (name === 'customers-list') return 'customer'
  if (name === 'suppliers-list') return 'supplier'
  if (name === 'products-list') return 'product'
  if (name === 'warehouses-list') return 'warehouse'
  if (name === 'chart-of-accounts-list') return 'coa'
  if (name === 'tax-codes-list') return 'tax'
  if (name === 'sales-quotes-list') return 'quote'
  if (name === 'sales-returns-list') return 'sales-return'
  if (name === 'purchase-requests-list') return 'purchase-request'
  if (name === 'purchase-orders-list') return 'purchase-order'
  if (name === 'purchase-receipts-list') return 'purchase-receipt'
  if (name === 'purchase-invoices-list') return 'purchase-invoice'
  if (name === 'purchase-payments-list') return 'purchase-payment'
  if (name === 'purchase-returns-list') return 'purchase-return'
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
      // Drop tabs whose page no longer exists (e.g. a menu that was moved or removed).
      if (Array.isArray(parsed) && parsed.length && parsed[0]?.key === '/') return parsed.filter((t) => appRouter.resolve(t.key).matched.length)
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
