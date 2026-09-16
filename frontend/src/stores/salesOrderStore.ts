import { defineStore } from 'pinia'
import { salesOrderApi } from '../api/salesOrderApi'
import type { SalesOrder } from '../types/salesOrder'
import type { ListMeta } from '../types/common'

export const useSalesOrderStore = defineStore('salesOrder', {
  state: () => ({
    list: [] as SalesOrder[],
    meta: null as ListMeta | null,
    current: null as SalesOrder | null,
    loading: false,
  }),
  actions: {
    async fetchList(params?: { status?: string; page?: number; page_size?: number }) {
      this.loading = true
      try {
        const res = await salesOrderApi.list(params)
        this.list = res.data
        this.meta = res.meta
      } finally {
        this.loading = false
      }
    },
    async fetchOne(id: number) {
      this.loading = true
      try {
        this.current = await salesOrderApi.get(id)
      } finally {
        this.loading = false
      }
    },
  },
})
