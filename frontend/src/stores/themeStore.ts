import { defineStore } from 'pinia'
import { shade, tint, toRgba } from '../utils/color'

const THEME_STORAGE_KEY = 'mini-erp.theme'
const MODE_STORAGE_KEY = 'mini-erp.colorMode'

export type ColorMode = 'light' | 'dark'

export interface ThemePreset {
  key: string
  label: string
  color: string
}

export const THEME_PRESETS: ThemePreset[] = [
  { key: 'indigo', label: 'Indigo', color: '#4f46e5' },
  { key: 'blue', label: 'Blue', color: '#2563eb' },
  { key: 'teal', label: 'Teal', color: '#0d9488' },
  { key: 'green', label: 'Green', color: '#16a34a' },
  { key: 'orange', label: 'Orange', color: '#ea580c' },
  { key: 'red', label: 'Red', color: '#dc2626' },
  { key: 'pink', label: 'Pink', color: '#db2777' },
  { key: 'purple', label: 'Purple', color: '#9333ea' },
]

const DEFAULT_THEME = THEME_PRESETS[0].key

export const useThemeStore = defineStore('theme', {
  state: () => ({
    theme: readStoredTheme(),
    mode: readStoredMode(),
  }),
  actions: {
    setTheme(key: string) {
      if (!THEME_PRESETS.some((t) => t.key === key)) return
      this.theme = key
      try {
        localStorage.setItem(THEME_STORAGE_KEY, key)
      } catch {
        // ignore storage failures
      }
      this.applyTheme()
    },
    setMode(mode: ColorMode) {
      this.mode = mode
      try {
        localStorage.setItem(MODE_STORAGE_KEY, mode)
      } catch {
        // ignore storage failures
      }
      this.applyTheme()
    },
    toggleMode() {
      this.setMode(this.mode === 'dark' ? 'light' : 'dark')
    },
    applyTheme() {
      const preset = THEME_PRESETS.find((t) => t.key === this.theme) ?? THEME_PRESETS[0]
      const brand = preset.color
      const isDark = this.mode === 'dark'
      const root = document.documentElement

      root.classList.toggle('dark', isDark)

      const style = root.style
      style.setProperty('--brand', brand)

      if (isDark) {
        style.setProperty('--brand-dark', tint(brand, 0.2))
        style.setProperty('--brand-light', toRgba(brand, 0.16))
        style.setProperty('--brand-light-2', toRgba(brand, 0.26))

        style.setProperty('--el-color-primary-light-3', shade(brand, 0.3))
        style.setProperty('--el-color-primary-light-5', shade(brand, 0.5))
        style.setProperty('--el-color-primary-light-7', shade(brand, 0.7))
        style.setProperty('--el-color-primary-light-8', shade(brand, 0.8))
        style.setProperty('--el-color-primary-light-9', shade(brand, 0.9))
        style.setProperty('--el-color-primary-dark-2', tint(brand, 0.2))
      } else {
        style.setProperty('--brand-dark', shade(brand, 0.2))
        style.setProperty('--brand-light', tint(brand, 0.9))
        style.setProperty('--brand-light-2', tint(brand, 0.85))

        style.setProperty('--el-color-primary-light-3', tint(brand, 0.3))
        style.setProperty('--el-color-primary-light-5', tint(brand, 0.5))
        style.setProperty('--el-color-primary-light-7', tint(brand, 0.7))
        style.setProperty('--el-color-primary-light-8', tint(brand, 0.8))
        style.setProperty('--el-color-primary-light-9', tint(brand, 0.9))
        style.setProperty('--el-color-primary-dark-2', shade(brand, 0.2))
      }
      style.setProperty('--el-color-primary', brand)
    },
  },
})

function readStoredTheme(): string {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    return raw && THEME_PRESETS.some((t) => t.key === raw) ? raw : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function readStoredMode(): ColorMode {
  try {
    const raw = localStorage.getItem(MODE_STORAGE_KEY)
    if (raw === 'light' || raw === 'dark') return raw
  } catch {
    // ignore storage failures
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
