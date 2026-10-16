<script setup lang="ts">
// Comments card of a document (forms, detail pages, list row actions): shows the latest comments
// and opens the comments side panel (rich text editor, replies, @e-mail mentions).
import { computed, ref } from 'vue'
import { ChatLineSquare, ChatRound } from '@element-plus/icons-vue'
import { commentPlainText, useDocCollabStore } from '../../stores/docCollabStore'
import DocCommentsDrawer from './DocCommentsDrawer.vue'
import { initials, timeAgo } from './collabUtils'

const props = defineProps<{ docKey: string }>()

const store = useDocCollabStore()
const all = computed(() => store.comments(props.docKey))
const latest = computed(() => [...all.value].slice(-3).reverse())
const open = ref(false)
</script>

<template>
  <section class="collab-card">
    <header class="collab-head">
      <span class="collab-head-icon"><el-icon><ChatLineSquare /></el-icon></span>
      Comments <span class="collab-count">{{ all.length }}</span>
      <el-button class="collab-head-btn" size="small" type="primary" plain :icon="ChatRound" @click="open = true">
        {{ all.length ? 'Open comments' : 'Add comment' }}
      </el-button>
    </header>

    <ul v-if="latest.length" class="preview-list">
      <li v-for="c in latest" :key="c.id" class="preview" role="button" tabindex="0" @click="open = true" @keydown.enter="open = true">
        <span class="preview-avatar">{{ initials(c.author) }}</span>
        <div class="preview-main">
          <div class="preview-head">
            <b>{{ c.author }}</b>
            <span v-if="c.parentId" class="preview-tag">reply</span>
            <span class="muted">{{ timeAgo(c.at) }}</span>
          </div>
          <div class="preview-text">{{ commentPlainText(c.text) || '(image)' }}</div>
        </div>
      </li>
    </ul>
    <p v-else class="collab-empty">No comments yet. Discuss this document and tag people with <b>@e-mail</b>.</p>

    <DocCommentsDrawer v-model="open" :doc-key="docKey" />
  </section>
</template>

<style scoped>
.collab-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 16px 18px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}
.collab-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  font-size: 14px;
  font-weight: 700;
  color: var(--gray-900);
}
.collab-head-btn {
  margin-left: auto;
}
.collab-head-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--brand-light);
  color: var(--brand);
}
.collab-count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--gray-100);
  color: var(--gray-700);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}
.collab-empty {
  margin: 4px 0 6px;
  font-size: 13px;
  color: var(--gray-400);
}
.muted {
  font-size: 12px;
  color: var(--gray-500);
}
.preview-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.preview {
  display: flex;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
}
.preview:hover,
.preview:focus-visible {
  background: var(--brand-light);
  outline: none;
}
.preview-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--gray-100);
  color: var(--gray-700);
  font-size: 11px;
  font-weight: 700;
}
.preview-main {
  min-width: 0;
  flex: 1;
}
.preview-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
  color: var(--gray-900);
}
.preview-tag {
  padding: 0 5px;
  border-radius: 4px;
  background: var(--gray-100);
  font-size: 10.5px;
  color: var(--gray-500);
}
.preview-text {
  overflow: hidden;
  font-size: 13px;
  color: var(--gray-700);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
