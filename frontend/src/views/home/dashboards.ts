// Static mockup data for the Home dashboard views. Numbers are internally consistent
// within a view (e.g. revenue by branch sums to the revenue KPI) but are not live data.
import type { Component } from 'vue'
import {
  Box, Briefcase, Coin, Connection, Discount, Odometer, Sell, Shop, ShoppingBag, Tools, UserFilled, Wallet,
} from '@element-plus/icons-vue'
import { STATUS_COLORS, type ChartDatum, type ValueKind } from '../../components/charts/chartUtils'

export interface DashKpi {
  label: string
  value: string
  hint: string
  trend?: 'up' | 'down'
}

export interface DashChart {
  title: string
  subtitle?: string
  type: 'bar' | 'line' | 'hbar' | 'donut'
  kind?: ValueKind
  data: ChartDatum[]
  /** Line charts: zoom the y-axis instead of starting at zero (for narrow % ranges). */
  minZero?: boolean
  /** Horizontal bars: show each step as a share of the first (funnels). */
  showShare?: boolean
  centerLabel?: string
}

export interface DashProcess {
  label: string
  done: number
  total: number
}

export interface DashSignal {
  title: string
  detail: string
  count: number
  tone: 'critical' | 'warning' | 'info'
  to: string
}

export interface DashLink {
  label: string
  to: string
}

export interface DashboardView {
  key: string
  short: string
  icon: Component
  title: string
  subtitle: string
  kpis: DashKpi[]
  charts: DashChart[]
  process: DashProcess[]
  signals: DashSignal[]
  drilldown: DashLink[]
}

/** Last `n` month labels ending with the current month, e.g. ["Jan", …, "Oct"]. */
function lastMonths(n: number): string[] {
  const now = new Date()
  return Array.from({ length: n }, (_, i) =>
    new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1).toLocaleString('en-US', { month: 'short' }),
  )
}

