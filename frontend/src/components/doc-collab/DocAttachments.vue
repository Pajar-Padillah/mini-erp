<script setup lang="ts">
// Attachments card of a document (forms, detail pages, list row actions). Keyed by docCollabStore keys.
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Document, Download, Paperclip, Picture, UploadFilled, View } from '@element-plus/icons-vue'
import { MAX_STORED_FILE, useDocCollabStore, type DocAttachment } from '../../stores/docCollabStore'
import { timeAgo } from './collabUtils'

const props = defineProps<{ docKey: string }>()

const store = useDocCollabStore()
const attachments = computed(() => store.attachments(props.docKey))

const dragOver = ref(false)
const fileInput = ref<HTMLInputElement>()
async function addFiles(list: FileList | null | undefined) {
  if (!list?.length) return
  const files = [...list]
  for (const f of files) await store.addAttachment(props.docKey, f)
  const big = files.filter((f) => f.size > MAX_STORED_FILE)
  ElMessage.success(`${files.length} file(s) attached`)
  if (big.length) ElMessage.warning(`${big.map((f) => f.name).join(', ')}: over 1 MB, kept as a reference only (no preview in the mockup).`)
  if (fileInput.value) fileInput.value.value = ''
}
function onDrop(e: DragEvent) {
  dragOver.value = false
  addFiles(e.dataTransfer?.files)
}
const isImage = (a: DocAttachment) => a.type.startsWith('image/')
function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
function preview(a: DocAttachment) {
  const w = window.open()
  if (!w) return ElMessage.warning('Allow pop-ups to preview the file.')
  w.document.write(isImage(a) ? `<img src="${a.dataUrl}" style="max-width:100%">` : `<iframe src="${a.dataUrl}" style="border:0;width:100%;height:100vh"></iframe>`)
  w.document.title = a.name
}
function download(a: DocAttachment) {
  const link = document.createElement('a')
  link.href = a.dataUrl
  link.download = a.name
  link.click()
}
async function removeAttachment(a: DocAttachment) {
  try {
    await ElMessageBox.confirm(`Remove ${a.name}?`, 'Remove attachment', { type: 'warning', confirmButtonText: 'Remove' })
  } catch {
    return
  }
  store.deleteAttachment(props.docKey, a.id)
}
</script>

<template>
  <section class="collab-card">
    <header class="collab-head">
      <span class="collab-head-icon"><el-icon><Paperclip /></el-icon></span>
      Attachments <span class="collab-count">{{ attachments.length }}</span>
    </header>
    <div
      class="drop-zone"
      :class="{ 'is-over': dragOver }"
      role="button"
      tabindex="0"
      @click="fileInput?.click()"
      @keydown.enter.prevent="fileInput?.click()"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <el-icon class="drop-icon"><UploadFilled /></el-icon>
      <div><b>Drop files here</b> or click to browse</div>
      <div class="muted">PDF, images, Excel, Word… (preview available up to 1 MB in the mockup)</div>
      <input ref="fileInput" type="file" multiple hidden @change="addFiles(($event.target as HTMLInputElement).files)" />
    </div>

    <ul v-if="attachments.length" class="file-list">
      <li v-for="a in attachments" :key="a.id" class="file">
        <img v-if="isImage(a) && a.dataUrl" :src="a.dataUrl" :alt="a.name" class="file-thumb" />
        <span v-else class="file-icon"><el-icon><component :is="isImage(a) ? Picture : Document" /></el-icon></span>
        <div class="file-main">
          <div class="file-name" :title="a.name">{{ a.name }}</div>
          <div class="muted">{{ fmtSize(a.size) }} · {{ a.uploadedBy }} · {{ timeAgo(a.at) }}</div>
        </div>
        <div class="file-actions">
          <el-button v-if="a.dataUrl" size="small" :icon="View" title="Preview" @click="preview(a)" />
          <el-button v-if="a.dataUrl" size="small" :icon="Download" title="Download" @click="download(a)" />
          <el-button size="small" type="danger" plain :icon="Delete" title="Remove" @click="removeAttachment(a)" />
        </div>
      </li>
    </ul>
    <p v-else class="collab-empty">No attachments yet.</p>
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
  margin: 4px 0 14px;
  font-size: 13px;
  color: var(--gray-400);
  font-style: italic;
}
.muted {
  font-size: 12px;
  color: var(--gray-500);
}
.drop-zone {
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 22px 16px;
  border: 1.5px dashed var(--brand-light-2);
  border-radius: var(--radius-md);
  background: var(--brand-light);
  font-size: 13.5px;
  color: var(--gray-700);
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.drop-zone.is-over {
  border-color: var(--brand);
  background: #dcedf8;
  outline: none;
}
.drop-icon {
  font-size: 28px;
  color: var(--brand);
}
.file-list {
  display: grid;
  gap: 8px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}
.file {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
}
.file-icon {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 8px;
}
.file-thumb {
  object-fit: cover;
}
.file-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--brand-light);
  color: var(--brand);
  font-size: 18px;
}
.file-main {
  flex: 1;
  min-width: 0;
}
.file-name {
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--gray-900);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-actions {
  display: flex;
  gap: 4px;
}
.file-actions .el-button + .el-button {
  margin-left: 0;
}
</style>
