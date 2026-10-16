<script setup lang="ts">
// Comments side panel of a document: threaded comments (reply one level), rich text editor with
// "@" e-mail mentions, edit / delete own comments.
import { computed, nextTick, ref } from 'vue'
import DOMPurify from 'dompurify'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ChatRound, Close, Delete, EditPen, Promotion } from '@element-plus/icons-vue'
import { commentPlainText, useDocCollabStore, type DocComment } from '../../stores/docCollabStore'
import { useAccessStore } from '../../stores/accessStore'
import RichCommentEditor, { type MentionPerson } from './RichCommentEditor.vue'
import { initials, timeAgo } from './collabUtils'

const props = defineProps<{ docKey: string; title?: string }>()
const open = defineModel<boolean>({ default: false })

const store = useDocCollabStore()
const access = useAccessStore()

const all = computed(() => store.comments(props.docKey))
const threads = computed(() =>
  all.value.filter((c) => !c.parentId).map((c) => ({ ...c, replies: all.value.filter((r) => r.parentId === c.id) })),
)
const people = computed<MentionPerson[]>(() => access.users.filter((u) => u.active && u.email).map((u) => ({ email: u.email, name: u.name })))
const nameOf = (email: string) => access.users.find((u) => u.email.toLowerCase() === email.toLowerCase())?.name

/** Comment HTML comes from the editor but lives in browser storage: sanitize before rendering. */
const safe = (html: string) =>
  DOMPurify.sanitize(html, { ADD_ATTR: ['data-type', 'data-id', 'data-checked', 'target'], FORBID_TAGS: ['style', 'form', 'input'] })

// ---------- composer (new comment / reply / edit share one editor, like a chat box)
const html = ref('')
const editor = ref<InstanceType<typeof RichCommentEditor>>()
const replyTo = ref<DocComment | null>(null)
const editing = ref<DocComment | null>(null)
const threadOf = (c: DocComment) => (c.parentId ? all.value.find((x) => x.id === c.parentId) ?? c : c)

function startReply(c: DocComment) {
  editing.value = null
  replyTo.value = c
  const esc = (v: string) => v.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
  const tag = c.authorEmail && c.authorEmail !== store.myEmail()
    ? `<span data-type="mention" data-id="${esc(c.authorEmail)}" data-label="${esc(c.author)}">@${esc(c.authorEmail)}</span>&nbsp;`
    : ''
  html.value = tag ? `<p>${tag}</p>` : ''
  nextTick(() => editor.value?.focus())
}
function startEdit(c: DocComment) {
  replyTo.value = null
  editing.value = c
  html.value = c.text
  nextTick(() => editor.value?.focus())
}
function cancelCompose() {
  replyTo.value = null
  editing.value = null
  html.value = ''
}
function send() {
  if (!html.value || (!commentPlainText(html.value) && !html.value.includes('<img'))) return
  if (editing.value) {
    store.editComment(props.docKey, editing.value.id, html.value)
    ElMessage.success('Comment updated')
  } else {
    const mentions = store.addComment(props.docKey, html.value, replyTo.value ? threadOf(replyTo.value).id : undefined)
    if (mentions.length) ElMessage.success(`Notified ${mentions.map((e) => nameOf(e) ?? e).join(', ')}`)
  }
  cancelCompose()
}
async function remove(c: DocComment) {
  const n = all.value.filter((r) => r.parentId === c.id).length
  try {
    await ElMessageBox.confirm(n ? `Delete this comment and its ${n} repl${n > 1 ? 'ies' : 'y'}?` : 'Delete this comment?', 'Delete comment', {
      type: 'warning',
      confirmButtonText: 'Delete',
    })
  } catch {
    return
  }
  if (editing.value?.id === c.id) cancelCompose()
  store.deleteComment(props.docKey, c.id)
}
const mine = (c: DocComment) => c.author === store.me()
</script>

