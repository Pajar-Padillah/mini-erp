<script setup lang="ts">
// Header actions of a saved document form: Next Actions (status transitions / follow-up documents),
// Print (not built yet: shows a toast), and a ⋯ menu with Show Approval, Audit Trail, Related Documents (Alt+R),
// Show Journal (ledger-posting documents only) and Duplicate.
import { ElMessage } from 'element-plus'
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, type Component } from 'vue'
import { ArrowDown, Checked, Clock, Connection, DocumentCopy, MoreFilled, Notebook, Printer } from '@element-plus/icons-vue'
import DocActions from './DocActions.vue'
import { isDraft, postsJournal, type DocRef } from './docActionsData'

export interface NextAction {
  key: string
  label: string
  icon?: Component
  danger?: boolean
  divided?: boolean
}

const props = defineProps<{ doc: DocRef; actions: NextAction[]; loading?: boolean }>()
const emit = defineEmits<{ select: [key: string]; duplicate: [] }>()

const docActions = ref<InstanceType<typeof DocActions>>()

// Printing is planned but not built yet.
function print() {
  ElMessage.info('Print is coming in a next release.')
}

const showJournal = computed(() => postsJournal(props.doc))
const journalDisabled = computed(() => isDraft(props.doc))

function onMore(command: 'approval' | 'audit' | 'related' | 'journal' | 'duplicate') {
  if (command === 'duplicate') emit('duplicate')
  else docActions.value?.openPanel(command, props.doc)
}

// Alt+R opens Related Documents; only while this (kept-alive) page is the active one.
function onKeydown(e: KeyboardEvent) {
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'r') {
    e.preventDefault()
    onMore('related')
  }
}
function listen() {
  window.addEventListener('keydown', onKeydown)
}
function unlisten() {
  window.removeEventListener('keydown', onKeydown)
}
onMounted(listen)
onActivated(listen)
onDeactivated(unlisten)
onBeforeUnmount(unlisten)
</script>

<template>
  <el-dropdown v-if="actions.length" trigger="click" placement="bottom-end" @command="(key: string) => emit('select', key)">
    <el-button type="primary" :loading="loading">
      Next Actions<el-icon class="el-icon--right"><ArrowDown /></el-icon>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu class="form-doc-menu">
        <el-dropdown-item
          v-for="a in actions"
          :key="a.key"
          :command="a.key"
          :icon="a.icon"
          :divided="a.divided"
          :class="{ 'is-danger': a.danger }"
        >
          {{ a.label }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
  <el-button :icon="Printer" @click="print">Print</el-button>
  <el-dropdown trigger="click" placement="bottom-end" @command="onMore">
    <el-button class="form-doc-more" :icon="MoreFilled" aria-label="More actions" title="More actions" />
    <template #dropdown>
      <el-dropdown-menu class="form-doc-menu">
        <el-dropdown-item command="approval" :icon="Checked">Show Approval</el-dropdown-item>
        <el-dropdown-item command="audit" :icon="Clock">Audit Trail</el-dropdown-item>
        <el-dropdown-item command="related" :icon="Connection">Related Documents (Alt+R)</el-dropdown-item>
        <el-dropdown-item
          v-if="showJournal"
          command="journal"
          :icon="Notebook"
          :disabled="journalDisabled"
          :title="journalDisabled ? 'The journal is posted when the document is submitted' : undefined"
        >
          Show Journal
        </el-dropdown-item>
        <el-dropdown-item command="duplicate" :icon="DocumentCopy">Duplicate</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
  <DocActions ref="docActions" />
</template>
