import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/sales-orders' },

    { path: '/sales-orders', name: 'sales-orders-list', component: () => import('../views/sales-orders/SalesOrderListView.vue') },
    { path: '/sales-orders/new', name: 'sales-orders-new', component: () => import('../views/sales-orders/SalesOrderFormView.vue') },
    { path: '/sales-orders/:id/edit', name: 'sales-orders-edit', component: () => import('../views/sales-orders/SalesOrderFormView.vue'), props: true },
    { path: '/sales-orders/:id', name: 'sales-orders-detail', component: () => import('../views/sales-orders/SalesOrderDetailView.vue'), props: true },

    { path: '/sales-deliveries', name: 'sales-deliveries-list', component: () => import('../views/sales-deliveries/SalesDeliveryListView.vue') },
    { path: '/sales-deliveries/new', name: 'sales-deliveries-new', component: () => import('../views/sales-deliveries/SalesDeliveryFormView.vue') },
    { path: '/sales-deliveries/:id/edit', name: 'sales-deliveries-edit', component: () => import('../views/sales-deliveries/SalesDeliveryFormView.vue'), props: true },
    { path: '/sales-deliveries/:id', name: 'sales-deliveries-detail', component: () => import('../views/sales-deliveries/SalesDeliveryDetailView.vue'), props: true },

    { path: '/sales-invoices', name: 'sales-invoices-list', component: () => import('../views/sales-invoices/SalesInvoiceListView.vue') },
    { path: '/sales-invoices/new', name: 'sales-invoices-new', component: () => import('../views/sales-invoices/SalesInvoiceFormView.vue') },
    { path: '/sales-invoices/:id/edit', name: 'sales-invoices-edit', component: () => import('../views/sales-invoices/SalesInvoiceFormView.vue'), props: true },
    { path: '/sales-invoices/:id', name: 'sales-invoices-detail', component: () => import('../views/sales-invoices/SalesInvoiceDetailView.vue'), props: true },

    { path: '/sales-payments', name: 'sales-payments-list', component: () => import('../views/sales-payments/SalesPaymentListView.vue') },
    { path: '/sales-payments/new', name: 'sales-payments-new', component: () => import('../views/sales-payments/SalesPaymentFormView.vue') },
    { path: '/sales-payments/:id/edit', name: 'sales-payments-edit', component: () => import('../views/sales-payments/SalesPaymentFormView.vue'), props: true },
    { path: '/sales-payments/:id', name: 'sales-payments-detail', component: () => import('../views/sales-payments/SalesPaymentDetailView.vue'), props: true },
  ],
})

export default router
