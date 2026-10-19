import { createRouter, createWebHistory, type RouteComponent } from 'vue-router'
import { STATIC_MENU_ITEMS } from '../navigation/menu'
import { useAuthStore } from '../stores/authStore'
import { useAccessStore } from '../stores/accessStore'

const StaticListView = () => import('../views/static-pages/StaticListView.vue')

// Functional pages that replace static mockups: menu key → view file.
// Inventory (WMS) pages live in views/wms/, Administration pages in views/administration/.
const FUNCTIONAL_FILES = import.meta.glob(['../views/wms/*View.vue', '../views/administration/*View.vue'])
const FUNCTIONAL_VIEWS: Record<string, string> = {
  'rack-map': 'wms/RackMapView',
  'stock-balance': 'wms/StockBalanceView',
  'stock-movement': 'wms/StockMovementView',
  'batch-serial': 'wms/BatchSerialView',
  'inbound-receiving': 'wms/InboundReceivingView',
  'outbound-picking': 'wms/OutboundPickingView',
  'warehouse-tasks': 'wms/WarehouseTasksView',
  'task-scan': 'wms/TaskScanView',
  'stock-transfer': 'wms/StockTransferView',
  'stock-opname': 'wms/StockOpnameView',
  'stock-adjustment': 'wms/StockAdjustmentView',
  'wms-contacts': 'wms/WmsContactsView',
  'users-roles': 'administration/UsersRolesView',
}
function viewFor(key: string): RouteComponent {
  const name = FUNCTIONAL_VIEWS[key]
  const file = name ? FUNCTIONAL_FILES[`../views/${name}.vue`] : undefined
  return (file ?? StaticListView) as RouteComponent
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', meta: { public: true, title: 'Sign in' }, component: () => import('../views/LoginView.vue') },
    { path: '/chat', name: 'chat', meta: { title: 'Chat' }, component: () => import('../views/ChatView.vue') },
    { path: '/pending-approvals', name: 'pending-approvals', component: () => import('../views/approvals/PendingApprovalListView.vue') },
    { path: '/pending-approvals/:id', name: 'pending-approvals-detail', component: () => import('../views/approvals/ApprovalFormView.vue'), props: true },
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },

    ...([
      ['customers', 'customers-list'],
      ['suppliers', 'suppliers-list'],
      ['products', 'products-list'],
      ['warehouses', 'warehouses-list'],
      ['chart-of-accounts', 'chart-of-accounts-list'],
      ['tax-codes', 'tax-codes-list'],
    ] as const).map(([key, name]) => ({
      path: `/${key}`,
      name,
      meta: { masterKey: key },
      component: () => import('../views/master-data/MasterDataListView.vue'),
    })),

    ...([
      'sales-quotes',
      'purchase-requests',
      'purchase-orders',
      'purchase-invoices',
      'purchase-payments',
      'purchase-returns',
    ] as const).map((key) => ({
      path: `/${key}`,
      name: `${key}-list`,
      meta: { staticKey: key },
      component: StaticListView,
    })),

    { path: '/sales-orders', name: 'sales-orders-list', component: () => import('../views/sales-orders/SalesOrderListView.vue') },
    { path: '/sales-orders/new', name: 'sales-orders-new', component: () => import('../views/sales-orders/SalesOrderFormView.vue') },
    { path: '/sales-orders/:id/edit', redirect: (to) => ({ name: 'sales-orders-detail', params: to.params }) },
    { path: '/sales-orders/:id', name: 'sales-orders-detail', component: () => import('../views/sales-orders/SalesOrderFormView.vue'), props: true },

    { path: '/sales-deliveries', name: 'sales-deliveries-list', component: () => import('../views/sales-deliveries/SalesDeliveryListView.vue') },
    { path: '/sales-deliveries/new', name: 'sales-deliveries-new', component: () => import('../views/sales-deliveries/SalesDeliveryFormView.vue') },
    { path: '/sales-deliveries/:id/edit', redirect: (to) => ({ name: 'sales-deliveries-detail', params: to.params }) },
    { path: '/sales-deliveries/:id', name: 'sales-deliveries-detail', component: () => import('../views/sales-deliveries/SalesDeliveryFormView.vue'), props: true },

    { path: '/sales-invoices', name: 'sales-invoices-list', component: () => import('../views/sales-invoices/SalesInvoiceListView.vue') },
    { path: '/sales-invoices/new', name: 'sales-invoices-new', component: () => import('../views/sales-invoices/SalesInvoiceFormView.vue') },
    { path: '/sales-invoices/:id/edit', redirect: (to) => ({ name: 'sales-invoices-detail', params: to.params }) },
    { path: '/sales-invoices/:id', name: 'sales-invoices-detail', component: () => import('../views/sales-invoices/SalesInvoiceFormView.vue'), props: true },

    { path: '/sales-payments', name: 'sales-payments-list', component: () => import('../views/sales-payments/SalesPaymentListView.vue') },
    { path: '/sales-payments/new', name: 'sales-payments-new', component: () => import('../views/sales-payments/SalesPaymentFormView.vue') },
    { path: '/sales-payments/:id/edit', redirect: (to) => ({ name: 'sales-payments-detail', params: to.params }) },
    { path: '/sales-payments/:id', name: 'sales-payments-detail', component: () => import('../views/sales-payments/SalesPaymentFormView.vue'), props: true },

    { path: '/no-access', name: 'no-access', meta: { title: 'No access' }, component: () => import('../views/NoAccessView.vue') },

    ...STATIC_MENU_ITEMS.map((item) => ({
      path: `/${item.module.key}/${item.key}`,
      name: item.key,
      meta: { staticKey: item.key, title: item.title },
      component: viewFor(item.key),
    })),
  ],
})

// Static auth guard: everything except public pages (login) needs a signed-in user.
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isLoggedIn) {
    return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
  }
  if (to.name === 'login' && auth.isLoggedIn) return { name: 'home' }
  // Menu permissions from Users & Roles (keys outside the permission tree are always allowed).
  if (typeof to.name === 'string' && !useAccessStore().canView(to.name)) {
    return { name: 'no-access', query: { key: to.name } }
  }
})

export default router
