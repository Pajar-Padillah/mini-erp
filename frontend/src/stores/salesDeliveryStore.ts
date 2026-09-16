import { defineStore } from 'pinia'
import { salesDeliveryApi } from '../api/salesDeliveryApi'
import type { SalesDelivery } from '../types/salesDelivery'
import type { ListMeta } from '../types/common'

export const useSalesDeliveryStore = defineStore('salesDelivery', {
  state: () => ({
    list: [] as SalesDelivery[],
    meta: null as ListMeta | null,
    current: null as SalesDelivery | null,
    loading: false,
  }),
  actions: {
    async fetchList(params?: { status?: string; sales_order_id?: number; page?: number; page_size?: number }) {
      this.loading = true
      try {
        const res = await salesDeliveryApi.list(params)
        this.list = res.data
        this.meta = res.meta
      } finally {
        this.loading = false
      }
    },
    async fetchOne(id: number) {
      this.loading = true
      try {
        this.current = await salesDeliveryApi.get(id)
      } finally {
        this.loading = false
      }
    },
  },
})
