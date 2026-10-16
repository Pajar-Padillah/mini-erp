// Access control (users, groups & permissions) – client-side mockup.
// Ported from the "Sant Group WMS" prototype: a group holds a permission tree
// module → menu item → actions; a user belongs to one group. The Administrator group is
// locked and always has every permission. Menu keys outside PERM_TREE are not controlled
// (can() returns true) so the rest of the ERP keeps working unchanged.
// "Act as" lets the mockup simulate another user's permissions. State persists in localStorage.
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAuthStore } from './authStore'

const STORAGE_KEY = 'mini-erp.access.v1'

// ---------------------------------------------------------------- permission tree
export type PermAct = 'view' | 'create' | 'edit' | 'delete' | 'import' | 'execute'
export const PERM_ACTS: PermAct[] = ['view', 'create', 'edit', 'delete', 'import', 'execute']
export const PERM_ACT_LABELS: Record<PermAct, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  import: 'Import',
  execute: 'Execute',
}

export interface PermItem {
  key: string // menu key
  label: string
  hint?: string // what the actions mean for this item
  acts: PermAct[]
}
export interface PermModule {
  key: string
  label: string
  items: PermItem[]
}

export const PERM_TREE: PermModule[] = [
  {
    key: 'inv-warehouse',
    label: 'Inventory · Warehouse',
    items: [
      { key: 'wms-dashboard', label: 'Warehouse Dashboard (Home)', hint: 'Warehouse view on the Home dashboard', acts: ['view'] },
      { key: 'fulfillment', label: 'Fulfillment (Home)', hint: 'Fulfillment view on the Home dashboard', acts: ['view'] },
      { key: 'rack-map', label: 'Rack Map', hint: 'Bins & zones (create / edit / delete / import)', acts: ['view', 'create', 'edit', 'delete', 'import'] },
    ],
  },
  {
    key: 'inv-stock-info',
    label: 'Inventory · Stock Information',
    items: [
      { key: 'stock-balance', label: 'Stock Balance', hint: 'SKUs & categories', acts: ['view', 'create', 'edit', 'delete', 'import'] },
      { key: 'stock-movement', label: 'Stock Movement', acts: ['view'] },
      { key: 'batch-serial', label: 'Batch & Serial', acts: ['view'] },
    ],
  },
  {
    key: 'inv-operations',
    label: 'Inventory · Warehouse Operations',
    items: [
      { key: 'inbound-receiving', label: 'Inbound & Putaway', hint: 'Execute = putaway', acts: ['view', 'create', 'edit', 'delete', 'execute'] },
      { key: 'outbound-picking', label: 'Outbound Picking (FEFO)', hint: 'Execute = pick & dispatch', acts: ['view', 'create', 'delete', 'execute'] },
      { key: 'warehouse-tasks', label: 'Warehouse Tasks', hint: 'Create / cancel putaway & picking tasks', acts: ['view', 'create', 'delete'] },
      { key: 'task-scan', label: 'Mobile Scan', hint: 'Execute tasks by scanning', acts: ['view', 'execute'] },
    ],
  },
  {
    key: 'inv-transactions',
    label: 'Inventory · Stock Transactions',
    items: [
      { key: 'stock-transfer', label: 'Stock Transfer', acts: ['view', 'create'] },
      { key: 'stock-opname', label: 'Stock Opname', hint: 'Edit = count & approve differences', acts: ['view', 'create', 'edit'] },
      { key: 'stock-adjustment', label: 'Stock Adjustment', acts: ['view', 'create'] },
    ],
  },
  {
    key: 'inv-setup',
    label: 'Inventory · Warehouse Setup',
    items: [
      { key: 'wms-contacts', label: 'Suppliers & Customers', acts: ['view', 'create', 'edit', 'delete'] },
    ],
  },
  {
    key: 'administration',
    label: 'Administration',
    items: [{ key: 'users-roles', label: 'Users & Roles', hint: 'Users, groups & permissions', acts: ['view', 'create', 'edit', 'delete'] }],
  },
]

