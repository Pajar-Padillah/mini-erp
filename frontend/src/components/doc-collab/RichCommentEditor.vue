<script setup lang="ts">
// Rich text editor for comments (Tiptap): formatting toolbar, lists / checklist, alignment, link,
// inline image, undo / redo, and "@" mentions that suggest people by name / e-mail.
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import TextAlign from '@tiptap/extension-text-align'
import Image from '@tiptap/extension-image'
import Mention from '@tiptap/extension-mention'
import { Placeholder } from '@tiptap/extensions'
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import { ElMessage } from 'element-plus'
import { initials } from './collabUtils'

export interface MentionPerson { email: string; name: string }

const props = withDefaults(defineProps<{ modelValue: string; people: MentionPerson[]; placeholder?: string }>(), {
  placeholder: 'Write a comment… type @ to tag someone by e-mail',
})
const emit = defineEmits<{ 'update:modelValue': [html: string]; submit: [] }>()

// ---------- @mention suggestion popup (rendered by this component, positioned at the caret)
const suggest = reactive({
  open: false,
  items: [] as MentionPerson[],
  index: 0,
  top: 0,
  left: 0,
  command: null as ((p: { id: string; label: string }) => void) | null,
})
function placeAt(rect: DOMRect | null | undefined) {
  if (!rect) return
  suggest.top = rect.bottom + 6
  suggest.left = rect.left
}
function pick(i: number) {
  const p = suggest.items[i]
  if (p && suggest.command) suggest.command({ id: p.email, label: p.name })
}
const peopleRef = computed(() => props.people)

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Image.configure({ allowBase64: true }),
    Placeholder.configure({ placeholder: () => props.placeholder }),
    Mention.configure({
      HTMLAttributes: { class: 'mention' },
      renderText: ({ node }) => `@${node.attrs.id}`,
      renderHTML: ({ options, node }) => ['span', mergeAttributes({ 'data-type': 'mention' }, options.HTMLAttributes, { title: node.attrs.label ?? '' }), `@${node.attrs.id}`],
      suggestion: {
        char: '@',
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase()
          return peopleRef.value.filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(q)).slice(0, 6)
        },
        render: () => ({
          onStart: (p: SuggestionProps<MentionPerson>) => {
            suggest.items = p.items
            suggest.index = 0
            suggest.command = p.command as (x: { id: string; label: string }) => void
            placeAt(p.clientRect?.())
            suggest.open = true
          },
          onUpdate: (p: SuggestionProps<MentionPerson>) => {
            suggest.items = p.items
            suggest.index = 0
            suggest.command = p.command as (x: { id: string; label: string }) => void
            placeAt(p.clientRect?.())
          },
          onKeyDown: ({ event }: SuggestionKeyDownProps) => {
            if (!suggest.open || !suggest.items.length) return false
            if (event.key === 'ArrowDown') suggest.index = (suggest.index + 1) % suggest.items.length
            else if (event.key === 'ArrowUp') suggest.index = (suggest.index - 1 + suggest.items.length) % suggest.items.length
            else if (event.key === 'Enter' || event.key === 'Tab') pick(suggest.index)
            else if (event.key === 'Escape') suggest.open = false
            else return false
            return true
          },
          onExit: () => {
            suggest.open = false
          },
        }),
      },
    }),
  ],
  editorProps: {
    handleKeyDown: (_view, event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        emit('submit')
        return true
      }
      return false
    },
  },
  onUpdate: ({ editor: e }) => emit('update:modelValue', e.isEmpty ? '' : e.getHTML()),
})

watch(
  () => props.modelValue,
  (v) => {
    const e = editor.value
    if (e && v !== (e.isEmpty ? '' : e.getHTML())) e.commands.setContent(v || '', { emitUpdate: false })
  },
)
onBeforeUnmount(() => editor.value?.destroy())

