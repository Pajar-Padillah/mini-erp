<script setup lang="ts">
// Internal chat (static mockup): personal and group conversations, stored in this browser.
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { ChatLineRound, EditPen, MuteNotification, Plus, RefreshLeft, Search, StarFilled, User } from '@element-plus/icons-vue'
import { ME, lastMessage, useChatStore, type Conversation } from '../stores/chatStore'
import ChatAvatar from '../components/chat/ChatAvatar.vue'
import ChatThread from '../components/chat/ChatThread.vue'
import ChatInfoPanel from '../components/chat/ChatInfoPanel.vue'
import NewChatDialog from '../components/chat/NewChatDialog.vue'
import { listStamp } from '../components/chat/chatFormat'

const chat = useChatStore()

type Filter = 'all' | 'personal' | 'group' | 'unread'
const filter = ref<Filter>('all')
const query = ref('')
const infoOpen = ref(false)
const dialogOpen = ref(false)
const dialogMode = ref<'personal' | 'group' | 'add'>('personal')

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'personal', label: 'Personal' },
  { value: 'group', label: 'Group' },
  { value: 'unread', label: 'Unread' },
]

function countFor(f: Filter) {
  if (f === 'all') return chat.conversations.length
  if (f === 'unread') return chat.conversations.filter((c) => c.unread > 0).length
  return chat.conversations.filter((c) => c.type === f).length
}

const list = computed(() => {
  const q = query.value.trim().toLowerCase()
  return chat.sorted
    .filter((c) => (filter.value === 'all' ? true : filter.value === 'unread' ? c.unread > 0 : c.type === filter.value))
    .filter((c) => {
      if (!q) return true
      const members = c.memberIds.map((id) => chat.user(id)?.name ?? '').join(' ')
      const text = c.messages.map((m) => m.text).join(' ')
      return `${chat.title(c)} ${members} ${text}`.toLowerCase().includes(q)
    })
})

function previewOf(c: Conversation) {
  if (chat.typing[c.id]) return `${chat.user(chat.typing[c.id]!)?.name.split(' ')[0]} is typing…`
  const m = lastMessage(c)
  if (!m) return 'No messages yet'
  if (m.senderId === 'system') return m.text
  const who = m.senderId === ME ? 'You: ' : c.type === 'group' ? `${chat.user(m.senderId)?.name.split(' ')[0]}: ` : ''
  if (m.deleted) return `${who}This message was deleted`
  const body = m.text || (m.attachments ?? []).map((a) => `📎 ${a.name}`).join(', ')
  return `${who}${body}`
}

function open(id: string) {
  chat.open(id)
}

// Open the most recent chat when arriving with nothing selected (desktop feel).
function ensureSelection() {
  if (!chat.activeId && window.innerWidth > 900 && chat.sorted.length) chat.open(chat.sorted[0].id)
}
ensureSelection()
onMounted(() => chat.setViewing(true))
onActivated(() => {
  ensureSelection()
  chat.setViewing(true)
})
onDeactivated(() => chat.setViewing(false))
onBeforeUnmount(() => chat.setViewing(false))

function newChat(mode: 'personal' | 'group') {
  dialogMode.value = mode
  dialogOpen.value = true
}

function addMembers() {
  dialogMode.value = 'add'
  dialogOpen.value = true
}

function onDialogDone(conversationId?: string, pickedIds?: string[]) {
  if (dialogMode.value === 'add' && chat.activeId && pickedIds) chat.addMembers(chat.activeId, pickedIds)
  else if (conversationId) infoOpen.value = false
}

async function resetDemo() {
  try {
    await ElMessageBox.confirm('Restore the sample conversations? Your messages in this browser will be removed.', 'Reset chat demo', {
      confirmButtonText: 'Reset',
      cancelButtonText: 'Cancel',
      type: 'warning',
    })
    chat.resetDemo()
    ensureSelection()
  } catch {
    // cancelled
  }
}

const excludeForAdd = computed(() => (dialogMode.value === 'add' ? chat.active?.memberIds ?? [] : []))
</script>

