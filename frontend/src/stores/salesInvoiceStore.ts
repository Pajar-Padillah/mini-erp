import { defineStore } from 'pinia'
import { salesInvoiceApi } from '../api/salesInvoiceApi'
import type { SalesInvoice } from '../types/salesInvoice'
import type { ListMeta } from '../types/common'

export const useSalesInvoiceStore = defineStore('salesInvoice', {
  state: () => ({
    list: [] as SalesInvoice[],
    meta: null as ListMeta | null,
    current: null as SalesInvoice | null,
    loading: false,
  }),
  actions: {
    async fetchList(params?: { status?: string; payment_status?: string; page?: number; page_size?: number }) {
      this.loading = true
      try {
        const res = await salesInvoiceApi.list(params)
        this.list = res.data
        this.meta = res.meta
      } finally {
        this.loading = false
      }
    },
    async fetchOne(id: number) {
      this.loading = true
      try {
        this.current = await salesInvoiceApi.get(id)
      } finally {
        this.loading = false
      }
    },
  },
})
