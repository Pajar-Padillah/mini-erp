<script setup lang="ts">
// Users & Roles: users (one group each) and groups with a permission matrix
// (module → menu item → actions). Includes a "Simulate as" bar so the mockup can
// show menus & actions as another user would see them.
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Lock, Plus, RefreshLeft, UserFilled } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import AccessDenied from '../../components/AccessDenied.vue'
import TransactionFilterBar, { type TransactionFilterState } from '../../components/TransactionFilterBar.vue'
import { matchesTransactionValue } from '../../utils/transactionFilters'
import {
  ADMIN_GROUP_ID,
  PERM_ACTS,
  PERM_ACT_LABELS,
  PERM_ITEMS,
  PERM_TREE,
  buildPerms,
  useAccessStore,
  type AccessGroup,
  type AccessUser,
  type PermAct,
  type PermItem,
  type PermModule,
  type PermSet,
} from '../../stores/accessStore'

const access = useAccessStore()
const tab = ref<'users' | 'groups'>('users')

const canViewPage = computed(() => access.canView('users-roles'))
const canCreate = computed(() => access.can('users-roles', 'create'))
const canEdit = computed(() => access.can('users-roles', 'edit'))
const canDelete = computed(() => access.can('users-roles', 'delete'))

// ---------- helpers
const PILL_COLORS = ['blue', 'amber', 'green', 'gray']
function groupColor(id: string) {
  if (id === ADMIN_GROUP_ID) return 'red'
  const i = access.groups.findIndex((g) => g.id === id)
  return PILL_COLORS[(Math.max(i, 1) - 1) % PILL_COLORS.length]
}
function groupName(id: string) {
  return access.group(id)?.name ?? '-'
}
function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}
function fmtDate(d: string) {
  if (!d || d === '-') return '-'
  const date = new Date(d)
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ---------- simulate as
const simulateId = computed<string>({
  get: () => access.currentUser?.id ?? '',
  set: (v) => access.setActAs(v && v !== access.loggedInUser?.id ? v : null),
})
async function resetDemo() {
  try {
    await ElMessageBox.confirm('Restore the demo users, groups and permissions? Your changes will be lost.', 'Reset access data', {
      confirmButtonText: 'Reset',
      cancelButtonText: 'Cancel',
      type: 'warning',
    })
    access.resetAccess()
    ElMessage.success('Access data restored')
  } catch {
    // cancelled
  }
}

// ---------- users: filters
function defaultFilters(): TransactionFilterState {
  return { dateRange: [], status: [], secondaryStatus: [], conditions: [] }
}
const filters = ref<TransactionFilterState>(defaultFilters())
const filterFields = [
  { label: 'Name', value: 'name' },
  { label: 'Username', value: 'username' },
  { label: 'Email', value: 'email' },
]
const statusOptions = [
  { label: 'Active', value: 'ACTIVE', color: 'green' },
  { label: 'Inactive', value: 'INACTIVE', color: 'gray' },
]
const groupOptions = computed(() => access.groups.map((g) => ({ label: g.name, value: g.id, color: groupColor(g.id) })))

const page = ref(1)
const pageSize = 10
const filteredUsers = computed(() => {
  const { status, secondaryStatus, conditions } = filters.value
  return access.users.filter((u) => {
    if (status.length && !status.includes(u.active ? 'ACTIVE' : 'INACTIVE')) return false
    if (secondaryStatus.length && !secondaryStatus.includes(u.groupId)) return false
    return conditions.every((c) => {
      const v = (u as unknown as Record<string, unknown>)[c.field]
      return v === undefined ? true : matchesTransactionValue(String(v), c)
    })
  })
})
const pagedUsers = computed(() => filteredUsers.value.slice((page.value - 1) * pageSize, page.value * pageSize))
watch(filters, () => { page.value = 1 }, { deep: true })

const activeCount = computed(() => access.users.filter((u) => u.active).length)

// ---------- users: dialog
type UserForm = { id?: string; name: string; username: string; email: string; groupId: string; active: boolean }
const userDialog = ref(false)
const userForm = ref<UserForm>(blankUser())
function blankUser(): UserForm {
  const def = access.groups.find((g) => g.id === 'viewer') ?? access.groups[access.groups.length - 1]
  return { name: '', username: '', email: '', groupId: def?.id ?? '', active: true }
}
function openNewUser() {
  userForm.value = blankUser()
  userDialog.value = true
}
function openEditUser(u: AccessUser) {
  userForm.value = { id: u.id, name: u.name, username: u.username, email: u.email, groupId: u.groupId, active: u.active }
  userDialog.value = true
}
// Suggest a username from the name while creating.
watch(() => userForm.value.name, (n, old) => {
  const f = userForm.value
  if (f.id) return
  const slug = (s: string) => s.trim().toLowerCase().split(/\s+/)[0]?.replace(/[^a-z0-9]/g, '') ?? ''
  if (!f.username || f.username === slug(old ?? '')) f.username = slug(n)
})
function saveUser() {
  const r = access.saveUser({ ...userForm.value })
  if (r.ok) {
    ElMessage.success(r.msg)
    userDialog.value = false
  } else ElMessage.warning(r.msg)
}
function toggleActive(u: AccessUser, v: string | number | boolean) {
  const r = access.setUserActive(u.id, !!v)
  if (r.ok) ElMessage.success(`${u.name} is now ${v ? 'active' : 'inactive'}`)
  else ElMessage.warning(r.msg)
}
async function removeUser(u: AccessUser) {
  try {
    await ElMessageBox.confirm(`Delete user ${u.name} (${u.username})?`, 'Delete user', {
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  const r = access.deleteUser(u.id)
  if (r.ok) ElMessage.success(r.msg)
  else ElMessage.warning(r.msg)
}

// ---------- groups
function grantedSummary(g: AccessGroup) {
  if (g.id === ADMIN_GROUP_ID) return { items: PERM_ITEMS.length, acts: PERM_ITEMS.reduce((a, it) => a + it.acts.length, 0) }
  let items = 0
  let acts = 0
  for (const it of PERM_ITEMS) {
    const p = g.perms[it.key] ?? {}
    if (p.view) items++
    acts += it.acts.filter((a) => p[a]).length
  }
  return { items, acts }
}
function moduleAccess(g: AccessGroup) {
  return PERM_TREE.filter((m) => m.items.some((it) => g.id === ADMIN_GROUP_ID || g.perms[it.key]?.view)).map((m) => m.label.replace('Inventory · ', ''))
}

// ---------- group dialog + permission matrix
const groupDialog = ref(false)
const groupForm = ref<{ id?: string; name: string; desc: string; locked: boolean }>({ name: '', desc: '', locked: false })
const draft = ref<PermSet>({})
const readOnlyMatrix = computed(() => groupForm.value.locked || (groupForm.value.id ? !canEdit.value : !canCreate.value))

function openNewGroup() {
  groupForm.value = { name: '', desc: '', locked: false }
  draft.value = buildPerms(() => false)
  groupDialog.value = true
}
function openGroup(g: AccessGroup) {
  groupForm.value = { id: g.id, name: g.name, desc: g.desc, locked: !!g.locked }
  draft.value = JSON.parse(JSON.stringify(g.id === ADMIN_GROUP_ID ? buildPerms() : g.perms)) as PermSet
  groupDialog.value = true
}
function duplicateGroup(g: AccessGroup) {
  groupForm.value = { name: `${g.name} (copy)`, desc: g.desc, locked: false }
  draft.value = JSON.parse(JSON.stringify(g.id === ADMIN_GROUP_ID ? buildPerms() : g.perms)) as PermSet
  groupDialog.value = true
}

function isOn(it: PermItem, a: PermAct) {
  return !!draft.value[it.key]?.[a]
}
function setAct(it: PermItem, a: PermAct, on: boolean) {
  const row = (draft.value[it.key] ??= {})
  if (a === 'view' && !on) {
    for (const x of it.acts) row[x] = false // no view → nothing else
    return
  }
  row[a] = on
  if (on && a !== 'view') row.view = true
}
type Tri = { all: boolean; some: boolean }
function tri(cells: [PermItem, PermAct][]): Tri {
  const n = cells.filter(([it, a]) => isOn(it, a)).length
  return { all: cells.length > 0 && n === cells.length, some: n > 0 && n < cells.length }
}
function setCells(cells: [PermItem, PermAct][], on: boolean) {
  // Apply view last when clearing (so it clears rows), first when granting.
  const ordered = [...cells].sort(([, a], [, b]) => (a === 'view' ? (on ? -1 : 1) : 0) - (b === 'view' ? (on ? -1 : 1) : 0))
  for (const [it, a] of ordered) setAct(it, a, on)
}
const rowCells = (it: PermItem): [PermItem, PermAct][] => it.acts.map((a) => [it, a])
const moduleCells = (m: PermModule): [PermItem, PermAct][] => m.items.flatMap(rowCells)
const columnCells = (a: PermAct): [PermItem, PermAct][] => PERM_ITEMS.filter((it) => it.acts.includes(a)).map((it) => [it, a])
const allCells = computed<[PermItem, PermAct][]>(() => PERM_ITEMS.flatMap(rowCells))
// Clearing a whole "view" column also clears every row; clearing another column leaves view alone.
function setColumn(a: PermAct, on: boolean) {
  setCells(columnCells(a), on)
}

const draftSummary = computed(() => {
  const items = PERM_ITEMS.filter((it) => isOn(it, 'view')).length
  const acts = allCells.value.filter(([it, a]) => isOn(it, a)).length
  return `${items} of ${PERM_ITEMS.length} menus · ${acts} of ${allCells.value.length} permissions`
})

function saveGroup() {
  const r = access.saveGroup({ id: groupForm.value.id, name: groupForm.value.name, desc: groupForm.value.desc, perms: draft.value })
  if (r.ok) {
    ElMessage.success(r.msg)
    groupDialog.value = false
  } else ElMessage.warning(r.msg)
}
async function removeGroup(g: AccessGroup) {
  try {
    await ElMessageBox.confirm(`Delete group ${g.name}?`, 'Delete group', {
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  const r = access.deleteGroup(g.id)
  if (r.ok) ElMessage.success(r.msg)
  else ElMessage.warning(r.msg)
}
</script>

<template>
  <div class="page">
    <PageHeader title="Users & Roles" subtitle="Users, groups and menu / action permissions for the Inventory module">
      <template v-if="canViewPage" #actions>
        <el-button :icon="RefreshLeft" @click="resetDemo">Reset demo data</el-button>
        <el-button v-if="tab === 'users' && canCreate" type="primary" :icon="Plus" @click="openNewUser">New User</el-button>
        <el-button v-if="tab === 'groups' && canCreate" type="primary" :icon="Plus" @click="openNewGroup">New Group</el-button>
      </template>
    </PageHeader>

    <!-- Simulate as -->
    <div class="sim-bar" :class="{ on: access.isSimulating }">
      <el-icon class="sim-icon"><UserFilled /></el-icon>
      <div class="sim-label">
        <b>Simulate as</b>
        <span>Mockup: menu &amp; actions follow the selected user's permissions</span>
      </div>
      <el-select v-model="simulateId" class="sim-select" filterable>
        <el-option v-for="u in access.users" :key="u.id" :value="u.id" :label="u.name" :disabled="!u.active">
          <span>{{ u.name }}</span>
          <span class="sim-opt-group">{{ groupName(u.groupId) }}{{ u.active ? '' : ' · inactive' }}</span>
        </el-option>
      </el-select>
      <span class="status-pill" :class="groupColor(access.currentUser?.groupId ?? '')">{{ access.currentGroup?.name ?? '-' }}</span>
      <el-button :disabled="!access.isSimulating" @click="access.setActAs(null)">Reset</el-button>
    </div>

    <AccessDenied v-if="!canViewPage" item-key="users-roles" />

    <div v-else class="card">
      <el-tabs v-model="tab" class="ur-tabs">
        <!-- ================= USERS ================= -->
        <el-tab-pane name="users">
          <template #label>Users <span class="ur-count">{{ access.users.length }}</span></template>

          <TransactionFilterBar
            v-model="filters"
            :fields="filterFields"
            :statuses="statusOptions"
            :secondary-statuses="groupOptions"
            secondary-status-label="Group"
            hide-date
            @reset="filters = defaultFilters()"
            @refresh="() => {}"
          />

          <div class="ur-summary"><b>{{ access.users.length }}</b> users · <b>{{ activeCount }}</b> active</div>

          <el-table :data="pagedUsers" row-key="id">
            <el-table-column label="Name" min-width="220">
              <template #default="{ row }">
                <div class="ur-user">
                  <span class="ur-avatar" :class="groupColor(row.groupId)">{{ initials(row.name) }}</span>
                  <div>
                    <div class="ur-name">
                      {{ row.name }}
                      <span v-if="row.id === access.loggedInUser?.id" class="ur-you">You</span>
                      <span v-if="row.id === access.currentUser?.id && access.isSimulating" class="ur-you sim">Acting</span>
                    </div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="Username" min-width="120">
              <template #default="{ row }"><span class="mono">{{ row.username }}</span></template>
            </el-table-column>
            <el-table-column label="Email" prop="email" min-width="220" />
            <el-table-column label="Group" min-width="160">
              <template #default="{ row }">
                <span class="status-pill" :class="groupColor(row.groupId)">{{ groupName(row.groupId) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Active" width="90" align="center">
              <template #default="{ row }">
                <el-switch :model-value="row.active" :disabled="!canEdit" @change="(v: string | number | boolean) => toggleActive(row, v)" />
              </template>
            </el-table-column>
            <el-table-column label="Last Login" width="130">
              <template #default="{ row }">{{ fmtDate(row.lastLogin) }}</template>
            </el-table-column>
            <el-table-column v-if="canEdit || canDelete" label="" width="100" align="right">
              <template #default="{ row }">
                <el-button v-if="canEdit" link type="primary" :icon="Edit" @click="openEditUser(row)" />
                <el-button v-if="canDelete" link type="danger" :icon="Delete" @click="removeUser(row)" />
              </template>
            </el-table-column>
            <template #empty>No users match the filter.</template>
          </el-table>
          <PaginationBar v-model:page="page" :page-size="pageSize" :total="filteredUsers.length" />
        </el-tab-pane>

        <!-- ================= GROUPS ================= -->
        <el-tab-pane name="groups">
          <template #label>Groups &amp; Permissions <span class="ur-count">{{ access.groups.length }}</span></template>

          <div class="gr-grid">
            <div v-for="g in access.groups" :key="g.id" class="gr-card" :class="{ acting: access.currentGroup?.id === g.id }">
              <div class="gr-head">
                <span class="status-pill" :class="groupColor(g.id)">{{ g.name }}</span>
                <el-icon v-if="g.locked" class="gr-lock" title="Locked: always full access"><Lock /></el-icon>
              </div>
              <div class="gr-desc">{{ g.desc || '—' }}</div>
              <div class="gr-stats">
                <div><b>{{ access.usersInGroup(g.id).length }}</b><span>users</span></div>
                <div><b>{{ grantedSummary(g).items }}</b><span>menus</span></div>
                <div><b>{{ grantedSummary(g).acts }}</b><span>permissions</span></div>
              </div>
              <div class="gr-mods">
                <span v-for="m in moduleAccess(g)" :key="m" class="gr-mod">{{ m }}</span>
                <span v-if="!moduleAccess(g).length" class="gr-mod none">No access</span>
              </div>
              <div class="gr-users">
                <span v-for="u in access.usersInGroup(g.id).slice(0, 5)" :key="u.id" class="ur-avatar sm" :class="groupColor(g.id)" :title="u.name">{{ initials(u.name) }}</span>
                <span v-if="access.usersInGroup(g.id).length > 5" class="gr-more">+{{ access.usersInGroup(g.id).length - 5 }}</span>
              </div>
              <div class="gr-actions">
                <el-button size="small" @click="openGroup(g)">{{ g.locked || !canEdit ? 'View permissions' : 'Edit permissions' }}</el-button>
                <el-button v-if="canCreate" size="small" link @click="duplicateGroup(g)">Duplicate</el-button>
                <el-button v-if="canDelete && !g.locked" size="small" link type="danger" @click="removeGroup(g)">Delete</el-button>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- User dialog -->
    <el-dialog v-model="userDialog" :title="userForm.id ? 'Edit User' : 'New User'" width="520px" destroy-on-close>
      <el-form label-position="top" @submit.prevent="saveUser">
        <el-form-item label="Full name" required>
          <el-input v-model="userForm.name" placeholder="e.g. Rudi Hartono" />
        </el-form-item>
        <div class="ur-form-row">
          <el-form-item label="Username" required>
            <el-input v-model="userForm.username" placeholder="e.g. rudi" />
          </el-form-item>
          <el-form-item label="Email" required>
            <el-input v-model="userForm.email" placeholder="name@sant.co.id" />
          </el-form-item>
        </div>
        <el-form-item label="Group" required>
          <el-select v-model="userForm.groupId" style="width: 100%">
            <el-option v-for="g in access.groups" :key="g.id" :label="g.name" :value="g.id">
              <span>{{ g.name }}</span>
              <span class="sim-opt-group">{{ g.desc }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="Status">
          <el-switch v-model="userForm.active" active-text="Active" inactive-text="Inactive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userDialog = false">Cancel</el-button>
        <el-button type="primary" @click="saveUser">{{ userForm.id ? 'Save changes' : 'Create user' }}</el-button>
      </template>
    </el-dialog>

    <!-- Group dialog with permission matrix -->
    <el-dialog
      v-model="groupDialog"
      :title="groupForm.id ? (readOnlyMatrix ? 'Group Permissions' : 'Edit Group') : 'New Group'"
      width="980px"
      top="5vh"
      destroy-on-close
    >
      <div class="ur-form-row">
        <el-form label-position="top" class="gr-form">
          <el-form-item label="Group name" required>
            <el-input v-model="groupForm.name" :disabled="readOnlyMatrix" placeholder="e.g. Inbound Operator" />
          </el-form-item>
        </el-form>
        <el-form label-position="top" class="gr-form">
          <el-form-item label="Description">
            <el-input v-model="groupForm.desc" :disabled="readOnlyMatrix" placeholder="What this group does" />
          </el-form-item>
        </el-form>
      </div>

      <div v-if="groupForm.locked" class="gr-note"><el-icon><Lock /></el-icon> The Administrator group is locked and always has every permission.</div>

      <div class="pm-toolbar">
        <span class="pm-summary">{{ draftSummary }}</span>
        <el-checkbox
          v-if="!readOnlyMatrix"
          :model-value="tri(allCells).all"
          :indeterminate="tri(allCells).some"
          @change="(v: string | number | boolean) => setCells(allCells, !!v)"
        >Select all</el-checkbox>
      </div>

      <div class="pm-wrap">
        <table class="pm">
          <thead>
            <tr>
              <th class="pm-item">Menu</th>
              <th v-for="a in PERM_ACTS" :key="a" class="pm-act">
                <div>{{ PERM_ACT_LABELS[a] }}</div>
                <el-checkbox
                  :model-value="tri(columnCells(a)).all"
                  :indeterminate="tri(columnCells(a)).some"
                  :disabled="readOnlyMatrix"
                  @change="(v: string | number | boolean) => setColumn(a, !!v)"
                />
              </th>
              <th class="pm-act">All</th>
            </tr>
          </thead>
          <tbody v-for="m in PERM_TREE" :key="m.key">
            <tr class="pm-module">
              <td :colspan="PERM_ACTS.length + 1">{{ m.label }}</td>
              <td class="pm-cell">
                <el-checkbox
                  :model-value="tri(moduleCells(m)).all"
                  :indeterminate="tri(moduleCells(m)).some"
                  :disabled="readOnlyMatrix"
                  @change="(v: string | number | boolean) => setCells(moduleCells(m), !!v)"
                />
              </td>
            </tr>
            <tr v-for="it in m.items" :key="it.key" :class="{ off: !isOn(it, 'view') }">
              <td class="pm-item">
                <div class="pm-label">{{ it.label }}</div>
                <div v-if="it.hint" class="pm-hint">{{ it.hint }}</div>
              </td>
              <td v-for="a in PERM_ACTS" :key="a" class="pm-cell">
                <el-checkbox
                  v-if="it.acts.includes(a)"
                  :model-value="isOn(it, a)"
                  :disabled="readOnlyMatrix"
                  @change="(v: string | number | boolean) => setAct(it, a, !!v)"
                />
                <span v-else class="pm-na">–</span>
              </td>
              <td class="pm-cell">
                <el-checkbox
                  :model-value="tri(rowCells(it)).all"
                  :indeterminate="tri(rowCells(it)).some"
                  :disabled="readOnlyMatrix"
                  @change="(v: string | number | boolean) => setCells(rowCells(it), !!v)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pm-foot">Checking any action also grants <b>View</b>; removing <b>View</b> clears the whole row. Menus outside this list are not access-controlled.</div>

      <template #footer>
        <el-button @click="groupDialog = false">{{ readOnlyMatrix ? 'Close' : 'Cancel' }}</el-button>
        <el-button v-if="!readOnlyMatrix" type="primary" @click="saveGroup">{{ groupForm.id ? 'Save changes' : 'Create group' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* Simulate bar */
.sim-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 18px;
  margin-bottom: 16px;
  border-radius: var(--radius-lg);
  border: 1px dashed var(--brand-light-2);
  background: var(--brand-light);
}
.sim-bar.on {
  border-color: var(--brand-gold);
  background: var(--brand-gold-light);
}
.sim-icon {
  font-size: 20px;
  color: var(--brand);
}
.sim-bar.on .sim-icon {
  color: var(--brand-gold-dark);
}
.sim-label {
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: var(--gray-500);
  flex: 1 1 260px;
}
.sim-label b {
  font-size: 13px;
  color: var(--gray-900);
}
.sim-select {
  width: 240px;
}
.sim-opt-group {
  float: right;
  margin-left: 16px;
  font-size: 12px;
  color: var(--gray-400);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Tabs & users */
.ur-count {
  display: inline-block;
  margin-left: 6px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 18px;
  background: var(--gray-100);
  color: var(--gray-500);
}
.ur-summary {
  margin: 10px 0;
  font-size: 13px;
  color: var(--gray-500);
}
.ur-summary b {
  color: var(--gray-900);
}
.ur-user {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ur-avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  background: var(--gray-100);
  color: var(--gray-700);
}
.ur-avatar.sm {
  width: 26px;
  height: 26px;
  font-size: 10px;
  margin-right: -6px;
  border: 2px solid var(--bg-card);
}
.ur-avatar.blue { background: #eff6ff; color: #2563eb; }
.ur-avatar.amber { background: var(--warning-light); color: #b45309; }
.ur-avatar.green { background: var(--success-light); color: #15803d; }
.ur-avatar.red { background: var(--danger-light); color: #b91c1c; }
.ur-name {
  font-weight: 600;
  color: var(--gray-900);
}
.ur-you {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  background: var(--brand-light);
  color: var(--brand);
}
.ur-you.sim {
  background: var(--brand-gold-light);
  color: var(--brand-gold-dark);
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
}
.ur-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

/* Group cards */
.gr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.gr-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
}
.gr-card.acting {
  border-color: var(--brand-gold);
  box-shadow: 0 0 0 3px var(--brand-gold-light);
}
.gr-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.gr-lock {
  color: var(--gray-400);
}
.gr-desc {
  font-size: 13px;
  color: var(--gray-500);
  min-height: 36px;
}
.gr-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.gr-stats div {
  display: flex;
  flex-direction: column;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--gray-50);
}
.gr-stats b {
  font-size: 17px;
  color: var(--gray-900);
}
.gr-stats span {
  font-size: 11px;
  color: var(--gray-500);
}
.gr-mods {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.gr-mod {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--brand-light);
  color: var(--brand-dark);
}
.gr-mod.none {
  background: var(--gray-100);
  color: var(--gray-500);
}
.gr-users {
  display: flex;
  align-items: center;
  min-height: 26px;
}
.gr-more {
  margin-left: 12px;
  font-size: 12px;
  color: var(--gray-500);
}
.gr-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--gray-100);
}

/* Permission matrix */
.gr-form :deep(.el-form-item) {
  margin-bottom: 12px;
}
.gr-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 10px;
  border-radius: var(--radius-sm);
  background: var(--gray-50);
  color: var(--gray-700);
  font-size: 13px;
}
.pm-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.pm-summary {
  font-size: 12px;
  color: var(--gray-500);
}
.pm-wrap {
  max-height: 56vh;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.pm {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.pm th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--gray-50);
  font-weight: 600;
  color: var(--gray-700);
  padding: 8px 6px;
  border-bottom: 1px solid var(--border);
}
.pm th.pm-item {
  text-align: left;
  padding-left: 14px;
}
.pm-act {
  width: 74px;
  text-align: center;
}
.pm-act :deep(.el-checkbox) {
  height: 20px;
}
.pm td {
  padding: 6px;
  border-bottom: 1px solid var(--gray-100);
}
.pm td.pm-item {
  padding-left: 26px;
}
.pm-module td {
  background: var(--brand-light);
  font-weight: 700;
  color: var(--brand-dark);
  padding-left: 14px;
}
.pm-label {
  color: var(--gray-900);
}
.pm-hint {
  font-size: 11px;
  color: var(--gray-400);
}
tr.off .pm-label {
  color: var(--gray-500);
}
.pm-cell {
  text-align: center;
}
.pm-cell :deep(.el-checkbox) {
  height: 20px;
}
.pm-na {
  color: var(--gray-400);
}
.pm-foot {
  margin-top: 8px;
  font-size: 12px;
  color: var(--gray-500);
}

@media (max-width: 640px) {
  .ur-form-row {
    grid-template-columns: 1fr;
  }
  .sim-select {
    width: 100%;
  }
}
</style>
