// Config-driven sidebar: module (layer 1) → section (layer 2) → page (layer 3).
// Static (mockup) modules also drive their routes (/<module>/<item>), tab titles/icons and navbar search.
import type { Component } from 'vue'
import {
  AlarmClock, Aim, Avatar, Back, Bell, Box, Briefcase, Calendar, Checked, Clock, Coin, Collection, Connection,
  CreditCard, DataAnalysis, DataLine, Delete, Discount, Document, DocumentCopy, Download, EditPen, Files,
  Finished, Flag, FolderOpened, Goods, Grid, Histogram, House, Iphone, Key, Lightning, Link, List, Lock, Memo,
  Money, Monitor, Notebook, Odometer, OfficeBuilding, Operation, PieChart, Postcard, PriceTag, Promotion,
  Reading, RefreshLeft, RefreshRight, ScaleToOriginal, Sell, Setting, Share, Shop, ShoppingBag, ShoppingCart,
  Sort, Stamp, Sunny, Switch, SwitchButton, TakeawayBox, Tickets, Timer, Tools, TrendCharts, Trophy, Upload,
  User, UserFilled, Van, View, Wallet, WalletFilled, MapLocation,
} from '@element-plus/icons-vue'

export type MenuColor = 'indigo' | 'blue' | 'amber' | 'green'

export interface MenuItem {
  key: string
  title: string
  icon: Component
  color: MenuColor
  path: string
}

export interface MenuSection {
  key: string
  title: string
  items: MenuItem[]
}

export interface MenuModule {
  key: string
  title: string
  icon: Component
  sections: MenuSection[]
  /** All pages of the module, flattened across sections. */
  items: MenuItem[]
}

type ItemDef = [key: string, title: string, icon: Component]
type SectionDef = [title: string, items: ItemDef[]]

const COLORS: MenuColor[] = ['indigo', 'blue', 'amber', 'green']

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * `routed` modules have hand-written routes at /<item>; the others are static
 * mockup pages at /<module>/<item> rendered by StaticListView.
 */
function mod(key: string, title: string, icon: Component, sectionDefs: SectionDef[], routed = false): MenuModule {
  let index = 0
  const sections = sectionDefs.map(([sectionTitle, itemDefs]) => ({
    key: `${key}/${slug(sectionTitle)}`,
    title: sectionTitle,
    items: itemDefs.map(([itemKey, itemTitle, itemIcon]) => ({
      key: itemKey,
      title: itemTitle,
      icon: itemIcon,
      color: COLORS[index++ % COLORS.length],
      path: routed ? `/${itemKey}` : `/${key}/${itemKey}`,
    })),
  }))
  return { key, title, icon, sections, items: sections.flatMap((s) => s.items) }
}

const ROUTED_MODULES: MenuModule[] = [
  mod('master-data', 'Master Data', Coin, [
    ['Business Partners', [
      ['customers', 'Customers', User],
      ['suppliers', 'Suppliers', OfficeBuilding],
    ]],
    ['Items & Locations', [
      ['products', 'Products', Goods],
      ['warehouses', 'Warehouses', House],
    ]],
    ['Finance Setup', [
      ['chart-of-accounts', 'Chart of Accounts', Notebook],
      ['tax-codes', 'Tax Codes', Discount],
    ]],
  ], true),
  mod('sales', 'Sales', ShoppingCart, [
    ['Pre-Sales', [
      ['sales-quotes', 'Sales Quotes', Tickets],
    ]],
    ['Sales Transactions', [
      ['sales-orders', 'Sales Orders', ShoppingCart],
      ['sales-deliveries', 'Sales Deliveries', Van],
      ['sales-invoices', 'Sales Invoices', Document],
      ['sales-payments', 'Sales Payments', Wallet],
      ['sales-returns', 'Sales Returns', RefreshLeft],
    ]],
  ], true),
  mod('purchase', 'Purchase', ShoppingBag, [
    ['Requisition', [
      ['purchase-requests', 'Purchase Requests', Memo],
    ]],
    ['Purchase Transactions', [
      ['purchase-orders', 'Purchase Orders', ShoppingBag],
      ['purchase-receipts', 'Purchase Receipts', Box],
      ['purchase-invoices', 'Purchase Invoices', Files],
      ['purchase-payments', 'Purchase Payments', CreditCard],
      ['purchase-returns', 'Purchase Returns', RefreshLeft],
    ]],
  ], true),
]

