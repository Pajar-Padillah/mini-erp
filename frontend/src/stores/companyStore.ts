import { defineStore } from 'pinia'
import { catalogApi } from '../api/catalogApi'
import type { Company } from '../types/common'

export interface CompanyNode {
  company: Company
  branches: Company[]
}

const STORAGE_KEY = 'mini-erp.selectedCompanyId'

export const useCompanyStore = defineStore('company', {
  state: () => ({
    companies: [] as Company[],
    selectedCompanyId: readStoredCompanyId(),
    loaded: false,
  }),
  getters: {
    selectedCompany(state): Company | undefined {
      return state.companies.find((c) => c.id === state.selectedCompanyId)
    },
    /** Groups (and standalone companies) with their branches underneath. */
    tree(state): CompanyNode[] {
      return state.companies
        .filter((c) => c.parent_id == null)
        .map((company) => ({ company, branches: state.companies.filter((c) => c.parent_id === company.id) }))
    },
    /** True when the selected company has branches, i.e. lists include all of their data. */
    isGroupSelected(state): boolean {
      return state.companies.some((c) => c.parent_id != null && c.parent_id === state.selectedCompanyId)
    },
  },
  actions: {
    async loadCompanies() {
      if (this.loaded) return
      this.companies = await catalogApi.listCompanies()
      this.loaded = true
      // Also recover when the stored company no longer exists (e.g. it was removed).
      const stillExists = this.companies.some((c) => c.id === this.selectedCompanyId)
      if ((!this.selectedCompanyId || !stillExists) && this.companies.length > 0) {
        this.selectCompany(this.companies[0].id)
      }
    },
    companyName(id: number): string {
      return this.companies.find((c) => c.id === id)?.name ?? `#${id}`
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
