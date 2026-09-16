import { defineStore } from 'pinia'
import { salesPaymentApi } from '../api/salesPaymentApi'
import type { SalesPayment } from '../types/salesPayment'
import type { ListMeta } from '../types/common'

export const useSalesPaymentStore = defineStore('salesPayment', {
  state: () => ({
    list: [] as SalesPayment[],
    meta: null as ListMeta | null,
    current: null as SalesPayment | null,
    loading: false,
  }),
  actions: {
    async fetchList(params?: { status?: string; page?: number; page_size?: number }) {
      this.loading = true
      try {
        const res = await salesPaymentApi.list(params)
        this.list = res.data
        this.meta = res.meta
      } finally {
        this.loading = false
      }
    },
    async fetchOne(id: number) {
      this.loading = true
      try {
        this.current = await salesPaymentApi.get(id)
      } finally {
        this.loading = false
      }
    },
  },
})