export const PERM_ITEMS: (PermItem & { module: string })[] = PERM_TREE.flatMap((m) => m.items.map((it) => ({ ...it, module: m.key })))
const PERM_ITEM_MAP = new Map(PERM_ITEMS.map((it) => [it.key, it]))
export function permItem(key: string) {
  return PERM_ITEM_MAP.get(key)
}

// ---------------------------------------------------------------- types
export type PermSet = Record<string, Partial<Record<PermAct, boolean>>>
export interface AccessGroup {
  id: string
  name: string
  desc: string
  locked?: boolean // Administrator: cannot be edited / deleted, always full access
  perms: PermSet
}
export interface AccessUser {
  id: string
  name: string
  username: string
  email: string
  groupId: string
  active: boolean
  lastLogin: string // ISO date or '-'
}
export interface AccessResult {
  ok: boolean
  msg: string
}

export const ADMIN_GROUP_ID = 'admin'

/** Builds a permission set; `pick(item, act)` decides each supported act (default: all granted). */
export function buildPerms(pick: (it: PermItem, act: PermAct) => boolean = () => true): PermSet {
  const out: PermSet = {}
  for (const it of PERM_ITEMS) {
    out[it.key] = {}
    for (const a of it.acts) out[it.key][a] = pick(it, a)
  }
  return out
}

