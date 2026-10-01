<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { OfficeBuilding } from '@element-plus/icons-vue'
import { useCompanyStore } from '../stores/companyStore'

defineProps<{ collapsed?: boolean }>()

const companyStore = useCompanyStore()
onMounted(() => companyStore.loadCompanies())

const selected = computed(() => companyStore.companies.find((c) => c.id === companyStore.selectedCompanyId))

function onSelect(v: number) {
  companyStore.selectCompany(v)
}
</script>

<template>
  <el-select
    :model-value="companyStore.selectedCompanyId ?? undefined"
    placeholder="Select office"
    class="company-switcher"
    :class="{ 'is-collapsed': collapsed }"
    popper-class="company-switcher-popper"
    @update:model-value="onSelect"
  >
    <template #prefix>
      <el-icon class="company-switcher-icon"><OfficeBuilding /></el-icon>
    </template>
    <template #label>
      <span v-if="selected" class="company-switcher-label">
        <span class="company-switcher-code">{{ selected.code }}</span>
        <span class="company-switcher-name">{{ selected.name }}</span>
      </span>
    </template>
    <el-option v-for="c in companyStore.companies" :key="c.id" :label="`${c.code} — ${c.name}`" :value="c.id" />
  </el-select>
</template>
