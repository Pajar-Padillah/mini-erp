import { defineStore } from 'pinia'

// Static mockup auth: no backend call, any email + password signs in.
// "Remember me" keeps the session in localStorage, otherwise only for this browser tab.
const STORAGE_KEY = 'mini-erp.auth'

export interface AuthUser {
  name: string
  email: string
}

function readStoredUser(): AuthUser | null {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const raw = storage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw) as AuthUser
    } catch {
      // ignore storage failures
    }
  }
  return null
}

function clearStoredUser() {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      storage.removeItem(STORAGE_KEY)
    } catch {
      // ignore storage failures
    }
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: readStoredUser(),
  }),
  getters: {
    isLoggedIn: (state) => state.user !== null,
  },
  actions: {
    async login(email: string, _password: string, remember: boolean) {
      // Simulate a network round-trip so the button's loading state is visible.
      await new Promise((resolve) => setTimeout(resolve, 600))
      this.user = { name: 'Pajar Padillah', email: email.trim() }
      clearStoredUser()
      try {
        ;(remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(this.user))
      } catch {
        // ignore storage failures
      }
    },
    logout() {
      this.user = null
      clearStoredUser()
    },
  },
})