// ---------- toolbar
const chain = () => editor.value!.chain().focus()
const COLORS = ['#12324e', '#0878bd', '#15803d', '#b45309', '#c53030', '#7c3aed', '#6d879c']
const HIGHLIGHTS = ['#fff5d6', '#e8f4fb', '#dcfce7', '#fee2e2', '#ede9fe']
const blockType = computed({
  get: () => {
    const e = editor.value
    if (!e) return 'p'
    for (const l of [1, 2, 3] as const) if (e.isActive('heading', { level: l })) return `h${l}`
    return 'p'
  },
  set: (v: string) => {
    if (v === 'p') chain().setParagraph().run()
    else chain().toggleHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run()
  },
})
function indent() {
  if (!chain().sinkListItem('listItem').run()) chain().sinkListItem('taskItem').run()
}
function outdent() {
  if (!chain().liftListItem('listItem').run()) chain().liftListItem('taskItem').run()
}
function setLink() {
  const prev = editor.value?.getAttributes('link').href ?? ''
  const url = window.prompt('Link URL', prev)
  if (url === null) return
  if (!url) chain().unsetLink().run()
  else chain().extendMarkRange('link').setLink({ href: /^https?:\/\//i.test(url) ? url : `https://${url}` }).run()
}
const imageInput = ref<HTMLInputElement>()
function insertImage(files: FileList | null) {
  const f = files?.[0]
  if (!f) return
  if (!f.type.startsWith('image/')) return ElMessage.warning('Choose an image file.')
  if (f.size > 1024 * 1024) return ElMessage.warning('Images in comments can be up to 1 MB in the mockup.')
  const reader = new FileReader()
  reader.onload = () => chain().setImage({ src: String(reader.result), alt: f.name }).run()
  reader.readAsDataURL(f)
  if (imageInput.value) imageInput.value.value = ''
}

function focus() {
  editor.value?.commands.focus('end')
}
defineExpose({ focus })
</script>

<template>
  <div class="rce">
    <div v-if="editor" class="rce-toolbar" role="toolbar" aria-label="Formatting">
      <button type="button" class="rce-btn" :class="{ on: editor.isActive('bold') }" title="Bold (Ctrl+B)" @click="chain().toggleBold().run()"><b>B</b></button>
      <button type="button" class="rce-btn" :class="{ on: editor.isActive('italic') }" title="Italic (Ctrl+I)" @click="chain().toggleItalic().run()"><i>I</i></button>
      <button type="button" class="rce-btn" :class="{ on: editor.isActive('strike') }" title="Strikethrough" @click="chain().toggleStrike().run()"><s>S</s></button>
      <span class="rce-sep" />
      <el-dropdown trigger="click" @command="(c: string) => (c ? chain().setColor(c).run() : chain().unsetColor().run())">
        <button type="button" class="rce-btn" title="Text color"><span class="rce-a">A</span><span class="rce-caret">▾</span></button>
        <template #dropdown>
          <div class="rce-swatches">
            <el-dropdown-item v-for="c in COLORS" :key="c" :command="c"><span class="rce-swatch" :style="{ background: c }" /></el-dropdown-item>
            <el-dropdown-item command="">Default</el-dropdown-item>
          </div>
        </template>
      </el-dropdown>
      <el-dropdown trigger="click" @command="(c: string) => (c ? chain().setHighlight({ color: c }).run() : chain().unsetHighlight().run())">
        <button type="button" class="rce-btn" title="Highlight"><span class="rce-hl">A</span><span class="rce-caret">▾</span></button>
        <template #dropdown>
          <div class="rce-swatches">
            <el-dropdown-item v-for="c in HIGHLIGHTS" :key="c" :command="c"><span class="rce-swatch" :style="{ background: c }" /></el-dropdown-item>
            <el-dropdown-item command="">None</el-dropdown-item>
          </div>
        </template>
      </el-dropdown>
      <span class="rce-sep" />
      <button type="button" class="rce-btn" :class="{ on: editor.isActive('bulletList') }" title="Bullet list" @click="chain().toggleBulletList().run()">•≡</button>
      <button type="button" class="rce-btn" :class="{ on: editor.isActive('orderedList') }" title="Numbered list" @click="chain().toggleOrderedList().run()">1≡</button>
      <button type="button" class="rce-btn" :class="{ on: editor.isActive('taskList') }" title="Checklist" @click="chain().toggleTaskList().run()">☑</button>
      <button type="button" class="rce-btn" title="Decrease indent" @click="outdent">⇤</button>
      <button type="button" class="rce-btn" title="Increase indent" @click="indent">⇥</button>
      <span class="rce-sep" />
      <select v-model="blockType" class="rce-select" aria-label="Text style">
        <option value="p">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <el-dropdown trigger="click" @command="(a: string) => chain().setTextAlign(a).run()">
        <button type="button" class="rce-btn" title="Align">≡<span class="rce-caret">▾</span></button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="left">Align left</el-dropdown-item>
            <el-dropdown-item command="center">Align center</el-dropdown-item>
            <el-dropdown-item command="right">Align right</el-dropdown-item>
            <el-dropdown-item command="justify">Justify</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <span class="rce-sep" />
      <button type="button" class="rce-btn" :class="{ on: editor.isActive('link') }" title="Link" @click="setLink">🔗</button>
      <button type="button" class="rce-btn" title="Insert image" @click="imageInput?.click()">🖼</button>
      <input ref="imageInput" type="file" accept="image/*" hidden @change="insertImage(($event.target as HTMLInputElement).files)" />
      <span class="rce-sep" />
      <button type="button" class="rce-btn" title="Undo (Ctrl+Z)" :disabled="!editor.can().undo()" @click="chain().undo().run()">↶</button>
      <button type="button" class="rce-btn" title="Redo (Ctrl+Y)" :disabled="!editor.can().redo()" @click="chain().redo().run()">↷</button>
    </div>
    <EditorContent :editor="editor" class="rce-content" />

    <Teleport to="body">
      <ul v-if="suggest.open" class="rce-suggest" :style="{ top: `${suggest.top}px`, left: `${suggest.left}px` }" role="listbox">
        <li v-if="!suggest.items.length" class="rce-suggest-empty">No matching people</li>
        <li
          v-for="(p, i) in suggest.items"
          :key="p.email"
          class="rce-suggest-item"
          :class="{ on: i === suggest.index }"
          role="option"
          :aria-selected="i === suggest.index"
          @mousedown.prevent="pick(i)"
          @mouseenter="suggest.index = i"
        >
          <span class="rce-suggest-avatar">{{ initials(p.name) }}</span>
          <span class="rce-suggest-text">
            <b>{{ p.name }}</b>
            <span>{{ p.email }}</span>
          </span>
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<style scoped>
.rce {
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
}
.rce:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-light);
}
.rce-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--border-soft);
}
.rce-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: none;
  font: inherit;
  font-size: 13px;
  color: var(--gray-700);
  cursor: pointer;
}
.rce-btn:hover:not(:disabled) {
  background: var(--gray-100);
}
.rce-btn.on {
  background: var(--brand-light);
  color: var(--brand);
}
.rce-btn:disabled {
  color: var(--gray-300, #c7d6e2);
  cursor: default;
}
.rce-sep {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--border-soft);
}
.rce-a {
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: var(--brand);
  text-decoration-thickness: 2px;
}
.rce-hl {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--brand-gold-light);
  font-weight: 700;
}
.rce-caret {
  font-size: 9px;
  color: var(--gray-500);
}
.rce-select {
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: var(--bg-card);
  font: inherit;
  font-size: 12.5px;
  color: var(--gray-700);
}
.rce-swatches {
  display: grid;
  grid-template-columns: repeat(4, auto);
  padding: 4px;
}
.rce-swatch {
  display: block;
  width: 18px;
  height: 18px;
  border: 1px solid var(--border-soft);
  border-radius: 4px;
}
.rce-content :deep(.tiptap) {
  min-height: 72px;
  max-height: 260px;
  overflow-y: auto;
  padding: 10px 12px;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--gray-900);
  outline: none;
}
.rce-content :deep(.tiptap p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  color: var(--gray-400);
  pointer-events: none;
}
.rce-content :deep(.tiptap p) {
  margin: 0 0 6px;
}
.rce-content :deep(.tiptap ul[data-type='taskList']) {
  padding-left: 4px;
  list-style: none;
}
.rce-content :deep(.tiptap ul[data-type='taskList'] li) {
  display: flex;
  gap: 6px;
}
.rce-content :deep(.tiptap img) {
  max-width: 100%;
  border-radius: 6px;
}
.rce-content :deep(.mention) {
  padding: 0 4px;
  border-radius: 4px;
  background: var(--brand-light);
  color: var(--brand);
  font-weight: 600;
}
.rce-suggest {
  position: fixed;
  z-index: 4000;
  min-width: 260px;
  max-width: 340px;
  margin: 0;
  padding: 4px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--bg-card);
  box-shadow: var(--shadow-md);
  list-style: none;
}
.rce-suggest-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.rce-suggest-item.on {
  background: var(--brand-light);
}
.rce-suggest-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--brand-light-2);
  color: var(--brand);
  font-size: 11px;
  font-weight: 700;
}
.rce-suggest-text {
  display: grid;
  min-width: 0;
  font-size: 13px;
  color: var(--gray-900);
}
.rce-suggest-text span {
  overflow: hidden;
  font-size: 12px;
  color: var(--gray-500);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rce-suggest-empty {
  padding: 8px;
  font-size: 12.5px;
  color: var(--gray-500);
}
</style>
