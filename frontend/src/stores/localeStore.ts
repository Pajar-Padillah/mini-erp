import { defineStore } from 'pinia'
import elEn from 'element-plus/es/locale/lang/en'
import elId from 'element-plus/es/locale/lang/id'
import { i18n, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, type LocaleCode } from '../i18n'

const ELEMENT_LOCALES: Record<LocaleCode, typeof elEn> = { en: elEn, id: elId }

export const useLocaleStore = defineStore('locale', {
  state: () => ({
    locale: i18n.global.locale.value as LocaleCode,
  }),
  getters: {
    elementLocale: (state) => ELEMENT_LOCALES[state.locale],
  },
  actions: {
    setLocale(code: LocaleCode) {
      if (!SUPPORTED_LOCALES.some((l) => l.code === code)) return
      this.locale = code
      i18n.global.locale.value = code
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, code)
      } catch {
        // ignore storage failures
      }
    },
  },
})
