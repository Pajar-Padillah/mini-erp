import axios from 'axios'
import { useCompanyStore } from '../stores/companyStore'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
})

apiClient.interceptors.request.use((config) => {
  const companyStore = useCompanyStore()
  if (companyStore.selectedCompanyId) {
    config.headers['X-Company-ID'] = String(companyStore.selectedCompanyId)
  }
  return config
})

export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined
    if (data?.error) return data.error
    return err.message
  }
  return String(err)
}
