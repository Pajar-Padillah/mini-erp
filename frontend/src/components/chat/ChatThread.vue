<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowDown, Bell, ChatDotSquare, Close, CopyDocument, Delete, Document, EditPen, Files, InfoFilled, MoreFilled,
  MuteNotification, Paperclip, Plus, Position, Search, Star, StarFilled, Tickets,
} from '@element-plus/icons-vue'
import { ME, SHAREABLE_DOCUMENTS, useChatStore, type ChatAttachment, type ChatMessage } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import ChatAvatar from './ChatAvatar.vue'
import { dayKey, dayLabel, formatBytes, timeOf } from './chatFormat'

const props = defineProps<{ conversationId: string; infoOpen: boolean }>()
const emit = defineEmits<{ 'toggle-info': []; 'add-members': [] }>()

const chat = useChatStore()
const auth = useAuthStore()
const router = useRouter()

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '👀']
const EMOJIS = ['😀', '😁', '😂', '🤣', '😊', '😍', '😎', '🤔', '😅', '😢', '😡', '👍', '👎', '👏', '🙏', '💪', '🎉', '🔥', '✅', '❌', '⚠️', '📌', '📎', '💰', '📦', '🚚', '📈', '📉', '⏰', '☕']

const conv = computed(() => chat.find(props.conversationId))
const isGroup = computed(() => conv.value?.type === 'group')
const title = computed(() => (conv.value ? chat.title(conv.value) : ''))
const partner = computed(() => (conv.value && !isGroup.value ? chat.user(conv.value.memberIds[0]) : undefined))

const subtitle = computed(() => {
  const c = conv.value
  if (!c) return ''
  if (isGroup.value) {
    const online = c.memberIds.filter((id) => chat.user(id)?.presence === 'online').length
    return `${c.memberIds.length + 1} members · ${online} online`
  }
  const p = partner.value
  if (!p) return ''
  const status = { online: 'Online', away: 'Away', offline: 'Offline' }[p.presence]
  return `${p.role} · ${status}`
})

const typingName = computed(() => {
  const id = chat.typing[props.conversationId]
  return id ? chat.user(id)?.name.split(' ')[0] : undefined
})

// ---------- Search within the conversation ----------
const searchOpen = ref(false)
const searchText = ref('')
const searchInput = ref<{ focus: () => void } | null>(null)
async function toggleSearch() {
  searchOpen.value = !searchOpen.value
  searchText.value = ''
  if (searchOpen.value) {
    await nextTick()
    searchInput.value?.focus()
  }
}
const matches = (m: ChatMessage, q: string) =>
  `${m.text} ${(m.attachments ?? []).map((a) => `${a.name} ${a.meta}`).join(' ')}`.toLowerCase().includes(q)

// ---------- Messages grouped by day, with sender runs collapsed ----------
interface Row {
  key: string
  kind: 'day' | 'system' | 'message'
  label?: string
  message?: ChatMessage
  mine?: boolean
  showSender?: boolean
  showAvatar?: boolean
}

const rows = computed<Row[]>(() => {
  const c = conv.value
  if (!c) return []
  const q = searchText.value.trim().toLowerCase()
  const list = q ? c.messages.filter((m) => m.senderId !== 'system' && !m.deleted && matches(m, q)) : c.messages
  const out: Row[] = []
  let lastDay = ''
  list.forEach((m, i) => {
    const day = dayKey(m.at)
    if (day !== lastDay) {
      out.push({ key: `day-${day}`, kind: 'day', label: dayLabel(m.at) })
      lastDay = day
    }
    if (m.senderId === 'system') {
      out.push({ key: m.id, kind: 'system', label: m.text })
      return
    }
    const prev = list[i - 1]
    const next = list[i + 1]
    const closeTo = (other?: ChatMessage) =>
      !!other && other.senderId === m.senderId && dayKey(other.at) === day && Math.abs(Date.parse(other.at) - Date.parse(m.at)) < 5 * 60_000
    const mine = m.senderId === ME
    out.push({
      key: m.id,
      kind: 'message',
      message: m,
      mine,
      showSender: isGroup.value && !mine && !closeTo(prev),
      showAvatar: !mine && !closeTo(next),
    })
  })
  return out
})

