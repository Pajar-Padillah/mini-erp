// Apps group the sidebar modules; the sidebar shows one app at a time and the user switches between them.
import type { Component } from 'vue'
import { Briefcase, Monitor, UserFilled } from '@element-plus/icons-vue'
import type { MenuColor } from './menu'

export type AppKey = 'erp' | 'hris' | 'cms'

export interface AppDef {
  key: AppKey
  title: string
  icon: Component
  color: MenuColor
  /** Module keys from MENU_MODULES; `null` = every module not claimed by another app. */
  modules: string[] | null
  /** Whether the app shows the Home dashboard entry. */
  home: boolean
}

export const APPS: AppDef[] = [
  { key: 'erp', title: 'ERP', icon: Briefcase, color: 'blue', modules: null, home: true },
  { key: 'hris', title: 'HRIS', icon: UserFilled, color: 'green', modules: ['hr'], home: false },
  { key: 'cms', title: 'CMS', icon: Monitor, color: 'amber', modules: ['administration'], home: false },
]

const CLAIMED = new Set(APPS.flatMap((app) => app.modules ?? []))

export function appOwnsModule(app: AppDef, moduleKey: string): boolean {
  return app.modules ? app.modules.includes(moduleKey) : !CLAIMED.has(moduleKey)
}

export function appForModule(moduleKey: string): AppDef {
  return APPS.find((app) => appOwnsModule(app, moduleKey)) ?? APPS[0]
}