<template>
  <div class="chat-page" :class="{ 'has-active': !!chat.active, 'has-info': infoOpen && !!chat.active }">
    <!-- Conversation list -->
    <aside class="chat-list">
      <header class="chat-list-head">
        <div>
          <h2>Chat</h2>
          <span class="chat-list-sub">Internal messages · {{ chat.totalUnread }} unread</span>
        </div>
        <el-dropdown trigger="click" placement="bottom-end" @command="newChat">
          <el-button type="primary" :icon="EditPen">New</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="personal" :icon="User">New personal chat</el-dropdown-item>
              <el-dropdown-item command="group" :icon="ChatLineRound">New group</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>

      <el-input v-model="query" :prefix-icon="Search" placeholder="Search chats, people or messages…" clearable class="chat-list-search" />

      <div class="chat-filters" role="tablist" aria-label="Filter chats">
        <button
          v-for="f in FILTERS"
          :key="f.value"
          type="button"
          role="tab"
          class="chat-filter"
          :class="{ 'is-active': filter === f.value }"
          :aria-selected="filter === f.value"
          @click="filter = f.value"
        >
          {{ f.label }}
          <span class="chat-filter-count">{{ countFor(f.value) }}</span>
        </button>
      </div>

      <ul class="chat-items">
        <li v-for="c in list" :key="c.id">
          <button type="button" class="chat-item" :class="{ 'is-active': c.id === chat.activeId, 'is-unread': c.unread > 0 }" @click="open(c.id)">
            <ChatAvatar
              :name="chat.title(c)"
              :group="c.type === 'group'"
              :presence="c.type === 'personal' ? chat.user(c.memberIds[0])?.presence : undefined"
              :size="44"
            />
            <span class="chat-item-body">
              <span class="chat-item-top">
                <span class="chat-item-name">{{ chat.title(c) }}</span>
                <span class="chat-item-time">{{ listStamp(lastMessage(c)?.at) }}</span>
              </span>
              <span class="chat-item-bottom">
                <span class="chat-item-preview" :class="{ 'is-typing': !!chat.typing[c.id] }">{{ previewOf(c) }}</span>
                <span class="chat-item-flags">
                  <el-icon v-if="c.muted" title="Muted"><MuteNotification /></el-icon>
                  <el-icon v-if="c.pinned" class="is-pin" title="Pinned"><StarFilled /></el-icon>
                  <span v-if="c.unread" class="chat-item-badge" :class="{ 'is-muted': c.muted }">{{ c.unread }}</span>
                </span>
              </span>
            </span>
          </button>
        </li>
        <li v-if="!list.length" class="chat-items-empty">
          <template v-if="query">No chats match "{{ query }}".</template>
          <template v-else>No conversations here yet.</template>
          <el-button size="small" :icon="Plus" @click="newChat(filter === 'group' ? 'group' : 'personal')">Start a chat</el-button>
        </li>
      </ul>

      <footer class="chat-list-foot">
        <button type="button" class="chat-info-link" @click="resetDemo"><el-icon><RefreshLeft /></el-icon> Reset demo conversations</button>
      </footer>
    </aside>

    <!-- Thread -->
    <ChatThread
      v-if="chat.active"
      :key="chat.active.id"
      :conversation-id="chat.active.id"
      :info-open="infoOpen"
      class="chat-main"
      @toggle-info="infoOpen = !infoOpen"
      @add-members="addMembers"
    />
    <section v-else class="chat-main chat-placeholder">
      <span class="chat-placeholder-icon"><el-icon><ChatLineRound /></el-icon></span>
      <h3>Select a conversation</h3>
      <p>Pick a chat on the left, or start a new personal or group chat.</p>
      <div class="chat-placeholder-actions">
        <el-button :icon="User" @click="newChat('personal')">New personal chat</el-button>
        <el-button type="primary" :icon="ChatLineRound" @click="newChat('group')">New group</el-button>
      </div>
    </section>

    <ChatInfoPanel
      v-if="infoOpen && chat.active"
      :conversation-id="chat.active.id"
      @close="infoOpen = false"
      @add-members="addMembers"
      @open-chat="infoOpen = false"
    />

    <!-- Mobile: back to the list -->
    <button v-if="chat.active" type="button" class="chat-back" @click="chat.activeId = null">← Chats</button>

    <NewChatDialog v-model="dialogOpen" :mode="dialogMode" :exclude-ids="excludeForAdd" @done="onDialogDone" />
  </div>
</template>