const sharedFilesCount = computed(() => (conv.value?.messages ?? []).reduce((n, m) => n + (m.attachments?.length ?? 0), 0))

function senderName(id: string) {
  if (id === ME) return 'You'
  return chat.user(id)?.name ?? 'Unknown'
}

function isRead(m: ChatMessage) {
  return !!conv.value?.readAt && conv.value.readAt >= m.at
}

function replyTarget(m: ChatMessage) {
  return m.replyToId ? conv.value?.messages.find((x) => x.id === m.replyToId) : undefined
}

function preview(m?: ChatMessage) {
  if (!m) return 'Original message not found'
  if (m.deleted) return 'This message was deleted'
  if (m.text) return m.text
  return (m.attachments ?? []).map((a) => a.name).join(', ')
}

// ---------- Scrolling ----------
const scroller = ref<HTMLElement>()
const atBottom = ref(true)
function scrollToBottom(smooth = false) {
  const el = scroller.value
  if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
}
function onScroll() {
  const el = scroller.value
  if (el) atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}
watch(
  () => props.conversationId,
  async () => {
    searchOpen.value = false
    searchText.value = ''
    replyTo.value = null
    editing.value = null
    draft.value = ''
    pending.value = []
    await nextTick()
    scrollToBottom()
    focusComposer()
  },
  { immediate: true },
)
watch(
  () => [conv.value?.messages.length, typingName.value],
  async () => {
    const stick = atBottom.value
    await nextTick()
    if (stick || conv.value?.messages[conv.value.messages.length - 1]?.senderId === ME) scrollToBottom(true)
  },
)

