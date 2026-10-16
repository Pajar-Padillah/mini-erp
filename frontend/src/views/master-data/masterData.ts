// Static mock data for the Master Data list screens (UI only, no backend yet).

export interface MasterColumn {
  prop: string
  label: string
  minWidth?: number
  width?: number
  align?: 'left' | 'right' | 'center'
  type?: 'text' | 'money' | 'percent'
}

export interface MasterConfig {
  title: string
  newLabel: string
  columns: MasterColumn[]
  rows: Record<string, string | number>[]
}

export type MasterKey = 'customers' | 'suppliers' | 'products' | 'warehouses' | 'chart-of-accounts' | 'tax-codes'

export const MASTER_DATA: Record<MasterKey, MasterConfig> = {
  customers: {
    title: 'Customers',
    newLabel: '+ New Customer',
    columns: [
      { prop: 'code', label: 'Code', minWidth: 120 },
      { prop: 'name', label: 'Name', minWidth: 220 },
      { prop: 'phone', label: 'Phone', minWidth: 150 },
      { prop: 'email', label: 'Email', minWidth: 200 },
      { prop: 'city', label: 'City', minWidth: 130 },
    ],
    rows: [
      { code: 'CUST-0001', name: 'PT Maju Bersama', phone: '021-5550101', email: 'purchasing@majubersama.co.id', city: 'Jakarta' },
      { code: 'CUST-0002', name: 'CV Sinar Jaya', phone: '022-4207788', email: 'admin@sinarjaya.id', city: 'Bandung' },
      { code: 'CUST-0003', name: 'PT Nusantara Retail', phone: '031-8890123', email: 'order@nusantararetail.com', city: 'Surabaya' },
      { code: 'CUST-0004', name: 'Toko Berkah Abadi', phone: '0274-512345', email: 'berkahabadi@gmail.com', city: 'Yogyakarta' },
      { code: 'CUST-0005', name: 'PT Global Teknik', phone: '021-7781234', email: 'finance@globalteknik.co.id', city: 'Tangerang' },
      { code: 'CUST-0006', name: 'CV Karya Mandiri', phone: '024-3561200', email: 'karyamandiri@yahoo.com', city: 'Semarang' },
      { code: 'CUST-0007', name: 'PT Sentosa Makmur', phone: '061-4567890', email: 'procurement@sentosa.co.id', city: 'Medan' },
      { code: 'CUST-0008', name: 'UD Sumber Rezeki', phone: '0341-778899', email: 'sumberrezeki@gmail.com', city: 'Malang' },
      { code: 'CUST-0009', name: 'PT Cahaya Elektrik', phone: '021-6612345', email: 'po@cahayaelektrik.com', city: 'Bekasi' },
      { code: 'CUST-0010', name: 'PT Prima Distribusi', phone: '0411-445566', email: 'admin@primadistribusi.id', city: 'Makassar' },
      { code: 'CUST-0011', name: 'CV Mitra Usaha', phone: '0361-223344', email: 'mitrausaha@gmail.com', city: 'Denpasar' },
      { code: 'CUST-0012', name: 'PT Indo Supplies', phone: '021-2934455', email: 'sales@indosupplies.co.id', city: 'Jakarta' },
    ],
  },
  suppliers: {
    title: 'Suppliers',
    newLabel: '+ New Supplier',
    columns: [
      { prop: 'code', label: 'Code', minWidth: 120 },
      { prop: 'name', label: 'Name', minWidth: 220 },
      { prop: 'contact', label: 'Contact Person', minWidth: 160 },
      { prop: 'phone', label: 'Phone', minWidth: 150 },
      { prop: 'city', label: 'City', minWidth: 130 },
    ],
    rows: [
      { code: 'SUPP-0001', name: 'PT Baja Perkasa', contact: 'Budi Santoso', phone: '021-4401122', city: 'Cilegon' },
      { code: 'SUPP-0002', name: 'PT Plastindo Utama', contact: 'Rina Wijaya', phone: '021-5903344', city: 'Tangerang' },
      { code: 'SUPP-0003', name: 'CV Kemasan Prima', contact: 'Agus Salim', phone: '031-7325566', city: 'Sidoarjo' },
      { code: 'SUPP-0004', name: 'PT Kimia Farma Industri', contact: 'Dewi Lestari', phone: '022-6017788', city: 'Bandung' },
      { code: 'SUPP-0005', name: 'PT Logistik Cepat', contact: 'Hendra Gunawan', phone: '021-8899001', city: 'Jakarta' },
      { code: 'SUPP-0006', name: 'UD Kayu Jati Makmur', contact: 'Slamet Riyadi', phone: '0291-445512', city: 'Jepara' },
      { code: 'SUPP-0007', name: 'PT Elektronik Jaya', contact: 'Fajar Nugroho', phone: '021-6243300', city: 'Jakarta' },
    ],
  },
  products: {
    title: 'Products',
    newLabel: '+ New Product',
    columns: [
      { prop: 'sku', label: 'SKU', minWidth: 130 },
      { prop: 'name', label: 'Name', minWidth: 240 },
      { prop: 'category', label: 'Category', minWidth: 140 },
      { prop: 'uom', label: 'UoM', width: 90 },
      { prop: 'price', label: 'Sales Price', minWidth: 150, align: 'right', type: 'money' },
    ],
    rows: [
      { sku: 'PRD-0001', name: 'Steel Pipe 2" x 6m', category: 'Raw Material', uom: 'PCS', price: 285000 },
      { sku: 'PRD-0002', name: 'PVC Pipe 1/2" x 4m', category: 'Raw Material', uom: 'PCS', price: 42000 },
      { sku: 'PRD-0003', name: 'Cardboard Box 40x30x30', category: 'Packaging', uom: 'PCS', price: 8500 },
      { sku: 'PRD-0004', name: 'Industrial Glue 1kg', category: 'Consumable', uom: 'KG', price: 67500 },
      { sku: 'PRD-0005', name: 'LED Panel 18W', category: 'Finished Goods', uom: 'PCS', price: 125000 },
      { sku: 'PRD-0006', name: 'Copper Cable 2.5mm', category: 'Raw Material', uom: 'ROLL', price: 950000 },
      { sku: 'PRD-0007', name: 'Teak Wood Plank', category: 'Raw Material', uom: 'M3', price: 12500000 },
      { sku: 'PRD-0008', name: 'Safety Helmet', category: 'Finished Goods', uom: 'PCS', price: 75000 },
      { sku: 'PRD-0009', name: 'Stretch Film 50cm', category: 'Packaging', uom: 'ROLL', price: 110000 },
      { sku: 'PRD-0010', name: 'Lubricant Oil 5L', category: 'Consumable', uom: 'CAN', price: 340000 },
      { sku: 'PRD-0011', name: 'Office Desk 120cm', category: 'Finished Goods', uom: 'PCS', price: 1850000 },
    ],
  },
  warehouses: {
    title: 'Warehouses',
    newLabel: '+ New Warehouse',
    columns: [
      { prop: 'code', label: 'Code', minWidth: 120 },
      { prop: 'name', label: 'Name', minWidth: 220 },
      { prop: 'address', label: 'Address', minWidth: 280 },
      { prop: 'pic', label: 'PIC', minWidth: 150 },
    ],
    rows: [
      { code: 'WH-JKT', name: 'Jakarta Main Warehouse', address: 'Jl. Raya Cakung No. 12, Jakarta Timur', pic: 'Andi Pratama' },
      { code: 'WH-SBY', name: 'Surabaya Warehouse', address: 'Jl. Rungkut Industri III No. 8, Surabaya', pic: 'Siti Rahma' },
      { code: 'WH-BDG', name: 'Bandung Warehouse', address: 'Jl. Soekarno-Hatta No. 455, Bandung', pic: 'Yusuf Hidayat' },
      { code: 'WH-TRN', name: 'Transit Warehouse', address: 'Kawasan Pelabuhan Tanjung Priok, Jakarta Utara', pic: 'Rudi Hartono' },
    ],
  },
  'chart-of-accounts': {
    title: 'Chart of Accounts',
    newLabel: '+ New Account',
    columns: [
      { prop: 'code', label: 'Account No', minWidth: 130 },
      { prop: 'name', label: 'Account Name', minWidth: 240 },
      { prop: 'type', label: 'Type', minWidth: 140 },
      { prop: 'normal', label: 'Normal Balance', minWidth: 140 },
    ],
    rows: [
      { code: '1-1100', name: 'Cash on Hand', type: 'Asset', normal: 'Debit' },
      { code: '1-1200', name: 'Bank BCA', type: 'Asset', normal: 'Debit' },
      { code: '1-1300', name: 'Accounts Receivable', type: 'Asset', normal: 'Debit' },
      { code: '1-1400', name: 'Inventory', type: 'Asset', normal: 'Debit' },
      { code: '1-1500', name: 'VAT In', type: 'Asset', normal: 'Debit' },
      { code: '2-1100', name: 'Accounts Payable', type: 'Liability', normal: 'Credit' },
      { code: '2-1200', name: 'VAT Out', type: 'Liability', normal: 'Credit' },
      { code: '3-1000', name: 'Share Capital', type: 'Equity', normal: 'Credit' },
      { code: '3-2000', name: 'Retained Earnings', type: 'Equity', normal: 'Credit' },
      { code: '4-1000', name: 'Sales Revenue', type: 'Revenue', normal: 'Credit' },
      { code: '4-2000', name: 'Sales Discount', type: 'Revenue', normal: 'Debit' },
      { code: '5-1000', name: 'Cost of Goods Sold', type: 'Expense', normal: 'Debit' },
      { code: '6-1000', name: 'Salary Expense', type: 'Expense', normal: 'Debit' },
      { code: '6-2000', name: 'Rent Expense', type: 'Expense', normal: 'Debit' },
    ],
  },
  'tax-codes': {
    title: 'Tax Codes',
    newLabel: '+ New Tax Code',
    columns: [
      { prop: 'code', label: 'Code', minWidth: 120 },
      { prop: 'name', label: 'Name', minWidth: 220 },
      { prop: 'rate', label: 'Rate', width: 110, align: 'right', type: 'percent' },
      { prop: 'account', label: 'Tax Account', minWidth: 180 },
    ],
    rows: [
      { code: 'PPN11', name: 'PPN 11%', rate: 11, account: '2-1200 VAT Out' },
      { code: 'PPN12', name: 'PPN 12%', rate: 12, account: '2-1200 VAT Out' },
      { code: 'PPN0', name: 'PPN 0% (Export)', rate: 0, account: '2-1200 VAT Out' },
      { code: 'PPH23', name: 'PPh 23 - Services', rate: 2, account: '2-1300 PPh 23 Payable' },
      { code: 'NONTAX', name: 'Non Taxable', rate: 0, account: '-' },
      { code: 'PPN10', name: 'PPN 10% (Legacy)', rate: 10, account: '2-1200 VAT Out' },
    ],
  },
}
