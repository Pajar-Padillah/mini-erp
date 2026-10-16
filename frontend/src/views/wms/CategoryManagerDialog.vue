<script setup lang="ts">
// Manage SKU categories: code, name, SKU code prefix and the target (putaway) zone.
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { TRANSIT_ZONE, useWmsStore, type Category } from '../../stores/wmsStore'

const open = defineModel<boolean>({ default: false })
const store = useWmsStore()

const storageZones = computed(() => store.zones.filter((z) => z.id !== TRANSIT_ZONE))
const rows = computed(() => store.categories.map((c) => ({ ...c, skuCount: store.skus.filter((s) => s.category === c.id).length })))

const editing = ref<string | null>(null)
const form = reactive<Category>({ id: '', name: '', prefix: '', zone: '' })
function resetForm() {
  editing.value = null
  Object.assign(form, { id: '', name: '', prefix: '', zone: storageZones.value[0]?.id ?? '' })
}
watch(open, (v) => { if (v) resetForm() }, { immediate: true })

function edit(c: Category) {
  editing.value = c.id
  Object.assign(form, { id: c.id, name: c.name, prefix: c.prefix, zone: c.zone })
}
function save() {
  const r = store.saveCategory({ ...form }, editing.value ?? undefined)
  if (r.ok) {
    ElMessage.success(r.msg)
    resetForm()
  } else ElMessage.warning(r.msg)
}
async function remove(c: Category) {
  try {
    await ElMessageBox.confirm(`Delete category ${c.id} – ${c.name}?`, 'Delete category', { type: 'warning', confirmButtonText: 'Delete' })
  } catch {
    return
  }
  const r = store.deleteCategory(c.id)
  if (r.ok) {
    ElMessage.success(r.msg)
    if (editing.value === c.id) resetForm()
  } else ElMessage.warning(r.msg)
}
</script>

<template>
  <el-dialog v-model="open" title="Manage categories" width="760px">
    <el-table :data="rows" size="small">
      <el-table-column prop="id" label="Code" width="100" />
      <el-table-column prop="name" label="Name" min-width="180" show-overflow-tooltip />
      <el-table-column prop="prefix" label="SKU prefix" width="100" />
      <el-table-column label="Target zone" min-width="140">
        <template #default="{ row }">{{ store.zone(row.zone)?.name ?? row.zone }}</template>
      </el-table-column>
      <el-table-column prop="skuCount" label="SKUs" width="70" align="right" />
      <el-table-column label="" width="120" align="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="edit(row)">Edit</el-button>
          <el-button size="small" link type="danger" :disabled="row.skuCount > 0" :title="row.skuCount ? 'Category is used by SKUs' : ''" @click="remove(row)">Delete</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="cat-form">
      <h4>{{ editing ? `Edit ${editing}` : 'Add category' }}</h4>
      <el-form label-position="top" @submit.prevent="save">
        <div class="cat-grid">
          <el-form-item label="Category code">
            <el-input v-model="form.id" placeholder="e.g. FMCG" :disabled="!!editing" />
          </el-form-item>
          <el-form-item label="Name">
            <el-input v-model="form.name" placeholder="e.g. Food & Beverage" />
          </el-form-item>
          <el-form-item label="SKU prefix">
            <el-input v-model="form.prefix" placeholder="e.g. FMCG-" />
          </el-form-item>
          <el-form-item label="Target zone">
            <el-select v-model="form.zone" style="width: 100%">
              <el-option v-for="z in storageZones" :key="z.id" :label="z.name" :value="z.id" />
            </el-select>
          </el-form-item>
        </div>
      </el-form>
      <div class="cat-actions">
        <el-button v-if="editing" @click="resetForm">Cancel edit</el-button>
        <el-button type="primary" @click="save">{{ editing ? 'Save category' : 'Add category' }}</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.cat-form {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border-soft);
}
.cat-form h4 {
  margin: 0 0 10px;
  font-size: 14px;
  color: var(--gray-900);
}
.cat-grid {
  display: grid;
  grid-template-columns: 0.8fr 1.4fr 0.8fr 1.2fr;
  gap: 0 12px;
}
.cat-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
@media (max-width: 640px) {
  .cat-grid {
    grid-template-columns: 1fr;
  }
}
</style>
