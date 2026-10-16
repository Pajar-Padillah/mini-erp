<script setup lang="ts">
// Suppliers & Customers: the contacts used by the WMS inbound (supplier) and outbound (customer) documents.
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '../../components/PageHeader.vue'
import PaginationBar from '../../components/PaginationBar.vue'
import TransactionFilterBar, { type TransactionFilterOption, type TransactionFilterState } from '../../components/TransactionFilterBar.vue'
import { matchesTransactionValue } from '../../utils/transactionFilters'
import { fmtDate, fmtQty } from './wmsUi'
import { useWmsStore, type Contact } from '../../stores/wmsStore'
import { useAccessStore } from '../../stores/accessStore'
import DocCollabSection from './DocCollabSection.vue'
import { useDocCollabKey } from './useDocCollabKey'

type ContactType = Contact['type']
type Term = NonNullable<Contact['term']>

const store = useWmsStore()
const access = useAccessStore()
const router = useRouter()

// ---------- filters (standard filter bar: status = type, secondary status = term)
function emptyFilters(): TransactionFilterState {
  return { dateRange: [], status: [], secondaryStatus: [], conditions: [] }
}
const filters = ref<TransactionFilterState>(emptyFilters())
const page = ref(1)
const pageSize = 15

const typeOptions: TransactionFilterOption[] = [
  { label: 'Supplier', value: 'SUPPLIER', color: 'blue' },
  { label: 'Customer', value: 'CUSTOMER', color: 'green' },
]
const termOptions: TransactionFilterOption[] = [
  { label: 'Beli Putus', value: 'BELI PUTUS', color: 'gray' },
  { label: 'Konsinyasi', value: 'KONSINYASI', color: 'amber' },
]
const fields: TransactionFilterOption[] = [
  { label: 'Name', value: 'name' },
  { label: 'Type', value: 'type' },
  { label: 'Term', value: 'term' },
]

watch(filters, () => { page.value = 1 }, { deep: true })

const rows = computed(() =>
  store.contacts.map((c) => {
    let docs = 0
    let qty = 0
    let lastDate = ''
    let lastNo = ''
    if (c.type === 'SUPPLIER') {
      store.inbound.forEach((d) => {
        if (d.supplier !== c.name) return
        docs++
        qty += d.items.reduce((a, i) => a + i.qty, 0)
        if (d.date >= lastDate) { lastDate = d.date; lastNo = d.no }
      })
    } else {
      store.outbound.forEach((d) => {
        if (d.customer !== c.name) return
        docs++
        qty += d.items.reduce((a, i) => a + i.qty, 0)
        if (d.date >= lastDate) { lastDate = d.date; lastNo = d.no }
      })
    }
    return { ...c, docs, qty, lastDate, lastNo }
  }),
)
type Row = (typeof rows.value)[number]

const filtered = computed(() => {
  const f = filters.value
  return rows.value
    .filter((r) => {
      const term = r.type === 'CUSTOMER' ? r.term ?? 'BELI PUTUS' : ''
      if (f.status.length && !f.status.includes(r.type)) return false
      if (f.secondaryStatus.length && !f.secondaryStatus.includes(term)) return false
      const values: Record<string, string> = { name: r.name, type: r.type, term }
      return f.conditions.every((c) => (c.field in values ? matchesTransactionValue(values[c.field], c) : true))
    })
    .sort((a, b) => b.type.localeCompare(a.type) || a.name.localeCompare(b.name))
})
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

function openLastDoc(r: Row) {
  if (!r.lastNo) return
  if (r.type === 'SUPPLIER') router.push({ path: '/inventory/inbound-receiving', query: { no: r.lastNo } })
  else router.push({ path: '/inventory/outbound-picking' })
}

async function remove(r: Row) {
  try {
    await ElMessageBox.confirm(`Delete ${r.type === 'SUPPLIER' ? 'supplier' : 'customer'} "${r.name}"?`, 'Delete contact', {
      type: 'warning',
      confirmButtonText: 'Delete',
    })
  } catch {
    return
  }
  const res = store.deleteContact(r.id)
  if (res.ok) ElMessage.success(res.msg)
  else ElMessage.warning(res.msg)
}

// ---------- dialog
const dialogOpen = ref(false)
const editingId = ref<string | undefined>()
const form = ref<{ type: ContactType; name: string; term: Term }>({ type: 'SUPPLIER', name: '', term: 'BELI PUTUS' })
const editingUsed = computed(() => !!editingId.value && (rows.value.find((r) => r.id === editingId.value)?.docs ?? 0) > 0)

const collab = useDocCollabKey('wms-contact')

function openNew() {
  editingId.value = undefined
  form.value = { type: filters.value.status.length === 1 && filters.value.status[0] === 'CUSTOMER' ? 'CUSTOMER' : 'SUPPLIER', name: '', term: 'BELI PUTUS' }
  collab.startCreate()
  dialogOpen.value = true
}
function openEdit(r: Row) {
  editingId.value = r.id
  form.value = { type: r.type, name: r.name, term: r.term ?? 'BELI PUTUS' }
  collab.startEdit(r.id)
  dialogOpen.value = true
}
function save() {
  const f = form.value
  const res = store.saveContact(
    { name: f.name.replace(/\s+/g, ' '), type: f.type, term: f.type === 'CUSTOMER' ? f.term : undefined },
    editingId.value,
  )
  if (res.ok) {
    if (!editingId.value && res.data) collab.commit(res.data)
    ElMessage.success(res.msg)
    dialogOpen.value = false
  } else ElMessage.warning(res.msg)
}
</script>

