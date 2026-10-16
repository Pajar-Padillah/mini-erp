<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Close, Document, EditPen, Message, Plus, Tickets } from '@element-plus/icons-vue'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import ChatAvatar from './ChatAvatar.vue'
import { listStamp } from './chatFormat'

const props = defineProps<{ conversationId: string }>()
const emit = defineEmits<{ close: []; 'add-members': []; 'open-chat': [id: string] }>()

const chat = useChatStore()
const auth = useAuthStore()
const router = useRouter()

const conv = computed(() => chat.find(props.conversationId))
const isGroup = computed(() => conv.value?.type === 'group')
const title = computed(() => (conv.value ? chat.title(conv.value) : ''))
const partner = computed(() => (conv.value && !isGroup.value ? chat.user(conv.value.memberIds[0]) : undefined))
const members = computed(() => (conv.value?.memberIds ?? []).map((id) => chat.user(id)).filter((u) => !!u))
const PRESENCE_LABEL = { online: 'Online', away: 'Away', offline: 'Offline' }

const shared = computed(() =>
  (conv.value?.messages ?? [])
    .filter((m) => !m.deleted && m.attachments?.length)
    .flatMap((m) => m.attachments!.map((a) => ({ ...a, at: m.at, by: m.senderId })))
    .reverse(),
)

const renaming = ref(false)
const newName = ref('')
watch(
  () => props.conversationId,
  () => (renaming.value = false),
)
function startRename() {
  newName.value = conv.value?.name ?? ''
  renaming.value = true
}
function saveRename() {
  if (conv.value) chat.renameGroup(conv.value.id, newName.value)
  renaming.value = false
}

function openShared(a: { kind: string; name: string; to?: string }) {
  if (a.kind === 'document' && a.to) router.push(a.to)
  else ElMessage.info(`Downloading "${a.name}" is not available in the mockup.`)
}

function messageMember(userId: string) {
  emit('open-chat', chat.startPersonal(userId))
}

async function leave() {
  if (!conv.value) return
  try {
    await ElMessageBox.confirm(`Leave "${title.value}"?`, 'Leave group', { confirmButtonText: 'Leave', cancelButtonText: 'Cancel', type: 'warning' })
    chat.leaveGroup(conv.value.id)
  } catch {
    // cancelled
  }
}
</script>

<template>
  <aside v-if="conv" class="chat-info">
    <header class="chat-info-head">
      <span>{{ isGroup ? 'Group info' : 'Contact info' }}</span>
      <button type="button" class="chat-icon-btn" aria-label="Close info" @click="emit('close')"><el-icon><Close /></el-icon></button>
    </header>

    <div class="chat-info-scroll">
      <div class="chat-info-hero">
        <ChatAvatar :name="title" :group="isGroup" :presence="partner?.presence" :size="72" />
        <div v-if="!renaming" class="chat-info-name">
          {{ title }}
          <button v-if="isGroup" type="button" class="chat-mini-btn" aria-label="Rename group" title="Rename group" @click="startRename">
            <el-icon><EditPen /></el-icon>
          </button>
        </div>
        <div v-else class="chat-info-rename">
          <el-input v-model="newName" size="small" maxlength="40" @keydown.enter="saveRename" @keydown.esc="renaming = false" />
          <el-button size="small" type="primary" @click="saveRename">Save</el-button>
        </div>
        <div class="chat-info-sub">
          <template v-if="partner">{{ partner.role }} · {{ PRESENCE_LABEL[partner.presence] }}</template>
          <template v-else>{{ (conv.memberIds.length + 1) }} members</template>
        </div>
      </div>

      <section v-if="partner" class="chat-info-section">
        <dl class="chat-info-details">
          <dt>Department</dt><dd>{{ partner.department }}</dd>
          <dt>Email</dt><dd>{{ partner.email }}</dd>
        </dl>
      </section>

      <section v-if="isGroup && conv.description" class="chat-info-section">
        <h5>Description</h5>
        <p class="chat-info-desc">{{ conv.description }}</p>
      </section>

      <section class="chat-info-section">
        <h5>Notifications</h5>
        <div class="chat-info-toggle">
          <span>Mute this chat</span>
          <el-switch :model-value="conv.muted" @change="chat.toggleMute(conv.id)" />
        </div>
        <div class="chat-info-toggle">
          <span>Pin to top</span>
          <el-switch :model-value="conv.pinned" @change="chat.togglePin(conv.id)" />
        </div>
      </section>

      <section v-if="isGroup" class="chat-info-section">
        <h5>
          Members · {{ conv.memberIds.length + 1 }}
          <button type="button" class="chat-info-link" @click="emit('add-members')"><el-icon><Plus /></el-icon> Add</button>
        </h5>
        <ul class="chat-info-members">
          <li>
            <ChatAvatar :name="auth.user?.name ?? 'You'" presence="online" :size="32" />
            <span class="chat-info-member-text">
              <span class="chat-info-member-name">{{ auth.user?.name ?? 'You' }} <em>(You)</em></span>
              <span class="chat-info-member-role">Admin</span>
            </span>
          </li>
          <li v-for="u in members" :key="u!.id">
            <ChatAvatar :name="u!.name" :presence="u!.presence" :size="32" />
            <span class="chat-info-member-text">
              <span class="chat-info-member-name">{{ u!.name }}</span>
              <span class="chat-info-member-role">{{ u!.role }}</span>
            </span>
            <button type="button" class="chat-mini-btn" :title="`Message ${u!.name}`" :aria-label="`Message ${u!.name}`" @click="messageMember(u!.id)">
              <el-icon><Message /></el-icon>
            </button>
          </li>
        </ul>
      </section>

      <section class="chat-info-section">
        <h5>Shared files & documents · {{ shared.length }}</h5>
        <ul v-if="shared.length" class="chat-info-files">
          <li v-for="(a, i) in shared" :key="`${a.name}-${i}`" @click="openShared(a)">
            <span class="chat-attachment-icon" :class="`is-${a.kind}`"><el-icon><component :is="a.kind === 'document' ? Tickets : Document" /></el-icon></span>
            <span class="chat-attachment-text">
              <span class="chat-attachment-name">{{ a.name }}</span>
              <span class="chat-attachment-meta">{{ a.meta }} · {{ listStamp(a.at) }}</span>
            </span>
          </li>
        </ul>
        <p v-else class="chat-info-desc">Nothing shared yet.</p>
      </section>

      <section v-if="isGroup" class="chat-info-section">
        <button type="button" class="chat-info-danger" @click="leave"><el-icon><Close /></el-icon> Leave group</button>
      </section>
    </div>
  </aside>
</template>