/** Keeps a group's perms consistent with PERM_TREE: unknown acts dropped, no act without view. */
function normalizeGroup(g: AccessGroup): AccessGroup {
  if (g.id === ADMIN_GROUP_ID) {
    g.locked = true
    g.perms = buildPerms()
    return g
  }
  const src = g.perms ?? {}
  g.perms = buildPerms((it, a) => !!src[it.key]?.[a])
  for (const it of PERM_ITEMS) {
    const p = g.perms[it.key]
    if (!p.view) for (const a of it.acts) p[a] = false
  }
  return g
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const INVENTORY_KEYS = new Set(PERM_ITEMS.filter((it) => it.module !== 'administration').map((it) => it.key))

function seedGroups(): AccessGroup[] {
  return [
    { id: ADMIN_GROUP_ID, name: 'Administrator', desc: 'Full access, including users & permissions', locked: true, perms: buildPerms() },
    {
      id: 'wh-manager',
      name: 'Warehouse Manager',
      desc: 'All inventory menus & actions; can see users but not change them',
      perms: buildPerms((it, a) => INVENTORY_KEYS.has(it.key) || (it.key === 'users-roles' && a === 'view')),
    },
    {
      id: 'wh-admin',
      name: 'Warehouse Admin',
      desc: 'Creates & edits warehouse documents, executes operations; no delete',
      perms: buildPerms((it, a) => INVENTORY_KEYS.has(it.key) && a !== 'delete' && !(it.key === 'stock-opname' && a === 'edit')),
    },
    {
      id: 'helper',
      name: 'Helper / Picker',
      desc: 'Executes putaway & picking tasks with the mobile scanner',
      perms: buildPerms((it, a) => (it.key === 'task-scan') || (it.key === 'warehouse-tasks' && a === 'view')),
    },
    {
      id: 'viewer',
      name: 'Viewer',
      desc: 'Read-only access to all inventory menus',
      perms: buildPerms((it, a) => INVENTORY_KEYS.has(it.key) && a === 'view'),
    },
  ]
}

function seedUsers(): AccessUser[] {
  return [
    { id: 'u1', name: 'Pajar Padillah', username: 'pajar', email: 'pajar.padillah@example.com', groupId: ADMIN_GROUP_ID, active: true, lastLogin: daysAgo(0) },
    { id: 'u2', name: 'Budi Santoso', username: 'budi', email: 'budi.s@sant.co.id', groupId: 'wh-manager', active: true, lastLogin: daysAgo(0) },
    { id: 'u3', name: 'Andi Pratama', username: 'andi', email: 'andi.p@sant.co.id', groupId: 'wh-admin', active: true, lastLogin: daysAgo(1) },
    { id: 'u4', name: 'Rudi Hartono', username: 'rudi', email: 'rudi.h@sant.co.id', groupId: 'helper', active: true, lastLogin: daysAgo(0) },
    { id: 'u5', name: 'Sari Wulandari', username: 'sari', email: 'sari.w@sant.co.id', groupId: 'helper', active: true, lastLogin: daysAgo(2) },
    { id: 'u6', name: 'Rina Kusuma', username: 'rina', email: 'rina.k@sant.co.id', groupId: 'viewer', active: true, lastLogin: daysAgo(5) },
    { id: 'u7', name: 'Agus Setiawan', username: 'agus', email: 'agus.s@sant.co.id', groupId: 'helper', active: false, lastLogin: daysAgo(40) },
  ]
}

interface Persisted {
  groups: AccessGroup[]
  users: AccessUser[]
  actAsId: string | null
}

function load(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Persisted
    if (!Array.isArray(data.groups) || !Array.isArray(data.users)) return null
    return data
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- store
export const useAccessStore = defineStore('access', () => {
  const auth = useAuthStore()
  const saved = load()

  const groups = ref<AccessGroup[]>((saved?.groups ?? seedGroups()).map(normalizeGroup))
  if (!groups.value.some((g) => g.id === ADMIN_GROUP_ID)) groups.value.unshift(seedGroups()[0])
  const users = ref<AccessUser[]>(saved?.users ?? seedUsers())
  const actAsId = ref<string | null>(saved?.actAsId ?? null)

  watch(
    [groups, users, actAsId],
    () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ groups: groups.value, users: users.value, actAsId: actAsId.value }))
      } catch {
        // ignore storage failures
      }
    },
    { deep: true },
  )

  function group(id: string) {
    return groups.value.find((g) => g.id === id)
  }
  function user(id: string) {
    return users.value.find((u) => u.id === id)
  }
  function usersInGroup(groupId: string) {
    return users.value.filter((u) => u.groupId === groupId)
  }

  /** The logged-in user as found in the access list (by email, then by name). */
  const loggedInUser = computed<AccessUser | undefined>(() => {
    const a = auth.user
    if (!a) return undefined
    const email = a.email?.trim().toLowerCase()
    const name = a.name?.trim().toLowerCase()
    return (
      (email ? users.value.find((u) => u.email.toLowerCase() === email) : undefined) ??
      (name ? users.value.find((u) => u.name.toLowerCase() === name) : undefined)
    )
  })

  /** Acting user: the simulated user (act as), else the logged-in user, else the first administrator. */
  const currentUser = computed<AccessUser | undefined>(() => {
    const acting = actAsId.value ? user(actAsId.value) : undefined
    return acting ?? loggedInUser.value ?? users.value.find((u) => u.groupId === ADMIN_GROUP_ID && u.active) ?? users.value[0]
  })
  const currentGroup = computed(() => (currentUser.value ? group(currentUser.value.groupId) : undefined))
  const isSimulating = computed(() => !!actAsId.value && !!user(actAsId.value) && user(actAsId.value)?.id !== loggedInUser.value?.id)

  function setActAs(userId: string | null) {
    actAsId.value = userId && user(userId) ? userId : null
  }

  /** Permission check. Menu keys not in PERM_TREE are not access-controlled (always true). */
  function can(itemKey: string, act: PermAct = 'view'): boolean {
    const it = permItem(itemKey)
    if (!it) return true
    const u = currentUser.value
    if (!u || !u.active) return false
    const g = group(u.groupId)
    if (!g) return false
    if (g.id === ADMIN_GROUP_ID) return it.acts.includes(act)
    return !!g.perms[itemKey]?.[act]
  }
  function canView(itemKey: string) {
    return can(itemKey, 'view')
  }

  // ---------- users
  function adminCount(excludeId?: string) {
    return users.value.filter((u) => u.groupId === ADMIN_GROUP_ID && u.active && u.id !== excludeId).length
  }

  function saveUser(input: Omit<AccessUser, 'id' | 'lastLogin'> & { id?: string; lastLogin?: string }): AccessResult {
    const name = input.name.trim()
    const username = input.username.trim().toLowerCase()
    const email = input.email.trim()
    if (!name) return { ok: false, msg: 'Name is required' }
    if (!/^[a-z0-9._-]{3,}$/.test(username)) return { ok: false, msg: 'Username must be at least 3 characters (a-z, 0-9, . _ -)' }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, msg: 'Please enter a valid email' }
    if (!group(input.groupId)) return { ok: false, msg: 'Please select a group' }
    if (users.value.some((u) => u.id !== input.id && u.username.toLowerCase() === username)) return { ok: false, msg: `Username "${username}" is already used` }
    if (users.value.some((u) => u.id !== input.id && u.email.toLowerCase() === email.toLowerCase())) return { ok: false, msg: `Email ${email} is already used` }

    const existing = input.id ? user(input.id) : undefined
    if (existing) {
      const losesAdmin = existing.groupId === ADMIN_GROUP_ID && existing.active && (input.groupId !== ADMIN_GROUP_ID || !input.active)
      if (losesAdmin && adminCount(existing.id) === 0) return { ok: false, msg: 'At least one active Administrator is required' }
      Object.assign(existing, { name, username, email, groupId: input.groupId, active: input.active })
      return { ok: true, msg: `User ${name} updated` }
    }
    const id = 'u' + (Math.max(0, ...users.value.map((u) => Number(u.id.replace(/\D/g, '')) || 0)) + 1)
    users.value.push({ id, name, username, email, groupId: input.groupId, active: input.active, lastLogin: '-' })
    return { ok: true, msg: `User ${name} created` }
  }

  function setUserActive(id: string, active: boolean): AccessResult {
    const u = user(id)
    if (!u) return { ok: false, msg: 'User not found' }
    return saveUser({ ...u, active })
  }

  function deleteUser(id: string): AccessResult {
    const u = user(id)
    if (!u) return { ok: false, msg: 'User not found' }
    if (u.id === currentUser.value?.id || u.id === loggedInUser.value?.id) return { ok: false, msg: 'You cannot delete your own account' }
    if (u.groupId === ADMIN_GROUP_ID && u.active && adminCount(u.id) === 0) return { ok: false, msg: 'Cannot delete the last active Administrator' }
    users.value = users.value.filter((x) => x.id !== id)
    if (actAsId.value === id) actAsId.value = null
    return { ok: true, msg: `User ${u.name} deleted` }
  }

  // ---------- groups
  function saveGroup(input: { id?: string; name: string; desc: string; perms: PermSet }): AccessResult {
    const name = input.name.trim()
    if (!name) return { ok: false, msg: 'Group name is required' }
    if (groups.value.some((g) => g.id !== input.id && g.name.toLowerCase() === name.toLowerCase())) return { ok: false, msg: `Group "${name}" already exists` }
    const existing = input.id ? group(input.id) : undefined
    if (existing?.locked) return { ok: false, msg: 'The Administrator group is locked' }
    const perms = JSON.parse(JSON.stringify(input.perms ?? {})) as PermSet
    if (existing) {
      Object.assign(existing, normalizeGroup({ ...existing, name, desc: input.desc.trim(), perms }))
      return { ok: true, msg: `Group ${name} updated` }
    }
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group'
    let id = base
    for (let n = 2; group(id); n++) id = `${base}-${n}`
    groups.value.push(normalizeGroup({ id, name, desc: input.desc.trim(), perms }))
    return { ok: true, msg: `Group ${name} created` }
  }

  function deleteGroup(id: string): AccessResult {
    const g = group(id)
    if (!g) return { ok: false, msg: 'Group not found' }
    if (g.locked || g.id === ADMIN_GROUP_ID) return { ok: false, msg: 'The Administrator group is locked' }
    const n = usersInGroup(id).length
    if (n) return { ok: false, msg: `Cannot delete: ${n} user${n > 1 ? 's are' : ' is'} still in this group` }
    groups.value = groups.value.filter((x) => x.id !== id)
    return { ok: true, msg: `Group ${g.name} deleted` }
  }

  function resetAccess() {
    groups.value = seedGroups().map(normalizeGroup)
    users.value = seedUsers()
    actAsId.value = null
  }

  return {
    groups,
    users,
    actAsId,
    loggedInUser,
    currentUser,
    currentGroup,
    isSimulating,
    group,
    user,
    usersInGroup,
    setActAs,
    can,
    canView,
    saveUser,
    setUserActive,
    deleteUser,
    saveGroup,
    deleteGroup,
    resetAccess,
  }
})
