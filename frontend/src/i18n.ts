import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import id from './locales/id.json'

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'id', label: 'Bahasa Indonesia' },
] as const

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code']

export const LOCALE_STORAGE_KEY = 'mini-erp.locale'
const DEFAULT_LOCALE: LocaleCode = 'en'

export function readStoredLocale(): LocaleCode {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (SUPPORTED_LOCALES.some((l) => l.code === raw)) return raw as LocaleCode
  } catch {
    // ignore storage failures
  }
  return DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: readStoredLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { en, id },
})
