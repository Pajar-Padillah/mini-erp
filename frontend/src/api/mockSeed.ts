// Initial mock data, ported from backend/seed/data.go: the Sant Group holding with its
// branches, brands, products, 500 units of stock per company and product, and four ACTIVE
// sample sales orders.
import { emptyDb, insert, nextDocNumber, nowIso, type MockDb } from './mockDb'
import { dec, formatDec, mulDec, roundDec, ZERO } from './mockDecimal'

const BRANCHES = [
  { code: 'CRS', name: 'CRUSITA' },
  { code: 'AOR', name: 'AOERA' },
  { code: 'YRS', name: 'YORS' },
  { code: 'KYF', name: 'KYFEE' },
]

const BRANDS = [
  { code: 'BR-CRUSITA', name: 'Crusita' },
  { code: 'BR-AOERA', name: 'Aoera' },
  { code: 'BR-YORS', name: 'Yors Studio' },
]

const PRODUCTS: { sku: string; name: string; brand: string; price: string }[] = [
  { sku: 'CRU-001', name: 'Crusita Noir Eau de Parfum 50ml', brand: 'BR-CRUSITA', price: '285000' },
  { sku: 'CRU-002', name: 'Crusita Blanc Eau de Parfum 50ml', brand: 'BR-CRUSITA', price: '285000' },
  { sku: 'CRU-003', name: 'Crusita Velvet Rose Eau de Parfum 30ml', brand: 'BR-CRUSITA', price: '195000' },
  { sku: 'CRU-004', name: 'Crusita Royal Oud Eau de Parfum 50ml', brand: 'BR-CRUSITA', price: '320000' },
  { sku: 'CRU-005', name: 'Crusita Citrus Bloom Eau de Parfum 30ml', brand: 'BR-CRUSITA', price: '195000' },
  { sku: 'CRU-006', name: 'Crusita Midnight Musk Body Mist 100ml', brand: 'BR-CRUSITA', price: '89000' },

  { sku: 'AOR-001', name: 'Aoera Gentle Facial Wash 100ml', brand: 'BR-AOERA', price: '39000' },
  { sku: 'AOR-002', name: 'Aoera Hydrating Toner 150ml', brand: 'BR-AOERA', price: '49000' },
  { sku: 'AOR-003', name: 'Aoera Hand & Body Lotion 200ml', brand: 'BR-AOERA', price: '45000' },
  { sku: 'AOR-004', name: 'Aoera Deo Spray Fresh 100ml', brand: 'BR-AOERA', price: '32000' },
  { sku: 'AOR-005', name: 'Aoera Hair & Body Mist 100ml', brand: 'BR-AOERA', price: '55000' },
  { sku: 'AOR-006', name: 'Aoera Hand Sanitizer Gel 60ml', brand: 'BR-AOERA', price: '18000' },

  { sku: 'YRS-001', name: 'Yors Studio Eclipse Eau de Parfum 50ml', brand: 'BR-YORS', price: '275000' },
  { sku: 'YRS-002', name: 'Yors Studio Wanderlust Eau de Parfum 50ml', brand: 'BR-YORS', price: '275000' },
  { sku: 'YRS-003', name: 'Yors Studio Neon Dreams Eau de Parfum 30ml', brand: 'BR-YORS', price: '185000' },
  { sku: 'YRS-004', name: 'Yors Studio Amber Tale Eau de Parfum 50ml', brand: 'BR-YORS', price: '299000' },
  { sku: 'YRS-005', name: 'Yors Studio Dusk Whisper Body Mist 100ml', brand: 'BR-YORS', price: '85000' },
]

const SAMPLE_ORDERS: { company: string; customer: string; notes: string; lines: [string, string][] }[] = [
  {
    company: 'SGI',
    customer: 'PT Cantik Distribusi Nusantara',
    notes: 'Seed sample order -- modern-trade distributor restock, ready for reviewer to partially deliver, invoice, and pay.',
    lines: [
      ['CRU-001', '20'],
      ['AOR-001', '50'],
      ['YRS-001', '15'],
    ],
  },
  {
    company: 'CRS',
    customer: 'Toko Kosmetik Sukses Mandiri',
    notes: 'Seed sample order -- offline retail store order.',
    lines: [
      ['AOR-003', '30'],
      ['AOR-005', '20'],
    ],
  },
  {
    company: 'AOR',
    customer: 'PT Mitra Retail Nusantara',
    notes: 'Seed sample order -- branch order for a national retail chain.',
    lines: [
      ['CRU-004', '100'],
      ['YRS-004', '80'],
    ],
  },
  {
    company: 'YRS',
    customer: 'PT Griya Kemasan Cantik',
    notes: 'Seed sample order -- bulk wholesale branch order.',
    lines: [['AOR-004', '200']],
  },
]

export function buildSeed(): MockDb {
  const db = emptyDb()
  const now = nowIso()
  const ts = { created_at: now, updated_at: now }

  const group = insert(db, 'companies', { code: 'SGI', name: 'PT Sant Group Indonesia', parent_id: null, ...ts })
  for (const b of BRANCHES) insert(db, 'companies', { ...b, parent_id: group.id, ...ts })

  const brandIds = new Map<string, number>()
  for (const b of BRANDS) brandIds.set(b.code, insert(db, 'brands', { ...b, ...ts }).id)

  for (const p of PRODUCTS) {
    insert(db, 'products', {
      brand_id: brandIds.get(p.brand)!,
      sku: p.sku,
      name: p.name,
      uom: 'PCS',
      unit_price: p.price,
      is_active: true,
      ...ts,
    })
  }

  for (const c of db.companies) {
    for (const p of db.products) {
      insert(db, 'stocks', { company_id: c.id, product_id: p.id, quantity_on_hand: '500', updated_at: now })
    }
  }

  // Order dates are today (UTC) minus 4..1 days, already submitted on that date.
  const todayUtc = Math.floor(Date.now() / 86_400_000) * 86_400_000
  SAMPLE_ORDERS.forEach((def, i) => {
    const company = db.companies.find((c) => c.code === def.company)!
    const orderDate = new Date(todayUtc - (SAMPLE_ORDERS.length - i) * 86_400_000).toISOString()
    let total = ZERO
    const lines = def.lines.map(([sku, qty]) => {
      const product = db.products.find((p) => p.sku === sku)!
      total += mulDec(dec(qty), dec(product.unit_price))
      return { product, qty }
    })
    const so = insert(db, 'salesOrders', {
      company_id: company.id,
      order_no: nextDocNumber(db, company.id, 'SO'),
      customer_name: def.customer,
      order_date: orderDate.replace('.000Z', 'Z'),
      document_status: 'ACTIVE',
      total_amount: formatDec(roundDec(total, 2)),
      notes: def.notes,
      created_by: '',
      submitted_at: orderDate,
      ...ts,
    })
    lines.forEach(({ product, qty }, lineNo) => {
      insert(db, 'salesOrderItems', {
        sales_order_id: so.id,
        line_no: lineNo + 1,
        product_id: product.id,
        qty_ordered: qty,
        unit_price: product.unit_price,
        created_at: now,
      })
    })
  })

  return db
}
