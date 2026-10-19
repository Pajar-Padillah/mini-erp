<script setup lang="ts">
// Row actions for any list: one floating menu (opened from the ⋯ column or by right-clicking
// a row) plus the drawer/dialog that shows the chosen action. Static mockup content.
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ChatLineSquare, Checked, Clock, Close, Connection, Document, EditPen, Notebook, Right } from '@element-plus/icons-vue'
import DocCommentsDrawer from '../doc-collab/DocCommentsDrawer.vue'
import { docKey } from '../../stores/docCollabStore'
import { formatValue } from '../charts/chartUtils'
import {
  ACTION_LABELS, ALL_DOC_ACTIONS, approvalSteps, auditTrail, isDraft, isSubmitted, journalLines, postsJournal, relatedDocs,
  type DocAction, type DocRef,
} from './docActionsData'

const props = withDefaults(defineProps<{ actions?: DocAction[] }>(), { actions: () => ALL_DOC_ACTIONS })

const emit = defineEmits<{ edit: [doc: DocRef] }>()

const router = useRouter()
const ICONS: Record<DocAction, unknown> = {
  edit: EditPen,
  comments: ChatLineSquare,
  approval: Checked,
  'cancel-approval': Close,
  audit: Clock,
  related: Connection,
  journal: Notebook,
}

// ---------- Floating menu ----------
const menuOpen = ref(false)
const menuPos = ref({ x: 0, y: 0 })
const menuEl = ref<HTMLElement>()
const doc = ref<DocRef | null>(null)

// Show Journal only appears for document types that post to the ledger.
const menuActions = computed(() =>
  props.actions.filter((a) => a !== 'journal' || (doc.value && postsJournal(doc.value))),
)

function disabled(action: DocAction): string | undefined {
  if (!doc.value) return undefined
  if (action === 'cancel-approval' && !isSubmitted(doc.value)) return 'Not submitted for approval yet'
  if (action === 'journal' && isDraft(doc.value)) return 'The journal is posted when the document is submitted'
  return undefined
}

/** Right-click: open at the cursor. ⋯ button: open under the button's right edge. */
async function openMenu(event: MouseEvent, target: DocRef) {
  event.preventDefault()
  event.stopPropagation()
  doc.value = target
  const anchor = event.currentTarget as HTMLElement | null
  const fromButton = event.type === 'click' && !!anchor?.getBoundingClientRect
  if (fromButton) {
    const rect = anchor!.getBoundingClientRect()
    menuPos.value = { x: rect.right, y: rect.bottom + 4 }
  } else {
    menuPos.value = { x: event.clientX, y: event.clientY }
  }
  menuOpen.value = true
  await nextTick()
  // Keep the menu inside the viewport; right-align it under the ⋯ button.
  const el = menuEl.value
  if (!el) return
  const { width, height } = el.getBoundingClientRect()
  let x = fromButton ? menuPos.value.x - width : menuPos.value.x
  let y = menuPos.value.y
  if (x + width > window.innerWidth - 8) x = window.innerWidth - width - 8
  if (y + height > window.innerHeight - 8) y = Math.max(8, (fromButton ? y - height - 40 : y - height))
  menuPos.value = { x: Math.max(8, x), y }
  el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  window.addEventListener('mousedown', onOutside, true)
  window.addEventListener('scroll', closeMenu, true)
  window.addEventListener('resize', closeMenu)
  window.addEventListener('keydown', onKey)
}

function closeMenu() {
  menuOpen.value = false
  window.removeEventListener('mousedown', onOutside, true)
  window.removeEventListener('scroll', closeMenu, true)
  window.removeEventListener('resize', closeMenu)
  window.removeEventListener('keydown', onKey)
}

function onOutside(e: MouseEvent) {
  if (!menuEl.value?.contains(e.target as Node)) closeMenu()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') closeMenu()
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const items = Array.from(menuEl.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }
}

onBeforeUnmount(closeMenu)

// ---------- Action panels ----------
const panel = ref<DocAction | null>(null)
const drawerOpen = ref(false)
const commentsOpen = ref(false)
const cancelOpen = ref(false)
const cancelReason = ref('')

