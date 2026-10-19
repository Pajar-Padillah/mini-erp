import { currentCompanyId, mockRequest } from './client'
import { byId, readDb, scopeIds, type MockDb, type ProductRow } from './mockDb'
import type { Brand, Company, Product, Stock } from '../types/common'

/** A product as preloaded on document lines (no brand). */
export function productOf(db: MockDb, productId: number): ProductRow | undefined {
  return db.products.find((p) => p.id === productId)
}

export const catalogApi = {
  async listCompanies(): Promise<Company[]> {
    return mockRequest(() => readDb((db) => [...db.companies].sort(byId)))
  },
  async listBrands(): Promise<Brand[]> {
    return mockRequest(() => readDb((db) => [...db.brands].sort(byId)))
  },
  async listProducts(): Promise<Product[]> {
    return mockRequest(() =>
      readDb((db) => [...db.products].sort(byId).map((p) => ({ ...p, brand: db.brands.find((b) => b.id === p.brand_id) }))),
    )
  },
  /** Unlike documents, stocks are unscoped (all companies) when no company is selected. */
  async listStocks(): Promise<Stock[]> {
    const companyId = currentCompanyId()
    return mockRequest(() =>
      readDb((db) => {
        const scope = companyId ? scopeIds(db, companyId) : null
        return db.stocks
          .filter((s) => !scope || scope.has(s.company_id))
          .sort((a, b) => a.product_id - b.product_id || a.id - b.id)
          .map((s) => {
            const product = productOf(db, s.product_id)
            return { ...s, product: product && { ...product, brand: db.brands.find((b) => b.id === product.brand_id) } }
          })
      }),
    )
  },
}
