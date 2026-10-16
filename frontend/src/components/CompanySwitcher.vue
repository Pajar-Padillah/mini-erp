<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Check, DCaret, OfficeBuilding, Search } from '@element-plus/icons-vue'
import { useCompanyStore, type CompanyNode } from '../stores/companyStore'
import type { Company } from '../types/common'

const companyStore = useCompanyStore()
onMounted(() => companyStore.loadCompanies())

const open = ref(false)
const query = ref('')
const searchInput = ref<{ focus: () => void } | null>(null)

const selected = computed(() => companyStore.selectedCompany)

function matches(company: Company, q: string) {
  return `${company.code} ${company.name}`.toLowerCase().includes(q)
}

// A group stays visible when one of its branches matches, so the branch keeps its context;
// a matching group shows all of its branches.
const results = computed<CompanyNode[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return companyStore.tree
  return companyStore.tree
    .map((node) => (matches(node.company, q) ? node : { ...node, branches: node.branches.filter((b) => matches(b, q)) }))
    .filter((node) => matches(node.company, q) || node.branches.length > 0)
})

watch(open, async (isOpen) => {
  if (!isOpen) return
  query.value = ''
  await nextTick()
  searchInput.value?.focus()
})

function onSelect(id: number) {
  companyStore.selectCompany(id)
  open.value = false
}

function onEnter() {
  const q = query.value.trim().toLowerCase()
  const first = results.value[0]
  if (!first) return
  // Prefer the first actual match: a branch when only branches matched.
  const target = !q || matches(first.company, q) ? first.company : first.branches[0]
  onSelect(target.id)
}
</script>

<template>
  <el-popover
    v-model:visible="open"
    trigger="click"
    placement="bottom-end"
    :width="300"
    :show-arrow="false"
    popper-class="company-switcher-popper"
  >
    <template #reference>
      <button type="button" class="company-switcher" title="Switch company" aria-label="Switch company" :aria-expanded="open">
        <el-icon class="company-switcher-icon"><OfficeBuilding /></el-icon>
        <span v-if="selected" class="company-switcher-text">
          <span class="company-switcher-name">{{ selected.name }}</span>
          <span v-if="companyStore.isGroupSelected" class="company-switcher-badge">All branches</span>
        </span>
        <span v-else class="company-switcher-text">Select company</span>
        <el-icon class="company-switcher-caret"><DCaret /></el-icon>
      </button>
    </template>

    <div class="company-switcher-panel">
      <el-input
        ref="searchInput"
        v-model="query"
        :prefix-icon="Search"
        placeholder="Search company…"
        clearable
        class="company-switcher-search"
        @keydown.enter.prevent="onEnter"
        @keydown.esc="open = false"
      />
      <ul class="company-switcher-list" aria-label="Companies">
        <li v-for="node in results" :key="node.company.id">
          <button
            type="button"
            class="company-switcher-item is-group"
            :class="{ 'is-selected': node.company.id === companyStore.selectedCompanyId }"
            :aria-current="node.company.id === companyStore.selectedCompanyId ? 'true' : undefined"
            @click="onSelect(node.company.id)"
          >
            <span class="company-switcher-group-icon"><el-icon><OfficeBuilding /></el-icon></span>
            <span class="company-switcher-option">
              <span class="company-switcher-option-name">{{ node.company.name }}</span>
              <span v-if="node.branches.length" class="company-switcher-option-hint">Group · sees all branches</span>
            </span>
            <el-icon v-if="node.company.id === companyStore.selectedCompanyId" class="company-switcher-check"><Check /></el-icon>
          </button>
          <ul v-if="node.branches.length" class="company-switcher-branches">
            <li v-for="branch in node.branches" :key="branch.id">
              <button
                type="button"
                class="company-switcher-item is-branch"
                :class="{ 'is-selected': branch.id === companyStore.selectedCompanyId }"
                :aria-current="branch.id === companyStore.selectedCompanyId ? 'true' : undefined"
                @click="onSelect(branch.id)"
              >
                <span class="company-switcher-option-name">{{ branch.name }}</span>
                <el-icon v-if="branch.id === companyStore.selectedCompanyId" class="company-switcher-check"><Check /></el-icon>
              </button>
            </li>
          </ul>
        </li>
      </ul>
      <div v-if="!results.length" class="company-switcher-empty">No company matches "{{ query }}"</div>
    </div>
  </el-popover>
</template>
