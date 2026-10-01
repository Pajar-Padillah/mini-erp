<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCompanyStore } from '../stores/companyStore'

const { t } = useI18n()
const companyStore = useCompanyStore()
onMounted(() => companyStore.loadCompanies())

function onSelect(v: number) {
  companyStore.selectCompany(v)
}
</script>

<template>
  <el-select
    :model-value="companyStore.selectedCompanyId ?? undefined"
    :placeholder="t('company.placeholder')"
    style="width: 260px"
    @update:model-value="onSelect"
  >
    <el-option v-for="c in companyStore.companies" :key="c.id" :label="`${c.code} — ${c.name}`" :value="c.id" />
  </el-select>
</template>