function run(action: DocAction) {
  closeMenu()
  if (disabled(action)) return
  if (action === 'edit') {
    if (doc.value) emit('edit', doc.value)
    return
  }
  if (action === 'comments') {
    commentsOpen.value = true
    return
  }
  if (action === 'cancel-approval') {
    cancelReason.value = ''
    cancelOpen.value = true
    return
  }
  panel.value = action
  drawerOpen.value = true
}

function confirmCancel() {
  if (!cancelReason.value.trim() || !doc.value) return
  ElMessage.success(`Approval cancelled for ${doc.value.no} (mockup only)`)
  cancelOpen.value = false
}

const collabKey = computed(() => (doc.value ? doc.value.collabKey ?? docKey(doc.value.type, doc.value.no) : ''))
const steps = computed(() => (doc.value ? approvalSteps(doc.value) : []))
const audit = computed(() => (doc.value ? auditTrail(doc.value) : []))
const related = computed(() => (doc.value ? relatedDocs(doc.value) : []))
const journal = computed(() => (doc.value ? journalLines(doc.value) : null))
const journalTotal = computed(() => (journal.value ?? []).reduce((s, l) => s + l.debit, 0))
const journalNo = computed(() => `JE/SGI/${(doc.value?.no ?? '').replace(/\D/g, '').slice(-4).padStart(4, '0')}`)

const STEP_LABEL = { approved: 'Approved', pending: 'Pending', waiting: 'Waiting', draft: 'Not submitted' }
const STATUS_TONE: Record<string, string> = {
  DRAFT: 'gray', ACTIVE: 'blue', PROCESSED: 'amber', COMPLETED: 'green', SUBMITTED: 'green', POSTED: 'green', APPROVED: 'green', PAID: 'green',
}

function openRelated(to: string, current?: boolean) {
  if (!to || current) return
  drawerOpen.value = false
  router.push(to)
}

/** Open one action's panel directly (e.g. from a form header) without the floating menu. */
function openPanel(action: DocAction, target: DocRef) {
  doc.value = target
  run(action)
}

