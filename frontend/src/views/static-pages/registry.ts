import type { StaticPageConfig } from './types'

// Every file in ./data exports one Record<key, StaticPageConfig>; merge them all.
const modules = import.meta.glob<Record<string, Record<string, StaticPageConfig>>>('./data/*.ts', { eager: true })

export const STATIC_PAGES: Record<string, StaticPageConfig> = Object.assign(
  {},
  ...Object.values(modules).flatMap((mod) => Object.values(mod)),
)