<template>
  <el-drawer v-model="open" size="50%" append-to-body class="comments-drawer" :title="title ?? 'Comments'" @closed="cancelCompose">
    <div class="cd">
      <div class="cd-list">
        <p v-if="!threads.length" class="cd-empty">No comments yet.</p>
        <article v-for="t in threads" :key="t.id" class="cd-thread">
          <div v-for="c in [t, ...t.replies]" :key="c.id" class="cd-comment" :class="{ 'is-reply': c.parentId, 'is-editing': editing?.id === c.id }">
            <span class="cd-avatar" :class="{ 'is-me': mine(c) }">{{ initials(c.author) }}</span>
            <div class="cd-main">
              <div class="cd-head">
                <b>{{ c.author }}</b>
                <span class="cd-time">{{ timeAgo(c.at) }}<template v-if="c.editedAt"> · edited</template></span>
                <span v-if="mine(c)" class="cd-actions">
                  <button type="button" title="Edit" @click="startEdit(c)"><el-icon><EditPen /></el-icon></button>
                  <button type="button" title="Delete" @click="remove(c)"><el-icon><Delete /></el-icon></button>
                </span>
              </div>
              <!-- eslint-disable-next-line vue/no-v-html -- sanitized with DOMPurify -->
              <div class="cd-body" v-html="safe(c.text)" />
              <button type="button" class="cd-reply" @click="startReply(c)"><el-icon><ChatRound /></el-icon> Reply</button>
            </div>
          </div>
        </article>
      </div>

      <div class="cd-compose">
        <div v-if="replyTo || editing" class="cd-context">
          <span v-if="editing">Editing your comment</span>
          <span v-else>Replying to <b>{{ replyTo!.author }}</b></span>
          <button type="button" title="Cancel" @click="cancelCompose"><el-icon><Close /></el-icon></button>
        </div>
        <RichCommentEditor ref="editor" v-model="html" :people="people" @submit="send" />
        <div class="cd-send">
          <span class="cd-hint">Type <b>@</b> to tag someone by e-mail · Ctrl + Enter to send</span>
          <el-button type="primary" :disabled="!html" @click="send">
            {{ editing ? 'Save comment' : replyTo ? 'Send reply' : 'Send Comment' }}
            <el-icon class="el-icon--right"><Promotion /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.cd {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.cd-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 2px 12px;
  border-top: 1px solid var(--border-soft);
}
.cd-empty {
  margin: 120px 0 0;
  font-weight: 600;
  color: var(--gray-500);
  text-align: center;
}
.cd-thread {
  display: grid;
  gap: 10px;
  padding: 14px 0;
  border-bottom: 1px solid var(--gray-100);
}
.cd-comment {
  display: flex;
  gap: 10px;
  padding: 4px;
  border-radius: 8px;
}
.cd-comment.is-reply {
  margin-left: 42px;
}
.cd-comment.is-editing {
  background: var(--brand-light);
}
.cd-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--gray-100);
  color: var(--gray-700);
  font-size: 12px;
  font-weight: 700;
}
.cd-comment.is-reply .cd-avatar {
  width: 26px;
  height: 26px;
  font-size: 10.5px;
}
.cd-avatar.is-me {
  background: var(--brand-light);
  color: var(--brand);
}
.cd-main {
  flex: 1;
  min-width: 0;
}
.cd-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  color: var(--gray-900);
}
.cd-time {
  font-size: 12px;
  color: var(--gray-500);
}
.cd-actions {
  display: flex;
  gap: 2px;
  margin-left: auto;
}
.cd-actions button,
.cd-context button {
  display: flex;
  padding: 4px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--gray-400);
  cursor: pointer;
}
.cd-actions button:hover,
.cd-context button:hover {
  background: var(--gray-100);
  color: var(--gray-900);
}
.cd-body {
  margin-top: 4px;
  padding: 8px 12px;
  border-radius: 0 10px 10px 10px;
  background: var(--gray-50, #f6f9fb);
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--gray-700);
  overflow-wrap: anywhere;
}
.cd-body :deep(p) {
  margin: 0 0 4px;
}
.cd-body :deep(p:last-child) {
  margin-bottom: 0;
}
.cd-body :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}
.cd-body :deep(ul[data-type='taskList']) {
  padding-left: 4px;
  list-style: none;
}
.cd-body :deep(ul[data-type='taskList'] li) {
  display: flex;
  gap: 6px;
}
.cd-body :deep(ul[data-type='taskList'] li[data-checked='true']::before) {
  content: '☑';
}
.cd-body :deep(ul[data-type='taskList'] li[data-checked='false']::before) {
  content: '☐';
}
.cd-body :deep(.mention) {
  padding: 0 4px;
  border-radius: 4px;
  background: var(--brand-light);
  color: var(--brand);
  font-weight: 600;
}
.cd-body :deep(a) {
  color: var(--brand);
}
.cd-reply {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  padding: 2px 4px;
  border: 0;
  border-radius: 4px;
  background: none;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--gray-500);
  cursor: pointer;
}
.cd-reply:hover {
  color: var(--brand);
}
.cd-compose {
  padding-top: 14px;
  border-top: 1px solid var(--border-soft);
}
.cd-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--brand-light);
  font-size: 12.5px;
  color: var(--gray-700);
}
.cd-send {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}
.cd-hint {
  font-size: 12px;
  color: var(--gray-500);
}
</style>