defineExpose({ openMenu, openPanel })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="menuOpen && doc"
      ref="menuEl"
      class="row-menu"
      role="menu"
      :aria-label="`Actions for ${doc.no}`"
      :style="{ left: `${menuPos.x}px`, top: `${menuPos.y}px` }"
      @contextmenu.prevent
    >
      <div class="row-menu-head">
        <span class="row-menu-no">{{ doc.no }}</span>
        <span class="row-menu-type">{{ doc.type }}</span>
      </div>
      <button
        v-for="action in menuActions"
        :key="action"
        type="button"
        role="menuitem"
        class="row-menu-item"
        :class="{ 'is-danger': action === 'cancel-approval' }"
        :disabled="!!disabled(action)"
        :title="disabled(action)"
        @click="run(action)"
      >
        <el-icon><component :is="ICONS[action]" /></el-icon>
        {{ ACTION_LABELS[action] }}
      </button>
    </div>
  </Teleport>

  <el-drawer
    v-model="drawerOpen"
    :title="panel ? `${ACTION_LABELS[panel].replace('Show ', '')} · ${doc?.no}` : ''"
    size="460px"
    append-to-body
    class="doc-action-drawer"
  >
    <template v-if="doc">
      <div class="doc-action-summary">
        <span class="doc-action-icon"><el-icon><Document /></el-icon></span>
        <div class="doc-action-summary-text">
          <div class="doc-action-summary-no">{{ doc.no }}</div>
          <div class="doc-action-summary-meta">
            {{ doc.type }}<template v-if="doc.party"> · {{ doc.party }}</template><template v-if="doc.date"> · {{ doc.date.slice(0, 10) }}</template>
          </div>
        </div>
        <span v-if="doc.status" class="status-pill" :class="STATUS_TONE[doc.status.toUpperCase()] ?? 'gray'">{{ doc.status }}</span>
      </div>

      <!-- Approval -->
      <ol v-if="panel === 'approval'" class="doc-steps">
        <li v-for="s in steps" :key="s.level" class="doc-step" :class="`is-${s.state}`">
          <span class="doc-step-dot" />
          <div class="doc-step-body">
            <div class="doc-step-top">
              <span class="doc-step-level">{{ s.level }}</span>
              <span class="doc-step-state">{{ STEP_LABEL[s.state] }}</span>
            </div>
            <div class="doc-step-who">{{ s.approver }} · {{ s.role }}</div>
            <div v-if="s.at || s.note" class="doc-step-note">
              <template v-if="s.at">{{ s.at }}</template><template v-if="s.at && s.note"> · </template>{{ s.note }}
            </div>
          </div>
        </li>
      </ol>

      <!-- Audit trail -->
      <el-timeline v-else-if="panel === 'audit'" class="doc-audit">
        <el-timeline-item
          v-for="(e, i) in audit"
          :key="i"
          :timestamp="e.at"
          :type="e.tone === 'approve' ? 'success' : e.tone === 'submit' ? 'primary' : e.tone === 'create' ? 'info' : undefined"
          :hollow="e.tone === 'update' || e.tone === 'print'"
        >
          <div class="doc-audit-action">{{ e.action }} <span>by {{ e.by }}</span></div>
          <div v-if="e.detail" class="doc-audit-detail">{{ e.detail }}</div>
        </el-timeline-item>
      </el-timeline>

      <!-- Related documents -->
      <ol v-else-if="panel === 'related'" class="doc-related">
        <li v-for="r in related" :key="r.no">
          <button type="button" class="doc-related-item" :class="{ 'is-current': r.current, 'is-link': !!r.to && !r.current }" @click="openRelated(r.to, r.current)">
            <span class="doc-related-text">
              <span class="doc-related-type">{{ r.type }}<em v-if="r.current"> · this document</em></span>
              <span class="doc-related-no">{{ r.no }}</span>
            </span>
            <span v-if="r.status !== '-'" class="status-pill" :class="STATUS_TONE[r.status] ?? 'gray'">{{ r.status }}</span>
            <el-icon v-if="r.to && !r.current" class="doc-related-go"><Right /></el-icon>
          </button>
        </li>
      </ol>

      <!-- Journal -->
      <div v-else-if="panel === 'journal' && journal" class="doc-journal">
        <div class="doc-journal-head">
          <span>{{ journalNo }}</span>
          <span class="status-pill green">POSTED</span>
        </div>
        <table class="doc-journal-table">
          <thead>
            <tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr>
          </thead>
          <tbody>
            <tr v-for="l in journal" :key="l.account">
              <td>
                <div class="doc-journal-account">{{ l.account }}</div>
                <div class="doc-journal-desc">{{ l.description }}</div>
              </td>
              <td class="num">{{ l.debit ? formatValue(l.debit, 'money') : '' }}</td>
              <td class="num">{{ l.credit ? formatValue(l.credit, 'money') : '' }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr><td>Total</td><td class="num">{{ formatValue(journalTotal, 'money') }}</td><td class="num">{{ formatValue(journalTotal, 'money') }}</td></tr>
          </tfoot>
        </table>
        <button type="button" class="chat-info-link" @click="openRelated('/accounting/journal-entries')">Open in Journal Entries →</button>
      </div>
    </template>
  </el-drawer>

  <el-dialog v-model="cancelOpen" :title="`Cancel approval · ${doc?.no}`" width="440px" append-to-body>
    <p class="doc-cancel-text">The document goes back to <b>Draft</b> and approvers are notified. Please give a reason.</p>
    <el-input v-model="cancelReason" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="Reason for cancelling the approval" />
    <template #footer>
      <el-button @click="cancelOpen = false">Keep approval</el-button>
      <el-button type="danger" :disabled="!cancelReason.trim()" @click="confirmCancel">Cancel approval</el-button>
    </template>
  </el-dialog>
  <DocCommentsDrawer v-if="doc" v-model="commentsOpen" :doc-key="collabKey" :title="`Comments · ${doc.no}`" />
</template>