<template>
  <div class="page">
    <PageHeader title="Suppliers & Customers" subtitle="Suppliers appear on inbound receiving, customers (with their trading term) on outbound orders">
      <template #actions>
        <el-button v-if="access.can('wms-contacts', 'create')" type="primary" @click="openNew">+ New contact</el-button>
      </template>
    </PageHeader>

    <div class="ct-note">
      These contacts are used by the WMS inbound and outbound documents. The Master Data Customers / Suppliers are the
      ERP's backend records and are managed separately.
    </div>

    <div class="card">
      <TransactionFilterBar
        v-model="filters"
        :fields="fields"
        :statuses="typeOptions"
        :secondary-statuses="termOptions"
        secondary-status-label="Term"
        hide-date
        @reset="filters = emptyFilters()"
        @refresh="() => {}"
      />
      <div class="ct-info">{{ filtered.length }} of {{ store.contacts.length }} contacts</div>

      <el-table :data="paged" row-key="id" class="ct-table">
        <template #empty>
          {{ store.contacts.length ? 'No contacts match the filters.' : 'No contacts yet. Click + New contact.' }}
        </template>
        <el-table-column label="Name" min-width="240">
          <template #default="{ row }">
            <a class="ct-link name" @click="openEdit(row)">{{ row.name }}</a>
          </template>
        </el-table-column>
        <el-table-column label="Type" width="120">
          <template #default="{ row }">
            <span class="status-pill" :class="row.type === 'SUPPLIER' ? 'blue' : 'green'">{{ row.type === 'SUPPLIER' ? 'SUPPLIER' : 'CUSTOMER' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Trading term" width="140">
          <template #default="{ row }">
            <span v-if="row.type === 'CUSTOMER'" class="status-pill" :class="row.term === 'KONSINYASI' ? 'amber' : 'gray'">{{ row.term ?? 'BELI PUTUS' }}</span>
            <span v-else class="muted">–</span>
          </template>
        </el-table-column>
        <el-table-column label="Documents" align="right" width="110">
          <template #default="{ row }">
            <span :class="{ muted: !row.docs }">{{ row.docs }}</span>
            <div class="ct-hint">{{ row.type === 'SUPPLIER' ? 'inbound' : 'outbound' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Total qty" align="right" width="130">
          <template #default="{ row }">
            <span :class="{ muted: !row.qty }">{{ fmtQty(row.qty) }}</span>
            <div class="ct-hint">{{ row.type === 'SUPPLIER' ? 'received' : 'ordered' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Last document" min-width="170">
          <template #default="{ row }">
            <template v-if="row.lastNo">
              <a class="ct-link mono" @click="openLastDoc(row)">{{ row.lastNo }}</a>
              <div class="ct-hint">{{ fmtDate(row.lastDate) }}</div>
            </template>
            <span v-else class="muted">–</span>
          </template>
        </el-table-column>
        <el-table-column label="" width="140" align="right">
          <template #default="{ row }">
            <el-button v-if="access.can('wms-contacts', 'edit')" size="small" link type="primary" @click="openEdit(row)">Edit</el-button>
            <el-button v-if="access.can('wms-contacts', 'delete')" size="small" link type="danger" @click="remove(row)">Delete</el-button>
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar v-model:page="page" :page-size="pageSize" :total="filtered.length" />
    </div>

    <el-dialog v-model="dialogOpen" :title="editingId ? `Edit contact – ${form.name}` : 'New contact'" width="600px" top="5vh" @closed="collab.closed">
      <el-form label-position="top" @submit.prevent="save">
        <el-form-item label="Type">
          <el-radio-group v-model="form.type" :disabled="editingUsed">
            <el-radio-button value="SUPPLIER">Supplier</el-radio-button>
            <el-radio-button value="CUSTOMER">Customer</el-radio-button>
          </el-radio-group>
          <div v-if="editingUsed" class="ct-hint ct-block">The type cannot be changed because this contact is used by documents.</div>
        </el-form-item>
        <el-form-item label="Name">
          <el-input v-model="form.name" placeholder="e.g. PT Indesso Aroma" />
          <div v-if="editingId" class="ct-hint ct-block">Renaming also updates the documents that reference this contact.</div>
        </el-form-item>
        <el-form-item v-if="form.type === 'CUSTOMER'" label="Trading term">
          <el-radio-group v-model="form.term">
            <el-radio value="BELI PUTUS">Beli Putus</el-radio>
            <el-radio value="KONSINYASI">Konsinyasi</el-radio>
          </el-radio-group>
          <div class="ct-terms">
            <div><b>BELI PUTUS</b> – outright purchase: ownership passes to the customer on delivery.</div>
            <div><b>KONSINYASI</b> – consignment: the goods are still ours until the customer sells them.</div>
          </div>
        </el-form-item>
      </el-form>
      <DocCollabSection :doc-key="collab.key.value" />
      <template #footer>
        <el-button @click="dialogOpen = false">Cancel</el-button>
        <el-button type="primary" @click="save">Save</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.ct-note {
  margin-bottom: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border-soft);
  border-left: 3px solid var(--brand);
  border-radius: 8px;
  background: var(--brand-light);
  font-size: 13px;
  color: var(--gray-700);
}
.ct-info {
  margin: 10px 0 8px;
  font-size: 12px;
  color: var(--gray-500);
}
.ct-link {
  color: var(--brand);
  cursor: pointer;
  font-weight: 600;
}
.ct-link:hover {
  text-decoration: underline;
}
.ct-hint {
  font-size: 11px;
  color: var(--gray-500);
  line-height: 1.4;
}
.ct-block {
  width: 100%;
  margin-top: 4px;
}
.ct-terms {
  width: 100%;
  margin-top: 6px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--gray-50);
  font-size: 12px;
  line-height: 1.6;
  color: var(--gray-600);
}
.muted {
  color: var(--gray-500);
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