/** Last `n` day labels ending today, e.g. ["7 Oct", …, "16 Oct"]. */
function lastDays(n: number): string[] {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now)
    d.setDate(now.getDate() - (n - 1 - i))
    return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`
  })
}

function series(labels: string[], values: number[]): ChartDatum[] {
  return labels.map((label, i) => ({ label, value: values[i] }))
}

const MONTHS = lastMonths(10)

const docStatus = (completed: number, processed: number, active: number, draft: number): ChartDatum[] => [
  { label: 'Completed', value: completed, color: STATUS_COLORS.good },
  { label: 'Processed', value: processed, color: STATUS_COLORS.warning },
  { label: 'Active', value: active, color: STATUS_COLORS.info },
  { label: 'Draft', value: draft, color: STATUS_COLORS.neutral },
]

export const DASHBOARDS: DashboardView[] = [
  {
    key: 'executive',
    short: 'Executive',
    icon: Odometer,
    title: 'Executive Overview',
    subtitle: 'Group-wide performance across sales, finance, inventory and people',
    kpis: [
      { label: 'Revenue (MTD)', value: 'Rp 1.284.500.000', hint: '+12,8% vs last month', trend: 'up' },
      { label: 'AR Outstanding', value: 'Rp 412.750.000', hint: '38 open invoices' },
      { label: 'AP Outstanding', value: 'Rp 268.300.000', hint: '21 supplier bills' },
      { label: 'Inventory Value', value: 'Rp 2.146.000.000', hint: 'Across 4 branches' },
    ],
    charts: [
      {
        title: 'Revenue Trend',
        subtitle: 'Monthly invoiced revenue',
        type: 'bar',
        kind: 'money',
        data: series(MONTHS, [812e6, 868e6, 845e6, 926e6, 958e6, 1012e6, 1046e6, 1098e6, 1139e6, 1284.5e6]),
      },
      {
        title: 'Revenue by Branch',
        subtitle: 'Month to date',
        type: 'hbar',
        kind: 'money',
        data: [
          { label: 'CRUSITA', value: 486e6 },
          { label: 'AOERA', value: 352e6 },
          { label: 'YORS', value: 278e6 },
          { label: 'KYFEE', value: 168.5e6 },
        ],
      },
      {
        title: 'Cash Position',
        subtitle: 'Month-end balance, all bank and cash accounts',
        type: 'line',
        kind: 'money',
        data: series(MONTHS, [842e6, 905e6, 878e6, 961e6, 1004e6, 1052e6, 1118e6, 1176e6, 1210e6, 1285.4e6]),
      },
      {
        title: 'Document Status Mix',
        subtitle: 'Sales and purchase documents this month',
        type: 'donut',
        data: docStatus(46, 28, 19, 11),
        centerLabel: 'Documents',
      },
    ],
    process: [
      { label: 'Orders delivered', done: 46, total: 64 },
      { label: 'Deliveries invoiced', done: 52, total: 58 },
      { label: 'Invoices collected', done: 31, total: 49 },
      { label: 'POs received', done: 27, total: 35 },
      { label: 'Journals posted', done: 212, total: 230 },
    ],
    signals: [
      { title: 'Overdue customer invoices', detail: 'Rp 196.400.000 past due date', count: 12, tone: 'critical', to: '/ar-ap/ar-aging' },
      { title: 'Approvals waiting', detail: 'POs, journals and reimbursements', count: 9, tone: 'warning', to: '/administration/approval-workflow' },
      { title: 'SKUs below reorder point', detail: 'Across CRUSITA and AOERA', count: 3, tone: 'warning', to: '/inventory/stock-balance' },
      { title: 'Unreconciled bank lines', detail: 'Bank BCA and Mandiri', count: 15, tone: 'info', to: '/cash-bank/bank-reconciliation' },
    ],
    drilldown: [
      { label: 'Sales Orders', to: '/sales-orders' },
      { label: 'Sales Invoices', to: '/sales-invoices' },
      { label: 'AR Aging', to: '/ar-ap/ar-aging' },
      { label: 'Stock Balance', to: '/inventory/stock-balance' },
      { label: 'Trial Balance', to: '/accounting/trial-balance' },
      { label: 'Payroll Processing', to: '/hr/payroll-processing' },
    ],
  },
  {
    key: 'sales',
    short: 'Sales',
    icon: Sell,
    title: 'Sales & Retail Analytics',
    subtitle: 'Quotations, orders, deliveries, invoices and collections',
    kpis: [
      { label: 'Revenue (MTD)', value: 'Rp 1.284.500.000', hint: '+12,8% vs last month', trend: 'up' },
      { label: 'Sales Orders', value: '64', hint: '18 waiting for delivery' },
      { label: 'Receivables', value: 'Rp 412.750.000', hint: '38 open invoices' },
      { label: 'Avg. Order Value', value: 'Rp 20.070.000', hint: '+4,1% vs last month', trend: 'up' },
    ],
    charts: [
      {
        title: 'Revenue Trend',
        subtitle: 'Monthly invoiced revenue',
        type: 'line',
        kind: 'money',
        data: series(MONTHS, [812e6, 868e6, 845e6, 926e6, 958e6, 1012e6, 1046e6, 1098e6, 1139e6, 1284.5e6]),
      },
      {
        title: 'Top Customers',
        subtitle: 'Invoiced this month',
        type: 'hbar',
        kind: 'money',
        data: [
          { label: 'PT Cantik Distribusi Nusantara', value: 214e6 },
          { label: 'Toko Kosmetik Sukses Mandiri', value: 168e6 },
          { label: 'PT Mitra Retail Nusantara', value: 142e6 },
          { label: 'PT Griya Kemasan Cantik', value: 96e6 },
          { label: 'CV Aroma Store', value: 74e6 },
        ],
      },
      { title: 'Sales Order Status', type: 'donut', data: docStatus(31, 14, 12, 7), centerLabel: 'Orders' },
      {
        title: 'Sales Funnel',
        subtitle: 'Documents this month, share of quotations',
        type: 'hbar',
        showShare: true,
        data: [
          { label: 'Quotations', value: 92 },
          { label: 'Orders', value: 64 },
          { label: 'Deliveries', value: 58 },
          { label: 'Invoices', value: 49 },
          { label: 'Payments', value: 31 },
        ],
      },
    ],
    process: [
      { label: 'Quotes converted', done: 64, total: 92 },
      { label: 'Orders delivered', done: 46, total: 64 },
      { label: 'Deliveries invoiced', done: 52, total: 58 },
      { label: 'Invoices collected', done: 31, total: 49 },
    ],
    signals: [
      { title: 'Orders pending delivery', detail: 'Oldest waiting 6 days', count: 18, tone: 'warning', to: '/sales-orders' },
      { title: 'Invoices pending payment', detail: 'Rp 412.750.000 outstanding', count: 18, tone: 'critical', to: '/sales-invoices' },
      { title: 'Quotes expiring this week', detail: 'Follow up before validity ends', count: 6, tone: 'info', to: '/sales-quotes' },
      { title: 'Customers near credit limit', detail: 'Above 90% of their limit', count: 3, tone: 'warning', to: '/customers' },
    ],
    drilldown: [
      { label: 'Sales Quotes', to: '/sales-quotes' },
      { label: 'Sales Orders', to: '/sales-orders' },
      { label: 'Sales Deliveries', to: '/sales-deliveries' },
      { label: 'Sales Invoices', to: '/sales-invoices' },
      { label: 'Sales Payments', to: '/sales-payments' },
      { label: 'Sales Reports', to: '/reports/sales-reports' },
    ],
  },
  {
    key: 'procurement',
    short: 'Procurement',
    icon: ShoppingBag,
    title: 'Procurement Analytics',
    subtitle: 'Purchase demand, supplier commitments, receipts and payables',
    kpis: [
      { label: 'PO Value (MTD)', value: 'Rp 846.200.000', hint: '+6,3% vs last month', trend: 'up' },
      { label: 'Open Requests', value: '14', hint: '5 awaiting approval' },
      { label: 'AP Outstanding', value: 'Rp 268.300.000', hint: '21 supplier bills' },
      { label: 'Active Suppliers', value: '23', hint: '+2 this month', trend: 'up' },
    ],
    charts: [
      {
        title: 'Purchase Trend',
        subtitle: 'Monthly PO value',
        type: 'line',
        kind: 'money',
        data: series(MONTHS, [612e6, 655e6, 598e6, 702e6, 688e6, 741e6, 768e6, 755e6, 796e6, 846.2e6]),
      },
      {
        title: 'Spend by Supplier',
        subtitle: 'PO value this month',
        type: 'hbar',
        kind: 'money',
        data: [
          { label: 'PT Baja Perkasa', value: 248e6 },
          { label: 'PT Plastindo Utama', value: 186e6 },
          { label: 'CV Kemasan Prima', value: 142e6 },
          { label: 'PT Elektronik Jaya', value: 118e6 },
          { label: 'UD Kayu Jati Makmur', value: 96e6 },
        ],
      },
      { title: 'PO Status', type: 'donut', data: docStatus(18, 9, 6, 2), centerLabel: 'POs' },
      {
        title: 'Procurement Funnel',
        subtitle: 'Documents this month, share of requests',
        type: 'hbar',
        showShare: true,
        data: [
          { label: 'Requests', value: 52 },
          { label: 'Purchase Orders', value: 35 },
          { label: 'Received', value: 27 },
          { label: 'Invoiced', value: 24 },
          { label: 'Paid', value: 19 },
        ],
      },
    ],
    process: [
      { label: 'Requests approved', done: 38, total: 52 },
      { label: 'POs received', done: 27, total: 35 },
      { label: 'Receipts invoiced', done: 24, total: 27 },
      { label: 'Supplier bills paid', done: 19, total: 24 },
    ],
    signals: [
      { title: 'POs awaiting approval', detail: 'Rp 128.400.000 in total', count: 5, tone: 'warning', to: '/purchase-orders' },
      { title: 'Received, not invoiced', detail: 'Goods received without a bill', count: 3, tone: 'info', to: '/purchase-invoices' },
      { title: 'Overdue supplier bills', detail: 'Rp 42.600.000 past due', count: 4, tone: 'critical', to: '/ar-ap/ap-aging' },
      { title: 'Supplier concentration', detail: 'Top supplier holds 29% of spend', count: 1, tone: 'info', to: '/suppliers' },
    ],
    drilldown: [
      { label: 'Purchase Requests', to: '/purchase-requests' },
      { label: 'Purchase Orders', to: '/purchase-orders' },
      { label: 'Purchase Invoices', to: '/purchase-invoices' },
      { label: 'Purchase Payments', to: '/purchase-payments' },
      { label: 'Purchase Returns', to: '/purchase-returns' },
    ],
  },
  {
    key: 'inventory',
    short: 'Inventory',
    icon: Box,
    title: 'Inventory & Warehouse Analytics',
    subtitle: 'Stock position, valuation and movement across warehouses',
    kpis: [
      { label: 'Inventory Value', value: 'Rp 2.146.000.000', hint: 'Across 4 branches' },
      { label: 'Active SKUs', value: '17', hint: '3 below reorder point' },
      { label: 'Warehouses', value: '4', hint: '1 opname in progress' },
      { label: 'Transfers (MTD)', value: '12', hint: '3 in transit' },
    ],
    charts: [
      {
        title: 'Inventory Value by Branch',
        type: 'hbar',
        kind: 'money',
        data: [
          { label: 'CRUSITA', value: 812e6 },
          { label: 'AOERA', value: 604e6 },
          { label: 'YORS', value: 452e6 },
          { label: 'KYFEE', value: 278e6 },
        ],
      },
      {
        title: 'Stock by Category',
        type: 'donut',
        kind: 'money',
        data: [
          { label: 'Finished Goods', value: 1210e6 },
          { label: 'Raw Material', value: 620e6 },
          { label: 'Packaging', value: 216e6 },
          { label: 'Consumable', value: 100e6 },
        ],
      },
      {
        title: 'Stock Movement Trend',
        subtitle: 'Movement documents per month',
        type: 'line',
        data: series(MONTHS, [142, 156, 149, 171, 168, 184, 193, 188, 205, 214]),
      },
      {
        title: 'Top SKUs by Value',
        type: 'hbar',
        kind: 'money',
        data: [
          { label: 'Crusita Noir Eau de Parfum 50ml', value: 342e6 },
          { label: 'Aoera Hydrating Serum 30ml', value: 268e6 },
          { label: 'Yors Studio Matte Lip 4g', value: 196e6 },
          { label: 'Crusita Body Mist 100ml', value: 154e6 },
          { label: 'Aoera Sunscreen SPF50', value: 121e6 },
        ],
      },
    ],
    process: [
      { label: 'Warehouses counted', done: 3, total: 4 },
      { label: 'Transfers received', done: 9, total: 12 },
      { label: 'Adjustments approved', done: 5, total: 6 },
      { label: 'SKUs above reorder point', done: 14, total: 17 },
    ],
    signals: [
      { title: 'Low stock / reorder point', detail: 'Reorder before next week', count: 3, tone: 'warning', to: '/inventory/stock-balance' },
      { title: 'Transfers in transit', detail: 'Oldest sent 4 days ago', count: 3, tone: 'info', to: '/inventory/stock-transfer' },
      { title: 'Warehouse not yet counted', detail: 'KYFEE main warehouse', count: 1, tone: 'warning', to: '/inventory/stock-opname' },
      { title: 'Unusual adjustments', detail: 'Above Rp 5.000.000 each', count: 2, tone: 'critical', to: '/inventory/stock-adjustment' },
    ],
    drilldown: [
      { label: 'Stock Balance', to: '/inventory/stock-balance' },
      { label: 'Stock Movement', to: '/inventory/stock-movement' },
      { label: 'Stock Transfer', to: '/inventory/stock-transfer' },
      { label: 'Stock Opname', to: '/inventory/stock-opname' },
      { label: 'Inventory Reports', to: '/reports/inventory-reports' },
    ],
  },
  {
    key: 'manufacturing',
    short: 'Manufacturing',
    icon: Tools,
    title: 'Manufacturing Analytics',
    subtitle: 'Production plan, output, material issue and WIP costing',
    kpis: [
      { label: 'Production Orders', value: '12', hint: '4 in progress' },
      { label: 'Work Orders', value: '28', hint: '6 open on the shop floor' },
      { label: 'Output (MTD)', value: '4.860 pcs', hint: '+9,2% vs last month', trend: 'up' },
      { label: 'WIP Value', value: 'Rp 186.400.000', hint: '4 orders in progress' },
    ],
    charts: [
      {
        title: 'Output Trend',
        subtitle: 'Finished units per month',
        type: 'line',
        data: series(MONTHS, [3620, 3880, 3710, 4050, 4120, 4380, 4290, 4510, 4450, 4860]),
      },
      {
        title: 'Output by Product',
        subtitle: 'Units this month',
        type: 'hbar',
        data: [
          { label: 'Crusita Noir EDP 50ml', value: 1650 },
          { label: 'Aoera Hydrating Serum', value: 1320 },
          { label: 'Yors Matte Lip', value: 1080 },
          { label: 'Crusita Body Mist', value: 810 },
        ],
      },
      {
        title: 'Manufacturing Cost Mix',
        subtitle: 'Month to date',
        type: 'donut',
        kind: 'money',
        data: [
          { label: 'Material', value: 412e6 },
          { label: 'Labor', value: 153e6 },
          { label: 'Overhead', value: 99e6 },
        ],
      },
      { title: 'Production Order Status', type: 'donut', data: docStatus(6, 4, 1, 1), centerLabel: 'Orders' },
    ],
    process: [
      { label: 'BOMs approved', done: 22, total: 24 },
      { label: 'Material issued', done: 9, total: 12 },
      { label: 'Work orders closed', done: 22, total: 28 },
      { label: 'Production results posted', done: 6, total: 8 },
    ],
    signals: [
      { title: 'Orders past due date', detail: 'Late against planned finish', count: 2, tone: 'critical', to: '/manufacturing/production-orders' },
      { title: 'Material shortage', detail: 'Blocking 1 production order', count: 1, tone: 'warning', to: '/manufacturing/material-issue' },
      { title: 'Yield variance above 5%', detail: 'Review production results', count: 2, tone: 'warning', to: '/manufacturing/production-result' },
      { title: 'WIP older than 30 days', detail: 'Rp 24.800.000 tied up', count: 1, tone: 'info', to: '/manufacturing/wip-costing' },
    ],
    drilldown: [
      { label: 'Bill of Materials', to: '/manufacturing/bill-of-materials' },
      { label: 'Production Orders', to: '/manufacturing/production-orders' },
      { label: 'Work Orders', to: '/manufacturing/work-orders' },
      { label: 'Material Issue', to: '/manufacturing/material-issue' },
      { label: 'WIP & Costing', to: '/manufacturing/wip-costing' },
    ],
  },
  {
    key: 'finance',
    short: 'Finance',
    icon: Coin,
    title: 'Finance & Accounting Analytics',
    subtitle: 'Receivables, payables, journal activity and period closing',
    kpis: [
      { label: 'AR Outstanding', value: 'Rp 412.750.000', hint: '38 open invoices' },
      { label: 'AP Outstanding', value: 'Rp 268.300.000', hint: '21 supplier bills' },
      { label: 'Net Profit (MTD)', value: 'Rp 196.800.000', hint: '15,3% net margin', trend: 'up' },
      { label: 'Journals (MTD)', value: '230', hint: '18 not posted yet' },
    ],
    charts: [
      {
        title: 'AR Aging',
        subtitle: 'Outstanding receivables by days past due',
        type: 'bar',
        kind: 'money',
        data: [
          { label: 'Current', value: 216.35e6 },
          { label: '1–30', value: 100e6 },
          { label: '31–60', value: 52.4e6 },
          { label: '61–90', value: 28e6 },
          { label: '> 90', value: 16e6 },
        ],
      },
      {
        title: 'Profit & Loss (MTD)',
        type: 'hbar',
        kind: 'money',
        data: [
          { label: 'Revenue', value: 1284.5e6 },
          { label: 'Cost of goods sold', value: 742.6e6 },
          { label: 'Operating expenses', value: 287.4e6 },
          { label: 'Tax & other', value: 57.7e6 },
          { label: 'Net profit', value: 196.8e6 },
        ],
      },
      {
        title: 'Journal Activity',
        subtitle: 'Journal entries per month',
        type: 'line',
        data: series(MONTHS, [168, 175, 171, 186, 192, 198, 204, 201, 219, 230]),
      },
      {
        title: 'Journal Status',
        type: 'donut',
        data: [
          { label: 'Posted', value: 212, color: STATUS_COLORS.good },
          { label: 'Draft', value: 15, color: STATUS_COLORS.neutral },
          { label: 'Reversed', value: 3, color: STATUS_COLORS.critical },
        ],
        centerLabel: 'Journals',
      },
    ],
    process: [
      { label: 'Journals posted', done: 212, total: 230 },
      { label: 'Bank lines reconciled', done: 184, total: 199 },
      { label: 'AR collected this month', done: 31, total: 49 },
      { label: 'Closing checklist', done: 7, total: 10 },
    ],
    signals: [
      { title: 'Overdue receivables', detail: 'Rp 196.400.000 past due', count: 12, tone: 'critical', to: '/ar-ap/ar-aging' },
      { title: 'Overdue payables', detail: 'Rp 42.600.000 past due', count: 4, tone: 'warning', to: '/ar-ap/ap-aging' },
      { title: 'Unposted journals', detail: 'Post before period closing', count: 18, tone: 'warning', to: '/accounting/journal-entries' },
      { title: 'Closing exceptions', detail: 'Open items for this period', count: 2, tone: 'info', to: '/accounting/period-closing' },
    ],
    drilldown: [
      { label: 'AR Aging', to: '/ar-ap/ar-aging' },
      { label: 'AP Aging', to: '/ar-ap/ap-aging' },
      { label: 'Journal Entries', to: '/accounting/journal-entries' },
      { label: 'General Ledger', to: '/accounting/general-ledger' },
      { label: 'Trial Balance', to: '/accounting/trial-balance' },
      { label: 'Period Closing', to: '/accounting/period-closing' },
    ],
  },
  {
    key: 'tax',
    short: 'Tax',
    icon: Discount,
    title: 'Tax Analytics',
    subtitle: 'VAT, withholding tax, e-Faktur and filing status',
    kpis: [
      { label: 'PPN Output (MTD)', value: 'Rp 141.295.000', hint: 'From 49 sales invoices' },
      { label: 'PPN Input (MTD)', value: 'Rp 93.082.000', hint: 'From 24 supplier bills' },
      { label: 'Net VAT Payable', value: 'Rp 48.213.000', hint: 'Due on the 30th' },
      { label: 'PPh 23 Withheld', value: 'Rp 6.420.000', hint: '18 withholding slips' },
    ],
    charts: [
      {
        title: 'Net VAT Payable Trend',
        subtitle: 'PPN output minus input per month',
        type: 'line',
        kind: 'money',
        data: series(MONTHS, [29.8e6, 32.4e6, 31.1e6, 35.6e6, 36.9e6, 39.2e6, 40.8e6, 43.5e6, 44.9e6, 48.2e6]),
      },
      {
        title: 'Tax by Type (MTD)',
        type: 'hbar',
        kind: 'money',
        data: [
          { label: 'PPN Output', value: 141.3e6 },
          { label: 'PPN Input', value: 93.1e6 },
          { label: 'PPh 21', value: 38.4e6 },
          { label: 'PPh 23', value: 6.4e6 },
        ],
      },
      {
        title: 'Filing Status',
        subtitle: 'Tax returns this year',
        type: 'donut',
        data: [
          { label: 'Filed', value: 9, color: STATUS_COLORS.good },
          { label: 'Not filed', value: 2, color: STATUS_COLORS.warning },
          { label: 'Overdue', value: 1, color: STATUS_COLORS.critical },
        ],
        centerLabel: 'Returns',
      },
      {
        title: 'PPN Output by Branch',
        type: 'hbar',
        kind: 'money',
        data: [
          { label: 'CRUSITA', value: 53.5e6 },
          { label: 'AOERA', value: 38.7e6 },
          { label: 'YORS', value: 30.6e6 },
          { label: 'KYFEE', value: 18.5e6 },
        ],
      },
    ],
    process: [
      { label: 'e-Faktur uploaded', done: 142, total: 150 },
      { label: 'Returns filed', done: 9, total: 12 },
      { label: 'Withholding slips issued', done: 18, total: 20 },
    ],
    signals: [
      { title: 'e-Faktur not uploaded', detail: 'Upload before month end', count: 8, tone: 'warning', to: '/tax/tax-transactions' },
      { title: 'Overdue tax return', detail: 'PPh 21 for last month', count: 1, tone: 'critical', to: '/tax/tax-reports' },
      { title: 'Customers missing NPWP', detail: 'Needed for e-Faktur', count: 3, tone: 'info', to: '/customers' },
    ],
    drilldown: [
      { label: 'Tax Configuration', to: '/tax/tax-configuration' },
      { label: 'Tax Transactions', to: '/tax/tax-transactions' },
      { label: 'Tax Reports', to: '/tax/tax-reports' },
      { label: 'Tax Codes', to: '/tax-codes' },
    ],
  },
  {
    key: 'cash',
    short: 'Cash & Bank',
    icon: Wallet,
    title: 'Cash & Treasury Analytics',
    subtitle: 'Cash movement, bank balances and reconciliation',
    kpis: [
      { label: 'Cash Balance', value: 'Rp 1.285.400.000', hint: 'All bank and cash accounts' },
      { label: 'Receipts (MTD)', value: 'Rp 964.000.000', hint: '+8,4% vs last month', trend: 'up' },
      { label: 'Disbursements (MTD)', value: 'Rp 712.500.000', hint: '+3,1% vs last month' },
      { label: 'Net Cash Flow', value: 'Rp 251.500.000', hint: 'Receipts minus disbursements', trend: 'up' },
    ],
    charts: [
      {
        title: 'Cash Balance Trend',
        subtitle: 'Month-end balance',
        type: 'line',
        kind: 'money',
        data: series(MONTHS, [842e6, 905e6, 878e6, 961e6, 1004e6, 1052e6, 1118e6, 1176e6, 1210e6, 1285.4e6]),
      },
      {
        title: 'Balance by Account',
        type: 'hbar',
        kind: 'money',
        data: [
          { label: 'Bank BCA', value: 713.3e6 },
          { label: 'Bank Mandiri', value: 342e6 },
          { label: 'Bank BRI', value: 186.1e6 },
          { label: 'Petty Cash', value: 44e6 },
        ],
      },
      {
        title: 'Receipts by Method',
        subtitle: 'Month to date',
        type: 'donut',
        kind: 'money',
        data: [
          { label: 'Bank transfer', value: 612e6 },
          { label: 'QRIS', value: 188e6 },
          { label: 'Cash', value: 104e6 },
          { label: 'Giro', value: 60e6 },
        ],
      },
      {
        title: 'Reconciliation Status',
        subtitle: 'Bank statement lines this month',
        type: 'donut',
        data: [
          { label: 'Matched', value: 184, color: STATUS_COLORS.good },
          { label: 'Unmatched', value: 15, color: STATUS_COLORS.warning },
          { label: 'Excluded', value: 4, color: STATUS_COLORS.neutral },
        ],
        centerLabel: 'Lines',
      },
    ],
    process: [
      { label: 'Bank lines reconciled', done: 184, total: 199 },
      { label: 'Receipts allocated', done: 58, total: 62 },
      { label: 'Disbursements approved', done: 41, total: 44 },
    ],
    signals: [
      { title: 'Unreconciled bank lines', detail: 'Bank BCA and Mandiri', count: 15, tone: 'warning', to: '/cash-bank/bank-reconciliation' },
      { title: 'Large cash outflow', detail: 'Single payment above Rp 100 jt', count: 1, tone: 'info', to: '/cash-bank/cash-disbursements' },
      { title: 'Unallocated receipts', detail: 'Match to customer invoices', count: 4, tone: 'warning', to: '/cash-bank/cash-receipts' },
    ],
    drilldown: [
      { label: 'Cash Accounts', to: '/cash-bank/cash-accounts' },
      { label: 'Cash Receipts', to: '/cash-bank/cash-receipts' },
      { label: 'Cash Disbursements', to: '/cash-bank/cash-disbursements' },
      { label: 'Bank Reconciliation', to: '/cash-bank/bank-reconciliation' },
    ],
  },
  {
    key: 'pos',
    short: 'POS',
    icon: Shop,
    title: 'POS & Payments Analytics',
    subtitle: 'Outlet sales, payment channels, refunds and settlement',
    kpis: [
      { label: 'POS Sales (MTD)', value: 'Rp 318.600.000', hint: '+10,6% vs last month', trend: 'up' },
      { label: 'Transactions', value: '4.214', hint: 'Across 5 outlets' },
      { label: 'Avg. Basket', value: 'Rp 75.600', hint: '+2,3% vs last month', trend: 'up' },
      { label: 'Refunds', value: 'Rp 2.840.000', hint: '0,9% of POS sales' },
    ],
    charts: [
      {
        title: 'POS Sales Trend',
        subtitle: 'Daily sales, last 10 days',
        type: 'line',
        kind: 'money',
        data: series(lastDays(10), [27.4e6, 29.8e6, 31.2e6, 38.6e6, 41.9e6, 30.1e6, 28.7e6, 30.4e6, 33.2e6, 35.9e6]),
      },
      {
        title: 'Sales by Outlet',
        subtitle: 'Month to date',
        type: 'hbar',
        kind: 'money',
        data: [
          { label: 'Crusita Grand Indonesia', value: 96.4e6 },
          { label: 'Crusita Bandung', value: 71.2e6 },
          { label: 'Aoera Pondok Indah', value: 64.8e6 },
          { label: 'Yors Kota Kasablanka', value: 52.1e6 },
          { label: 'Kyfee Senayan', value: 34.1e6 },
        ],
      },
      {
        title: 'Payment Channel Mix',
        type: 'donut',
        kind: 'money',
        data: [
          { label: 'QRIS', value: 130.6e6 },
          { label: 'Card', value: 86e6 },
          { label: 'Cash', value: 60.6e6 },
          { label: 'E-wallet', value: 41.4e6 },
        ],
      },
      {
        title: 'Payment Status',
        subtitle: 'Gateway transactions this month',
        type: 'donut',
        data: [
          { label: 'Succeeded', value: 2486, color: STATUS_COLORS.good },
          { label: 'Refunded', value: 38, color: STATUS_COLORS.warning },
          { label: 'Failed', value: 22, color: STATUS_COLORS.critical },
        ],
        centerLabel: 'Payments',
      },
    ],
    process: [
      { label: 'Shifts closed', done: 142, total: 145 },
      { label: 'Payments reconciled', done: 2412, total: 2486 },
      { label: 'Settlements received', done: 27, total: 30 },
    ],
    signals: [
      { title: 'Failed payments', detail: 'Mostly card declines', count: 22, tone: 'warning', to: '/pos-payments/payment-transactions' },
      { title: 'Unmatched settlements', detail: 'Gateway vs bank mismatch', count: 3, tone: 'critical', to: '/pos-payments/payment-reconciliation' },
      { title: 'Refunds to review', detail: 'Above Rp 500.000 each', count: 4, tone: 'info', to: '/pos-payments/refunds-voids' },
    ],
    drilldown: [
      { label: 'POS Transactions', to: '/pos-payments/pos-transactions' },
      { label: 'Refunds & Voids', to: '/pos-payments/refunds-voids' },
      { label: 'Payment Transactions', to: '/pos-payments/payment-transactions' },
      { label: 'Payment Reconciliation', to: '/pos-payments/payment-reconciliation' },
      { label: 'Settlement', to: '/pos-payments/settlement' },
    ],
  },
  {
    key: 'hr',
    short: 'HR',
    icon: UserFilled,
    title: 'HR & People Analytics',
    subtitle: 'Workforce, attendance, payroll and recruitment',
    kpis: [
      { label: 'Employees', value: '186', hint: '+4 this month', trend: 'up' },
      { label: 'Attendance Rate', value: '96,2%', hint: 'Month to date' },
      { label: 'Payroll (MTD)', value: 'Rp 1.126.000.000', hint: '186 payslips' },
      { label: 'Open Positions', value: '7', hint: '42 candidates in pipeline' },
    ],
    charts: [
      {
        title: 'Headcount by Department',
        type: 'hbar',
        data: [
          { label: 'Production', value: 64 },
          { label: 'Sales & Retail', value: 48 },
          { label: 'Warehouse & Logistics', value: 27 },
          { label: 'Finance & Accounting', value: 18 },
          { label: 'HR & General Affairs', value: 17 },
          { label: 'Information Technology', value: 12 },
        ],
      },
      {
        title: 'Employment Status',
        type: 'donut',
        data: [
          { label: 'Permanent', value: 128 },
          { label: 'Contract', value: 46 },
          { label: 'Probation', value: 12 },
        ],
        centerLabel: 'Employees',
      },
      {
        title: 'Attendance Rate',
        subtitle: 'Monthly average',
        type: 'line',
        kind: 'percent',
        minZero: false,
        data: series(MONTHS, [94.8, 95.3, 95.1, 95.9, 96.4, 95.7, 96.1, 96.6, 95.9, 96.2]),
      },
      {
        title: 'Payroll Cost',
        subtitle: 'Monthly gross payroll',
        type: 'bar',
        kind: 'money',
        data: series(MONTHS, [1012e6, 1018e6, 1024e6, 1046e6, 1051e6, 1063e6, 1078e6, 1094e6, 1108e6, 1126e6]),
      },
    ],
    process: [
      { label: 'Timesheets approved', done: 172, total: 186 },
      { label: 'Leave requests processed', done: 23, total: 27 },
      { label: 'Performance reviews done', done: 118, total: 186 },
      { label: 'Onboarding tasks completed', done: 31, total: 40 },
    ],
    signals: [
      { title: 'Attendance exceptions', detail: 'Late or missing check-out', count: 9, tone: 'warning', to: '/hr/attendance' },
      { title: 'Contracts expiring in 30 days', detail: 'Renew or offboard', count: 5, tone: 'critical', to: '/hr/employees' },
      { title: 'Leave requests pending', detail: 'Waiting for manager approval', count: 4, tone: 'info', to: '/hr/time-off' },
      { title: 'Open critical positions', detail: 'Open for more than 45 days', count: 2, tone: 'warning', to: '/hr/recruitment' },
    ],
    drilldown: [
      { label: 'Employees', to: '/hr/employees' },
      { label: 'Attendance', to: '/hr/attendance' },
      { label: 'Time Off', to: '/hr/time-off' },
      { label: 'Payroll Processing', to: '/hr/payroll-processing' },
      { label: 'Recruitment', to: '/hr/recruitment' },
    ],
  },
  {
    key: 'budget',
    short: 'Budget',
    icon: Briefcase,
    title: 'Budget & Projects Analytics',
    subtitle: 'Budget consumption, project delivery and profitability',
    kpis: [
      { label: 'Annual Budget', value: 'Rp 12.400.000.000', hint: 'Approved for this year' },
      { label: 'Spent (YTD)', value: 'Rp 8.930.000.000', hint: '72% of annual budget' },
      { label: 'Active Projects', value: '9', hint: '3 at risk' },
      { label: 'Avg. Project Margin', value: '18,4%', hint: '+1,2 pts vs plan', trend: 'up' },
    ],
    charts: [
      {
        title: 'Budget Used by Department',
        subtitle: 'Share of annual budget spent',
        type: 'hbar',
        kind: 'percent',
        data: [
          { label: 'Marketing', value: 84 },
          { label: 'Production', value: 76 },
          { label: 'Information Technology', value: 71 },
          { label: 'Sales & Retail', value: 68 },
          { label: 'HR & General Affairs', value: 59 },
        ],
      },
      {
        title: 'Budget Utilization',
        subtitle: 'Cumulative share of annual budget spent',
        type: 'line',
        kind: 'percent',
        data: series(MONTHS, [7, 14, 22, 29, 36, 44, 51, 58, 65, 72]),
      },
      {
        title: 'Project Status',
        type: 'donut',
        data: [
          { label: 'On track', value: 5, color: STATUS_COLORS.good },
          { label: 'At risk', value: 3, color: STATUS_COLORS.warning },
          { label: 'Delayed', value: 1, color: STATUS_COLORS.critical },
        ],
        centerLabel: 'Projects',
      },
      {
        title: 'Project Margin',
        type: 'hbar',
        kind: 'percent',
        data: [
          { label: 'New outlet fit-out Bandung', value: 24.6 },
          { label: 'Crusita relaunch campaign', value: 21.3 },
          { label: 'Warehouse automation', value: 17.8 },
          { label: 'ERP rollout phase 2', value: 12.4 },
          { label: 'Aoera export pilot', value: 9.7 },
        ],
      },
    ],
    process: [
      { label: 'Budget lines approved', done: 46, total: 48 },
      { label: 'Project milestones met', done: 31, total: 38 },
      { label: 'Project invoices billed', done: 18, total: 24 },
    ],
    signals: [
      { title: 'Budget overrun risk', detail: 'Marketing at 84% with 2 months left', count: 1, tone: 'critical', to: '/budget-project/budget-vs-actual' },
      { title: 'Projects at risk', detail: 'Schedule or cost slipping', count: 3, tone: 'warning', to: '/budget-project/projects' },
      { title: 'Low-margin projects', detail: 'Below 10% margin', count: 1, tone: 'info', to: '/budget-project/project-profitability' },
    ],
    drilldown: [
      { label: 'Budget', to: '/budget-project/budget' },
      { label: 'Budget vs Actual', to: '/budget-project/budget-vs-actual' },
      { label: 'Projects', to: '/budget-project/projects' },
      { label: 'Project Profitability', to: '/budget-project/project-profitability' },
    ],
  },
  {
    key: 'it',
    short: 'IT & API',
    icon: Connection,
    title: 'IT & Integration Analytics',
    subtitle: 'Integration health, API activity and webhook processing',
    kpis: [
      { label: 'API Calls (24h)', value: '48.210', hint: '+5,6% vs yesterday', trend: 'up' },
      { label: 'Success Rate', value: '99,4%', hint: 'Last 24 hours' },
      { label: 'Webhook Events', value: '1.284', hint: '6 failed' },
      { label: 'Connected Integrations', value: '8', hint: '1 needs attention' },
    ],
    charts: [
      {
        title: 'API Calls',
        subtitle: 'Daily volume, last 10 days',
        type: 'bar',
        data: series(lastDays(10), [41200, 43800, 42100, 39600, 44900, 46300, 45100, 44200, 45650, 48210]),
      },
      {
        title: 'Calls by Integration',
        subtitle: 'Last 24 hours',
        type: 'hbar',
        data: [
          { label: 'Payment gateway', value: 18420 },
          { label: 'Marketplace sync', value: 12960 },
          { label: 'Bank statement API', value: 7340 },
          { label: 'Courier tracking', value: 5890 },
          { label: 'e-Faktur', value: 3600 },
        ],
      },
      {
        title: 'Webhook Processing',
        subtitle: 'Last 24 hours',
        type: 'donut',
        data: [
          { label: 'Processed', value: 1262, color: STATUS_COLORS.good },
          { label: 'Retrying', value: 16, color: STATUS_COLORS.warning },
          { label: 'Failed', value: 6, color: STATUS_COLORS.critical },
        ],
        centerLabel: 'Events',
      },
      {
        title: 'API Success Rate',
        subtitle: 'Daily, last 10 days',
        type: 'line',
        kind: 'percent',
        minZero: false,
        data: series(lastDays(10), [99.1, 99.3, 98.7, 99.5, 99.4, 99.6, 99.2, 99.5, 99.3, 99.4]),
      },
    ],
    process: [
      { label: 'Integrations healthy', done: 7, total: 8 },
      { label: 'Webhooks processed', done: 1262, total: 1284 },
      { label: 'Retry queue cleared', done: 38, total: 54 },
    ],
    signals: [
      { title: 'Provider timeouts', detail: 'Marketplace sync, last hour', count: 12, tone: 'warning', to: '/pos-payments/integration-logs' },
      { title: 'Failed webhooks', detail: 'Payment gateway callbacks', count: 6, tone: 'critical', to: '/pos-payments/webhook-events' },
      { title: 'Expiring API credentials', detail: 'Renew within 14 days', count: 1, tone: 'info', to: '/administration/integrations-api' },
    ],
    drilldown: [
      { label: 'Integration Hub', to: '/pos-payments/integration-hub' },
      { label: 'Webhook Events', to: '/pos-payments/webhook-events' },
      { label: 'Integration Logs', to: '/pos-payments/integration-logs' },
      { label: 'Audit Log', to: '/administration/audit-log' },
    ],
  },
]

export interface RecentTransaction {
  no: string
  type: string
  branch: string
  party: string
  date: string
  amount: number
  status: 'COMPLETED' | 'PROCESSED' | 'ACTIVE' | 'DRAFT'
  to: string
}

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export const RECENT_TRANSACTIONS: RecentTransaction[] = [
  { no: 'INV/CRS/0049', type: 'Sales Invoice', branch: 'CRUSITA', party: 'PT Cantik Distribusi Nusantara', date: daysAgo(0), amount: 18500000, status: 'ACTIVE', to: '/sales-invoices' },
  { no: 'PO/AOR/0035', type: 'Purchase Order', branch: 'AOERA', party: 'PT Plastindo Utama', date: daysAgo(0), amount: 42500000, status: 'PROCESSED', to: '/purchase-orders' },
  { no: 'SO/YRS/0064', type: 'Sales Order', branch: 'YORS', party: 'PT Mitra Retail Nusantara', date: daysAgo(1), amount: 12750000, status: 'DRAFT', to: '/sales-orders' },
  { no: 'PAY/CRS/0031', type: 'Sales Payment', branch: 'CRUSITA', party: 'Toko Kosmetik Sukses Mandiri', date: daysAgo(1), amount: 27300000, status: 'COMPLETED', to: '/sales-payments' },
  { no: 'DO/KYF/0058', type: 'Sales Delivery', branch: 'KYFEE', party: 'CV Aroma Store', date: daysAgo(2), amount: 9640000, status: 'COMPLETED', to: '/sales-deliveries' },
]
