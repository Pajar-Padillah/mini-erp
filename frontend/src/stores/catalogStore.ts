import { defineStore } from 'pinia'
import { catalogApi } from '../api/catalogApi'
import type { Brand, Product, Stock } from '../types/common'

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    products: [] as Product[],
    brands: [] as Brand[],
    stocks: [] as Stock[],
    loaded: false,
  }),
  actions: {
    async loadProducts() {
      if (this.loaded) return
      const [products, brands] = await Promise.all([catalogApi.listProducts(), catalogApi.listBrands()])
      this.products = products
      this.brands = brands
      this.loaded = true
    },
    async loadStocks() {
      this.stocks = await catalogApi.listStocks()
    },
    productName(id: number): string {
      return this.products.find((p) => p.id === id)?.name ?? `#${id}`
    },
  },
})