export const STATIC_MODULES: MenuModule[] = [
  // Inventory pages are the functional WMS (see WMS_VIEWS in the router), not static mockups.
  mod('inventory', 'Warehouse & Inventory', Box, [
    ['Warehouse', [
      ['rack-map', 'Rack Map', MapLocation],
    ]],
    ['Stock Information', [
      ['stock-balance', 'Stock Balance', Grid],
      ['stock-movement', 'Stock Movement', Sort],
      ['batch-serial', 'Batch & Serial', Postcard],
    ]],
    ['Warehouse Operations', [
      ['inbound-receiving', 'Inbound & Putaway', Download],
      ['outbound-picking', 'Outbound Picking (FEFO)', Upload],
      ['picking-list', 'Picking List', Tickets],
      ['packing-list', 'Packing List', TakeawayBox],
      ['checking-list', 'Checking List', Finished],
      ['warehouse-tasks', 'Warehouse Tasks', List],
      ['task-scan', 'Mobile Scan', Iphone],
    ]],
    ['Stock Transactions', [
      ['stock-transfer', 'Stock Transfer', Switch],
      ['stock-opname', 'Stock Opname', Checked],
      ['stock-adjustment', 'Stock Adjustment', Operation],
    ]],
    ['Warehouse Setup', [
      ['wms-contacts', 'Suppliers & Customers', Avatar],
    ]],
  ]),
  mod('manufacturing', 'Manufacturing', Tools, [
    ['Planning', [
      ['bill-of-materials', 'Bill of Materials', List],
      ['production-orders', 'Production Orders', Tickets],
    ]],
    ['Shop Floor', [
      ['work-orders', 'Work Orders', Memo],
      ['material-issue', 'Material Issue', TakeawayBox],
      ['production-result', 'Production Result', Finished],
    ]],
    ['Costing', [
      ['wip-costing', 'WIP & Costing', Coin],
    ]],
  ]),
  mod('ar-ap', 'AR / AP', Money, [
    ['Receivables', [
      ['ar-aging', 'AR Aging', Timer],
      ['customer-statements', 'Customer Statements', Document],
    ]],
    ['Payables', [
      ['ap-aging', 'AP Aging', AlarmClock],
      ['supplier-statements', 'Supplier Statements', DocumentCopy],
    ]],
  ]),
  mod('cash-bank', 'Cash & Bank', Wallet, [
    ['Accounts', [
      ['cash-accounts', 'Cash Accounts', WalletFilled],
    ]],
    ['Cash Transactions', [
      ['cash-receipts', 'Cash Receipts', Download],
      ['cash-disbursements', 'Cash Disbursements', Upload],
    ]],
    ['Reconciliation', [
      ['bank-reconciliation', 'Bank Reconciliation', Connection],
    ]],
  ]),
  mod('accounting', 'Accounting', Notebook, [
    ['Journals', [
      ['journal-entries', 'Journal Entries', EditPen],
      ['recurring-journal', 'Recurring Journal', RefreshRight],
      ['opening-balance', 'Opening Balance', Flag],
    ]],
    ['Ledgers', [
      ['general-ledger', 'General Ledger', Notebook],
      ['trial-balance', 'Trial Balance', ScaleToOriginal],
    ]],
    ['Period End', [
      ['period-closing', 'Period Closing', Lock],
    ]],
  ]),
  mod('fixed-asset', 'Fixed Asset', OfficeBuilding, [
    ['Asset Management', [
      ['asset-register', 'Asset Register', Collection],
      ['asset-disposal', 'Asset Disposal', Delete],
    ]],
    ['Depreciation', [
      ['depreciation', 'Depreciation', TrendCharts],
    ]],
  ]),
  mod('tax', 'Tax', Discount, [
    ['Tax Setup', [
      ['tax-configuration', 'Tax Configuration', Setting],
    ]],
    ['Tax Compliance', [
      ['tax-transactions', 'Tax Transactions', Tickets],
      ['tax-reports', 'Tax Reports', Histogram],
    ]],
  ]),
  mod('budget-project', 'Budget & Project', Briefcase, [
    ['Budgeting', [
      ['budget', 'Budget', Coin],
      ['budget-vs-actual', 'Budget vs Actual', DataAnalysis],
    ]],
    ['Projects', [
      ['projects', 'Projects', FolderOpened],
      ['project-profitability', 'Project Profitability', TrendCharts],
    ]],
  ]),
  mod('reports', 'Reports & Analytics', DataLine, [
    ['Operational Reports', [
      ['sales-reports', 'Sales Reports', Sell],
      ['purchase-reports', 'Purchase Reports', ShoppingBag],
      ['inventory-reports', 'Inventory Reports', Box],
    ]],
    ['Financial & BI', [
      ['financial-reports', 'Financial Reports', PieChart],
      ['executive-bi', 'Executive BI', Odometer],
    ]],
  ]),
  mod('pos-payments', 'POS & Payments', Shop, [
    ['Point of Sale', [
      ['pos-dashboard', 'POS Dashboard', Monitor],
      ['stores-outlets', 'Stores & Outlets', Shop],
      ['pos-product-mapping', 'POS Product Mapping', PriceTag],
      ['pos-transactions', 'POS Transactions', Tickets],
      ['refunds-voids', 'Refunds & Voids', RefreshLeft],
      ['cashier-shift', 'Cashier & Shift', Clock],
    ]],
    ['Payments', [
      ['payment-channels', 'Payment Channels', CreditCard],
      ['payment-transactions', 'Payment Transactions', Money],
      ['payment-refunds', 'Payment Refunds', Back],
      ['payment-reconciliation', 'Payment Reconciliation', Connection],
      ['settlement', 'Settlement', Checked],
    ]],
    ['Integrations', [
      ['webhook-events', 'Webhook Events', Lightning],
      ['integration-hub', 'Integration Hub', Link],
      ['integration-logs', 'Integration Logs', Document],
    ]],
  ]),
  mod('hr', 'HR & People', UserFilled, [
    ['Overview', [
      ['hr-dashboard', 'HR Dashboard', Odometer],
      ['hr-reports', 'HR Reports', Histogram],
    ]],
    ['Employees', [
      ['employees', 'Employees', User],
      ['organization', 'Organization', Share],
      ['employee-self-service', 'Employee Self Service', Iphone],
    ]],
    ['Time & Attendance', [
      ['attendance', 'Attendance', Calendar],
      ['time-off', 'Time Off', Sunny],
      ['overtime', 'Overtime', Timer],
      ['scheduler-shifts', 'Scheduler & Shifts', Clock],
    ]],
    ['Payroll & Benefits', [
      ['payroll-processing', 'Payroll Processing', Money],
      ['payroll-components', 'Payroll Components', Coin],
      ['payslips', 'Payslips', Tickets],
      ['reimbursements', 'Reimbursements', Wallet],
      ['employee-loans', 'Employee Loans', CreditCard],
    ]],
    ['Talent', [
      ['recruitment', 'Recruitment', Avatar],
      ['onboarding', 'Onboarding', Promotion],
      ['offboarding', 'Offboarding', SwitchButton],
      ['performance', 'Performance', Trophy],
      ['kpi-master', 'KPI Master', Aim],
      ['learning-development', 'Learning & Development', Reading],
    ]],
    ['Settings', [
      ['hr-settings', 'HR Settings', Setting],
    ]],
  ]),
  mod('administration', 'Administration', Setting, [
    ['Access Control', [
      ['users-roles', 'Users & Roles', Key],
      ['approval-workflow', 'Approval Workflow', Stamp],
    ]],
    ['Monitoring', [
      ['audit-log', 'Audit Log', View],
      ['notifications', 'Notifications', Bell],
    ]],
    ['Integrations', [
      ['integrations-api', 'Integrations & API', Connection],
    ]],
  ]),
]

/** Sidebar order: hand-routed modules first, then the static mockup modules. */
export const MENU_MODULES: MenuModule[] = [...ROUTED_MODULES, ...STATIC_MODULES]

export const STATIC_MENU_ITEMS = STATIC_MODULES.flatMap((m) => m.items.map((item) => ({ ...item, module: m })))

export function staticMenuItem(key: string) {
  return STATIC_MENU_ITEMS.find((item) => item.key === key)
}
