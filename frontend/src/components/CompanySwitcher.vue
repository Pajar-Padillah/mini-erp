<script setup lang="ts">
import { onMounted } from 'vue'
import { useCompanyStore } from '../stores/companyStore'

const companyStore = useCompanyStore()
onMounted(() => companyStore.loadCompanies())

function onSelect(v: number) {
  companyStore.selectCompany(v)
}
</script>

<template>
  <el-select
    :model-value="companyStore.selectedCompanyId ?? undefined"
    placeholder="Select company"
    style="width: 260px"
    @update:model-value="onSelect"
  >
    <el-option v-for="c in companyStore.companies" :key="c.id" :label="`${c.code} — ${c.name}`" :value="c.id" />
  </el-select>
</template>
