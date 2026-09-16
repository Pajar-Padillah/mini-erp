import { defineStore } from 'pinia'
import { catalogApi } from '../api/catalogApi'
import type { Company } from '../types/common'

const STORAGE_KEY = 'mini-erp.selectedCompanyId'

export const useCompanyStore = defineStore('company', {
  state: () => ({
    companies: [] as Company[],
    selectedCompanyId: readStoredCompanyId(),
    loaded: false,
  }),
  actions: {
    async loadCompanies() {
      if (this.loaded) return
      this.companies = await catalogApi.listCompanies()
      this.loaded = true
      if (!this.selectedCompanyId && this.companies.length > 0) {
        this.selectCompany(this.companies[0].id)
      }
    },
    selectCompany(id: number) {
      this.selectedCompanyId = id
      try {
        localStorage.setItem(STORAGE_KEY, String(id))
      } catch {
        // ignore storage failures
      }
    },
  },
})

function readStoredCompanyId(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? Number(raw) : null
  } catch {
    return null
  }
}
