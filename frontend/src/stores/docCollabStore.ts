import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAuthStore } from './authStore'

// Comments and attachments per document (mockup: kept in localStorage, no backend).
// Documents are keyed "<docType>:<id>"; a form for a new document uses a draft key
// ("<docType>:draft:<random>") that is moved to the real key once the document is saved.
const STORAGE_KEY = 'mini-erp.docCollab.v1'
/** Files up to this size keep their content (data URL) so they can be previewed / downloaded. */
export const MAX_STORED_FILE = 1024 * 1024

export interface DocComment {
  id: string
  author: string
  authorEmail?: string
  /** Rich text (sanitized HTML from the comment editor). */
  text: string
  at: string
  editedAt?: string
  /** Set on replies: the top-level comment of the thread. */
  parentId?: string
  /** E-mail addresses tagged in the text with "@email". */
  mentions?: string[]
}

/** E-mails tagged in a comment: mention nodes (data-id) of the rich text editor. */
export function extractMentions(html: string): string[] {
  const out = new Set<string>()
  const re = /data-id="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) out.add(m[1].toLowerCase())
  return [...out]
}

/** Plain-text version of a comment (previews, empty checks). */
export function commentPlainText(html: string): string {
  // DOMParser builds an inert document: nothing in the markup runs or loads.
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export interface DocAttachment {
  id: string
  name: string
  size: number
  type: string
  /** File content; empty when the file was too large to keep in the mockup. */
  dataUrl: string
  uploadedBy: string
  at: string
}

interface DocThread {
  comments: DocComment[]
  attachments: DocAttachment[]
}

function load(): Record<string, DocThread> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Record<string, DocThread>
  } catch {
    // ignore storage failures
  }
  return {}
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

export const docKey = (docType: string, id: string | number) => `${docType}:${id}`
export const draftDocKey = (docType: string) => `${docType}:draft:${uid()}`
/** True for the key of a document that is still being created (not saved yet). */
export const isDraftKey = (key: string) => key.includes(':draft:')

export const useDocCollabStore = defineStore('docCollab', () => {
  const threads = ref<Record<string, DocThread>>(load())

  let timer: ReturnType<typeof setTimeout> | undefined
  watch(threads, () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(threads.value))
      } catch {
        // quota exceeded: the data stays in memory for this session
      }
    }, 200)
  }, { deep: true })

  const me = () => useAuthStore().user?.name ?? 'User'
  const myEmail = () => useAuthStore().user?.email ?? ''
  function thread(key: string): DocThread {
    if (!threads.value[key]) threads.value[key] = { comments: [], attachments: [] }
    return threads.value[key]
  }
  const comments = (key: string) => threads.value[key]?.comments ?? []
  const attachments = (key: string) => threads.value[key]?.attachments ?? []

  /** Adds a comment (or a reply when parentId is given) and returns the tagged e-mails. */
  function addComment(key: string, text: string, parentId?: string): string[] {
    const t = text.trim()
    if (!t || (!commentPlainText(t) && !t.includes('<img'))) return []
    const mentions = extractMentions(t)
    thread(key).comments.push({ id: uid(), author: me(), authorEmail: myEmail(), text: t, at: new Date().toISOString(), parentId, mentions })
    return mentions
  }
  function editComment(key: string, id: string, text: string) {
    const c = thread(key).comments.find((x) => x.id === id)
    if (c && text.trim()) Object.assign(c, { text: text.trim(), mentions: extractMentions(text), editedAt: new Date().toISOString() })
  }
  /** Deleting a comment also removes its replies. */
  function deleteComment(key: string, id: string) {
    const th = thread(key)
    th.comments = th.comments.filter((c) => c.id !== id && c.parentId !== id)
  }

  function readFile(file: File): Promise<string> {
    if (file.size > MAX_STORED_FILE) return Promise.resolve('')
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => resolve('')
      reader.readAsDataURL(file)
    })
  }
  async function addAttachment(key: string, file: File) {
    const dataUrl = await readFile(file)
    thread(key).attachments.push({
      id: uid(),
      name: file.name,
      size: file.size,
      type: file.type,
      dataUrl,
      uploadedBy: me(),
      at: new Date().toISOString(),
    })
  }
  function deleteAttachment(key: string, id: string) {
    const th = thread(key)
    th.attachments = th.attachments.filter((a) => a.id !== id)
  }

  /** Move a draft's comments / attachments to the saved document. */
  function moveThread(from: string, to: string) {
    const src = threads.value[from]
    if (!src) return
    const dst = thread(to)
    dst.comments.push(...src.comments)
    dst.attachments.push(...src.attachments)
    delete threads.value[from]
  }
  function discard(key: string) {
    delete threads.value[key]
  }

  return { threads, me, myEmail, comments, attachments, addComment, editComment, deleteComment, addAttachment, deleteAttachment, moveThread, discard }
})