function jumpTo(id: string) {
  searchText.value = ''
  searchOpen.value = false
  nextTick(() => {
    const el = scroller.value?.querySelector<HTMLElement>(`[data-mid="${id}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el?.classList.add('is-flash')
    window.setTimeout(() => el?.classList.remove('is-flash'), 1400)
  })
}

// ---------- Composer ----------
const draft = ref('')
const pending = ref<ChatAttachment[]>([])
const replyTo = ref<ChatMessage | null>(null)
const editing = ref<ChatMessage | null>(null)
const composer = ref<{ focus: () => void } | null>(null)
const fileInput = ref<HTMLInputElement>()
const docPickerOpen = ref(false)
const emojiOpen = ref(false)
const plusOpen = ref(false)

const canSend = computed(() => draft.value.trim().length > 0 || pending.value.length > 0)

function focusComposer() {
  nextTick(() => composer.value?.focus())
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  } else if (e.key === 'Escape') {
    replyTo.value = null
    if (editing.value) cancelEdit()
  } else if (e.key === 'ArrowUp' && !draft.value) {
    // Edit your last message, like most chat apps.
    const last = [...(conv.value?.messages ?? [])].reverse().find((m) => m.senderId === ME && !m.deleted && m.text)
    if (last) {
      e.preventDefault()
      startEdit(last)
    }
  }
}

function submit() {
  if (editing.value) {
    chat.editMessage(props.conversationId, editing.value.id, draft.value)
    cancelEdit()
    return
  }
  if (!canSend.value) return
  chat.send(props.conversationId, draft.value, pending.value, replyTo.value?.id)
  draft.value = ''
  pending.value = []
  replyTo.value = null
  focusComposer()
}

function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  for (const f of Array.from(input.files ?? [])) {
    pending.value.push({ kind: 'file', name: f.name, meta: formatBytes(f.size) })
  }
  input.value = ''
  focusComposer()
}

function attachDocument(doc: ChatAttachment) {
  if (!pending.value.some((a) => a.name === doc.name)) pending.value.push({ ...doc })
  docPickerOpen.value = false
  focusComposer()
}

function insertEmoji(emoji: string) {
  draft.value += emoji
  emojiOpen.value = false
  focusComposer()
}

function openAttachment(a: ChatAttachment) {
  if (a.kind === 'document' && a.to) router.push(a.to)
  else ElMessage.info(`Downloading "${a.name}" is not available in the mockup.`)
}

// ---------- Message actions ----------
function startReply(m: ChatMessage) {
  editing.value = null
  replyTo.value = m
  focusComposer()
}

function startEdit(m: ChatMessage) {
  replyTo.value = null
  editing.value = m
  draft.value = m.text
  focusComposer()
}

function cancelEdit() {
  editing.value = null
  draft.value = ''
}

async function copyText(m: ChatMessage) {
  try {
    await navigator.clipboard.writeText(m.text)
    ElMessage.success('Message copied')
  } catch {
    ElMessage.warning('Copy is not available in this browser')
  }
}

async function remove(m: ChatMessage) {
  try {
    await ElMessageBox.confirm('Delete this message for everyone?', 'Delete message', {
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      type: 'warning',
    })
    chat.deleteMessage(props.conversationId, m.id)
  } catch {
    // cancelled
  }
}

function reactors(userIds: string[]) {
  return userIds.map((id) => (id === ME ? 'You' : chat.user(id)?.name.split(' ')[0] ?? id)).join(', ')
}

// ---------- Conversation menu ----------
async function onMenu(command: string) {
  const c = conv.value
  if (!c) return
  if (command === 'pin') chat.togglePin(c.id)
  else if (command === 'mute') chat.toggleMute(c.id)
  else if (command === 'unread') chat.markUnread(c.id)
  else if (command === 'add') emit('add-members')
  else if (command === 'clear' || command === 'delete' || command === 'leave') {
    const copy = {
      clear: ['Clear all messages in this chat?', 'Clear history', 'Clear'],
      delete: ['Delete this chat from your list?', 'Delete chat', 'Delete'],
      leave: [`Leave "${title.value}"? You will no longer receive its messages.`, 'Leave group', 'Leave'],
    }[command]!
    try {
      await ElMessageBox.confirm(copy[0], copy[1], { confirmButtonText: copy[2], cancelButtonText: 'Cancel', type: 'warning' })
      if (command === 'clear') chat.clearHistory(c.id)
      else chat.deleteConversation(c.id)
    } catch {
      // cancelled
    }
  }
}
</script>

<template>
  <section v-if="conv" class="chat-thread">
    <!-- Header -->
    <header class="chat-thread-head">
      <ChatAvatar :name="title" :group="isGroup" :presence="partner?.presence" :size="40" />
      <div class="chat-thread-title">
        <div class="chat-thread-name">
          {{ title }}
          <el-icon v-if="conv.muted" class="chat-thread-flag" title="Muted"><MuteNotification /></el-icon>
        </div>
        <div class="chat-thread-sub">
          <template v-if="typingName">
            <span class="chat-typing-text">{{ typingName }} is typing…</span>
          </template>
          <template v-else>{{ subtitle }}</template>
        </div>
      </div>
      <div class="chat-thread-actions">
        <el-tooltip content="Search in chat" placement="bottom">
          <button type="button" class="chat-icon-btn" :class="{ 'is-on': searchOpen }" aria-label="Search in chat" @click="toggleSearch">
            <el-icon><Search /></el-icon>
          </button>
        </el-tooltip>
        <el-tooltip :content="conv.pinned ? 'Unpin chat' : 'Pin chat'" placement="bottom">
          <button type="button" class="chat-icon-btn" :class="{ 'is-on': conv.pinned }" :aria-label="conv.pinned ? 'Unpin chat' : 'Pin chat'" @click="chat.togglePin(conv.id)">
            <el-icon><component :is="conv.pinned ? StarFilled : Star" /></el-icon>
          </button>
        </el-tooltip>
        <el-tooltip content="Chat info" placement="bottom">
          <button type="button" class="chat-icon-btn" :class="{ 'is-on': infoOpen }" aria-label="Chat info" @click="emit('toggle-info')">
            <el-icon><InfoFilled /></el-icon>
          </button>
        </el-tooltip>
        <el-dropdown trigger="click" placement="bottom-end" @command="onMenu">
          <button type="button" class="chat-icon-btn" aria-label="More actions"><el-icon><MoreFilled /></el-icon></button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="mute" :icon="conv.muted ? Bell : MuteNotification">
                {{ conv.muted ? 'Unmute notifications' : 'Mute notifications' }}
              </el-dropdown-item>
              <el-dropdown-item command="unread" :icon="ChatDotSquare">Mark as unread</el-dropdown-item>
              <el-dropdown-item v-if="isGroup" command="add" :icon="Plus">Add members</el-dropdown-item>
              <el-dropdown-item command="clear" :icon="Delete" divided>Clear history</el-dropdown-item>
              <el-dropdown-item v-if="isGroup" command="leave" :icon="Close" class="chat-menu-danger">Leave group</el-dropdown-item>
              <el-dropdown-item v-else command="delete" :icon="Close" class="chat-menu-danger">Delete chat</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <div v-if="searchOpen" class="chat-thread-search">
      <el-input ref="searchInput" v-model="searchText" :prefix-icon="Search" placeholder="Search messages and files in this chat…" clearable @keydown.esc="toggleSearch" />
      <span v-if="searchText" class="chat-thread-search-count">{{ rows.filter((r) => r.kind === 'message').length }} found</span>
    </div>

    <!-- Messages -->
    <div ref="scroller" class="chat-thread-body" @scroll="onScroll">
      <div v-if="!conv.messages.length" class="chat-thread-empty">
        <ChatAvatar :name="title" :group="isGroup" :size="64" />
        <div class="chat-thread-empty-title">Say hello to {{ title }}</div>
        <div class="chat-thread-empty-sub">Messages stay in this browser (mockup).</div>
        <div class="chat-thread-starters">
          <button v-for="s in ['Halo! 👋', 'Ada waktu sebentar?', 'Tolong cek dokumen ini ya']" :key="s" type="button" class="dash-chip" @click="draft = s; focusComposer()">{{ s }}</button>
        </div>
      </div>
      <div v-else-if="searchText && !rows.some((r) => r.kind === 'message')" class="chat-thread-empty">
        <div class="chat-thread-empty-sub">No messages match "{{ searchText }}".</div>
      </div>

      <template v-for="row in rows" :key="row.key">
        <div v-if="row.kind === 'day'" class="chat-day"><span>{{ row.label }}</span></div>
        <div v-else-if="row.kind === 'system'" class="chat-system">{{ row.label }}</div>
        <div
          v-else-if="row.message"
          class="chat-msg"
          :class="{ 'is-mine': row.mine, 'is-run': !row.showAvatar && !row.mine }"
          :data-mid="row.message.id"
        >
          <div v-if="!row.mine" class="chat-msg-avatar">
            <ChatAvatar v-if="row.showAvatar" :name="senderName(row.message.senderId)" :size="30" />
          </div>
          <div class="chat-msg-stack">
            <div v-if="row.showSender" class="chat-msg-sender" :class="`tone-text`">{{ senderName(row.message.senderId) }}</div>
            <div class="chat-bubble-wrap">
              <div class="chat-bubble" :class="{ 'is-deleted': row.message.deleted }">
                <template v-if="row.message.deleted">
                  <el-icon><Close /></el-icon> This message was deleted
                </template>
                <template v-else>
                  <button v-if="row.message.replyToId" type="button" class="chat-quote" @click="jumpTo(row.message.replyToId)">
                    <span class="chat-quote-name">{{ senderName(replyTarget(row.message)?.senderId ?? '') }}</span>
                    <span class="chat-quote-text">{{ preview(replyTarget(row.message)) }}</span>
                  </button>
                  <div v-for="a in row.message.attachments ?? []" :key="a.name" class="chat-attachment" :class="`is-${a.kind}`" @click="openAttachment(a)">
                    <span class="chat-attachment-icon"><el-icon><component :is="a.kind === 'document' ? Tickets : Document" /></el-icon></span>
                    <span class="chat-attachment-text">
                      <span class="chat-attachment-name">{{ a.name }}</span>
                      <span class="chat-attachment-meta">{{ a.meta }}{{ a.kind === 'document' ? ' · Open in ERP' : '' }}</span>
                    </span>
                  </div>
                  <div v-if="row.message.text" class="chat-text">{{ row.message.text }}</div>
                </template>
                <span class="chat-meta">
                  <span v-if="row.message.edited && !row.message.deleted">edited ·</span>
                  {{ timeOf(row.message.at) }}
                  <span v-if="row.mine && !row.message.deleted" class="chat-ticks" :class="{ 'is-read': isRead(row.message) }" :title="isRead(row.message) ? 'Read' : 'Sent'">
                    {{ isRead(row.message) ? '✓✓' : '✓' }}
                  </span>
                </span>
              </div>

              <!-- Hover actions -->
              <div v-if="!row.message.deleted" class="chat-msg-actions">
                <el-popover trigger="click" placement="top" :width="236" popper-class="chat-react-popper">
                  <template #reference>
                    <button type="button" class="chat-mini-btn" title="React" aria-label="React">😊</button>
                  </template>
                  <div class="chat-react-row">
                    <button v-for="e in QUICK_REACTIONS" :key="e" type="button" @click="chat.toggleReaction(conversationId, row.message.id, e)">{{ e }}</button>
                  </div>
                </el-popover>
                <button type="button" class="chat-mini-btn" title="Reply" aria-label="Reply" @click="startReply(row.message)">↩</button>
                <button v-if="row.message.text" type="button" class="chat-mini-btn" title="Copy" aria-label="Copy" @click="copyText(row.message)">
                  <el-icon><CopyDocument /></el-icon>
                </button>
                <template v-if="row.mine">
                  <button v-if="row.message.text" type="button" class="chat-mini-btn" title="Edit" aria-label="Edit" @click="startEdit(row.message)">
                    <el-icon><EditPen /></el-icon>
                  </button>
                  <button type="button" class="chat-mini-btn is-danger" title="Delete" aria-label="Delete" @click="remove(row.message)">
                    <el-icon><Delete /></el-icon>
                  </button>
                </template>
              </div>
            </div>

            <div v-if="Object.keys(row.message.reactions).length" class="chat-reactions">
              <button
                v-for="(users, emoji) in row.message.reactions"
                :key="emoji"
                type="button"
                class="chat-reaction"
                :class="{ 'is-mine': users.includes('me') }"
                :title="reactors(users)"
                @click="chat.toggleReaction(conversationId, row.message.id, String(emoji))"
              >
                {{ emoji }} <span>{{ users.length }}</span>
              </button>
            </div>
          </div>
        </div>
      </template>

      <div v-if="typingName && !searchText" class="chat-msg">
        <div class="chat-msg-avatar"><ChatAvatar :name="chat.user(chat.typing[conversationId] ?? '')?.name ?? ''" :size="30" /></div>
        <div class="chat-bubble chat-typing" aria-label="typing"><span /><span /><span /></div>
      </div>
    </div>

    <button v-if="!atBottom" type="button" class="chat-jump" @click="scrollToBottom(true)">
      <el-icon><ArrowDown /></el-icon> Latest
    </button>

    <!-- Composer -->
    <footer class="chat-composer">
      <div v-if="replyTo || editing" class="chat-composer-context">
        <el-icon><component :is="editing ? EditPen : Position" /></el-icon>
        <div class="chat-composer-context-text">
          <span class="chat-composer-context-title">{{ editing ? 'Editing message' : `Replying to ${senderName(replyTo!.senderId)}` }}</span>
          <span class="chat-composer-context-preview">{{ preview(editing ?? replyTo ?? undefined) }}</span>
        </div>
        <button type="button" class="chat-mini-btn" aria-label="Cancel" @click="editing ? cancelEdit() : (replyTo = null)"><el-icon><Close /></el-icon></button>
      </div>

      <div v-if="pending.length" class="chat-composer-files">
        <span v-for="(a, i) in pending" :key="a.name" class="chat-composer-file">
          <el-icon><component :is="a.kind === 'document' ? Tickets : Paperclip" /></el-icon>
          {{ a.name }}
          <button type="button" aria-label="Remove attachment" @click="pending.splice(i, 1)"><el-icon><Close /></el-icon></button>
        </span>
      </div>

      <div class="chat-composer-row">
        <el-popover v-model:visible="plusOpen" trigger="click" placement="top-start" :width="220" popper-class="chat-plus-popper">
          <template #reference>
            <button type="button" class="chat-composer-btn" aria-label="Attach" :disabled="!!editing"><el-icon><Plus /></el-icon></button>
          </template>
          <div class="chat-plus-menu">
            <button type="button" @click="plusOpen = false; fileInput?.click()"><el-icon><Paperclip /></el-icon> Attach file</button>
            <button type="button" @click="plusOpen = false; docPickerOpen = true"><el-icon><Files /></el-icon> Share ERP document</button>
          </div>
        </el-popover>
        <input ref="fileInput" type="file" multiple hidden @change="onFiles" />

        <el-input
          ref="composer"
          v-model="draft"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 5 }"
          resize="none"
          :placeholder="editing ? 'Edit your message…' : `Message ${title}…`"
          class="chat-composer-input"
          @keydown="onKeydown"
        />

        <el-popover v-model:visible="emojiOpen" trigger="click" placement="top-end" :width="264" popper-class="chat-emoji-popper">
          <template #reference>
            <button type="button" class="chat-composer-btn" aria-label="Emoji">😊</button>
          </template>
          <div class="chat-emoji-grid">
            <button v-for="e in EMOJIS" :key="e" type="button" @click="insertEmoji(e)">{{ e }}</button>
          </div>
        </el-popover>

        <button type="button" class="chat-send" :disabled="!editing && !canSend" @click="submit">
          {{ editing ? 'Save' : 'Send' }}
          <el-icon><Position /></el-icon>
        </button>
      </div>
      <div class="chat-composer-hint">
        <b>Enter</b> to send · <b>Shift+Enter</b> new line · <b>↑</b> edit last message · signed in as {{ auth.user?.name ?? 'you' }}
        <span v-if="sharedFilesCount"> · {{ sharedFilesCount }} shared item{{ sharedFilesCount > 1 ? 's' : '' }}</span>
      </div>
    </footer>

    <!-- Share ERP document -->
    <el-dialog v-model="docPickerOpen" title="Share ERP document" width="440px" append-to-body>
      <ul class="chat-doc-list">
        <li v-for="d in SHAREABLE_DOCUMENTS" :key="d.name">
          <button type="button" class="chat-doc-item" @click="attachDocument(d)">
            <span class="chat-attachment-icon"><el-icon><Tickets /></el-icon></span>
            <span class="chat-attachment-text">
              <span class="chat-attachment-name">{{ d.name }}</span>
              <span class="chat-attachment-meta">{{ d.meta }}</span>
            </span>
            <el-icon><Plus /></el-icon>
          </button>
        </li>
      </ul>
    </el-dialog>
  </section>
</template>
