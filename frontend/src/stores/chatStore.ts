import { defineStore } from 'pinia'

// Static mockup chat: everything lives in the browser (localStorage). Replies from other
// people are simulated so the conversation feels alive; nothing is sent to a server.
const STORAGE_KEY = 'mini-erp.chat.v1'
export const ME = 'me'

export type Presence = 'online' | 'away' | 'offline'

export interface ChatUser {
  id: string
  name: string
  role: string
  department: string
  email: string
  presence: Presence
}

export interface ChatAttachment {
  kind: 'file' | 'document'
  name: string
  /** file: human-readable size; document: document type, e.g. "Sales Order". */
  meta: string
  /** document: route to open it in the ERP. */
  to?: string
}

export interface ChatMessage {
  id: string
  senderId: string // ME, a user id, or 'system'
  text: string
  at: string // ISO timestamp
  replyToId?: string
  attachments?: ChatAttachment[]
  reactions: Record<string, string[]> // emoji -> user ids
  edited?: boolean
  deleted?: boolean
}

export interface Conversation {
  id: string
  type: 'personal' | 'group'
  name?: string // groups only
  description?: string
  memberIds: string[] // other people (never includes ME)
  messages: ChatMessage[]
  unread: number
  pinned: boolean
  muted: boolean
  /** When the other side last read the chat (drives the ✓✓ read ticks). */
  readAt?: string
}

export const CHAT_USERS: ChatUser[] = [
  { id: 'rina', name: 'Rina Dewi', role: 'Finance Manager', department: 'Finance & Accounting', email: 'rina.dewi@example.com', presence: 'online' },
  { id: 'budi', name: 'Budi Santoso', role: 'Warehouse Supervisor', department: 'Warehouse & Logistics', email: 'budi.santoso@example.com', presence: 'offline' },
  { id: 'fajar', name: 'Fajar Nugroho', role: 'Chief Operating Officer', department: 'Management', email: 'fajar.nugroho@example.com', presence: 'online' },
  { id: 'siti', name: 'Siti Rahma', role: 'HR Specialist', department: 'HR & General Affairs', email: 'siti.rahma@example.com', presence: 'away' },
  { id: 'andi', name: 'Andi Pratama', role: 'Sales Lead', department: 'Sales & Retail', email: 'andi.pratama@example.com', presence: 'online' },
  { id: 'dewi', name: 'Dewi Lestari', role: 'Marketing Manager', department: 'Marketing', email: 'dewi.lestari@example.com', presence: 'online' },
  { id: 'yusuf', name: 'Yusuf Hidayat', role: 'Procurement Officer', department: 'Procurement', email: 'yusuf.hidayat@example.com', presence: 'away' },
  { id: 'hendra', name: 'Hendra Gunawan', role: 'IT Support', department: 'Information Technology', email: 'hendra.gunawan@example.com', presence: 'offline' },
]

export const SHAREABLE_DOCUMENTS: ChatAttachment[] = [
  { kind: 'document', name: 'SO/CRS/0064', meta: 'Sales Order', to: '/sales-orders' },
  { kind: 'document', name: 'INV/CRS/0049', meta: 'Sales Invoice', to: '/sales-invoices' },
  { kind: 'document', name: 'DO/KYF/0058', meta: 'Sales Delivery', to: '/sales-deliveries' },
  { kind: 'document', name: 'PO/AOR/0035', meta: 'Purchase Order', to: '/purchase-orders' },
  { kind: 'document', name: 'PR/YRS/0009', meta: 'Purchase Request', to: '/purchase-requests' },
  { kind: 'document', name: 'JE/SGI/0230', meta: 'Journal Entry', to: '/accounting/journal-entries' },
  { kind: 'document', name: 'RMB/SGI/0012', meta: 'Reimbursement', to: '/hr/reimbursements' },
]

const CANNED_REPLIES = [
  'Siap, saya cek dulu ya.',
  'Oke noted, terima kasih infonya 🙏',
  'Baik, nanti saya update lagi sebelum jam 4.',
  'Sudah saya terima, akan saya follow up.',
  'Boleh, kita bahas sebentar setelah meeting?',
  'Mantap 👍',
  'Dokumennya sudah saya lihat, aman.',
]

let seq = 0
function uid(prefix: string) {
  seq += 1
  return `${prefix}-${Date.now().toString(36)}-${seq}`
}

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function msg(senderId: string, text: string, minutesAgo: number, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: uid('m'), senderId, text, at: ago(minutesAgo), reactions: {}, ...extra }
}

function seedConversations(): Conversation[] {
  const DAY = 24 * 60
  return [
    {
      id: 'c-rina',
      type: 'personal',
      memberIds: ['rina'],
      unread: 0,
      pinned: true,
      muted: false,
      readAt: ago(2),
      messages: [
        msg('rina', 'Pagi Pak, laporan AR aging bulan ini sudah saya siapkan.', DAY + 95),
        msg(ME, 'Terima kasih Bu Rina. Yang overdue di atas 90 hari ada berapa?', DAY + 90),
        msg('rina', 'Ada 3 invoice, totalnya sekitar Rp 16 juta. Detailnya di sini.', DAY + 88, {
          attachments: [{ kind: 'file', name: 'AR-Aging-Okt-2026.xlsx', meta: '84 KB' }],
          reactions: { '👍': [ME] },
        }),
        msg(ME, 'Halo, saya mulai chat personal di sini.', 6),
        msg('rina', 'Siap Pak, ada yang bisa saya bantu?', 4),
      ],
    },
    {
      id: 'c-budi',
      type: 'personal',
      memberIds: ['budi'],
      unread: 0,
      pinned: false,
      muted: false,
      readAt: ago(30),
      messages: [
        msg(ME, 'Pak Budi, stok Crusita Noir di gudang KYFEE masih aman?', 3 * 60 + 10),
        msg('budi', 'Tinggal 42 pcs Pak, sudah di bawah reorder point. Saya buatkan transfer dari CRUSITA ya.', 3 * 60),
        msg(ME, 'Oke, tolong sekalian kirim nomor transfernya.', 2 * 60 + 50),
        msg('budi', 'Ini delivery yang terkait.', 2 * 60 + 40, {
          attachments: [{ kind: 'document', name: 'DO/KYF/0058', meta: 'Sales Delivery', to: '/sales-deliveries' }],
        }),
      ],
    },
    {
      id: 'c-leadership',
      type: 'group',
      name: 'Leadership Team',
      description: 'Koordinasi harian manajemen PT Sant Group Indonesia.',
      memberIds: ['fajar', 'rina', 'andi', 'siti'],
      unread: 2,
      pinned: true,
      muted: false,
      readAt: ago(60),
      messages: [
        msg('system', 'Fajar Nugroho created the group "Leadership Team"', 5 * DAY),
        msg('fajar', 'Tim, review budget Q4 kita jadwalkan Kamis jam 10 ya.', 26 * 60, { reactions: { '👍': ['rina', 'andi', ME] } }),
        msg('andi', 'Sales bulan ini sudah 112% dari target 🎉', 25 * 60, { reactions: { '🎉': ['fajar', 'siti', ME] } }),
        msg('siti', 'Untuk headcount, ada 2 posisi kritikal yang masih open.', 3 * 60),
        msg('rina', 'Finance sudah review reimbursement yang urgent, tinggal approval Pak Fajar.', 25, {
          attachments: [{ kind: 'document', name: 'RMB/SGI/0012', meta: 'Reimbursement', to: '/hr/reimbursements' }],
        }),
        msg('fajar', 'Oke, saya approve sore ini.', 12),
      ],
    },
    {
      id: 'c-marketing',
      type: 'group',
      name: 'Marketing & Brand',
      description: 'Campaign, konten, dan koordinasi brand Crusita, Aoera, Yors, Kyfee.',
      memberIds: ['dewi', 'andi', 'hendra'],
      unread: 1,
      pinned: false,
      muted: true,
      readAt: ago(90),
      messages: [
        msg('system', 'Dewi Lestari created the group "Marketing & Brand"', 9 * DAY),
        msg('dewi', 'Draft campaign relaunch Crusita sudah saya upload.', 2 * DAY, {
          attachments: [{ kind: 'file', name: 'Crusita-Relaunch-Brief.pdf', meta: '2,4 MB' }],
        }),
        msg('andi', 'Bagus, tolong tambahkan target outlet Bandung juga.', 2 * DAY - 30),
        msg('dewi', 'Oke, sekalian kirim preview materi KOL ya.', 48),
      ],
    },
    {
      id: 'c-fajar',
      type: 'personal',
      memberIds: ['fajar'],
      unread: 0,
      pinned: false,
      muted: false,
      readAt: ago(5 * 60),
      messages: [
        msg(ME, 'Pak Fajar, limit approval untuk PO di atas Rp 100 juta perlu disesuaikan?', 7 * 60),
        msg('fajar', 'Pak, limit approval COO sudah saya siapkan di approval workflow.', 6 * 60, { reactions: { '🙏': [ME] } }),
      ],
    },
    {
      id: 'c-procurement',
      type: 'group',
      name: 'Procurement Squad',
      description: 'PR, PO, dan koordinasi supplier.',
      memberIds: ['yusuf', 'budi', 'rina'],
      unread: 0,
      pinned: false,
      muted: false,
      readAt: ago(3 * DAY),
      messages: [
        msg('system', 'You created the group "Procurement Squad"', 12 * DAY),
        msg('yusuf', 'PO ke PT Plastindo sudah terbit, mohon dicek.', 3 * DAY + 20, {
          attachments: [{ kind: 'document', name: 'PO/AOR/0035', meta: 'Purchase Order', to: '/purchase-orders' }],
        }),
        msg(ME, 'Sudah saya cek, aman. Lanjut ke supplier.', 3 * DAY),
      ],
    },
  ]
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Conversation[]
      if (Array.isArray(parsed) && parsed.length) return parsed
    }
  } catch {
    // ignore storage failures
  }
  return seedConversations()
}

export function lastMessage(c: Conversation): ChatMessage | undefined {
  return c.messages[c.messages.length - 1]
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    users: CHAT_USERS,
    conversations: loadConversations(),
    activeId: null as string | null,
    /** True while the chat page is on screen; otherwise new replies count as unread. */
    viewing: false,
    /** conversationId -> user id currently "typing". */
    typing: {} as Record<string, string | undefined>,
  }),
  getters: {
    totalUnread: (state) => state.conversations.filter((c) => !c.muted).reduce((sum, c) => sum + c.unread, 0),
    sorted: (state) =>
      [...state.conversations].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return (lastMessage(b)?.at ?? '').localeCompare(lastMessage(a)?.at ?? '')
      }),
    active: (state) => state.conversations.find((c) => c.id === state.activeId),
  },
  actions: {
    user(id: string): ChatUser | undefined {
      return this.users.find((u) => u.id === id)
    },
    title(c: Conversation): string {
      if (c.type === 'group') return c.name ?? 'Group'
      return this.user(c.memberIds[0])?.name ?? 'Unknown'
    },
    persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.conversations))
      } catch {
        // ignore storage failures
      }
    },
    find(id: string) {
      return this.conversations.find((c) => c.id === id)
    },

    setViewing(on: boolean) {
      this.viewing = on
      if (on && this.activeId) this.open(this.activeId)
    },

    open(id: string) {
      this.activeId = id
      const c = this.find(id)
      if (c && c.unread) {
        c.unread = 0
        this.persist()
      }
    },

    send(conversationId: string, text: string, attachments: ChatAttachment[] = [], replyToId?: string) {
      const c = this.find(conversationId)
      if (!c || (!text.trim() && !attachments.length)) return
      c.messages.push({
        id: uid('m'),
        senderId: ME,
        text: text.trim(),
        at: new Date().toISOString(),
        replyToId,
        attachments: attachments.length ? attachments : undefined,
        reactions: {},
      })
      this.persist()
      this.simulateReply(c)
    },

    /** Someone in the chat reads the message, types for a moment, then answers. */
    simulateReply(c: Conversation) {
      const candidates = c.memberIds.map((id) => this.user(id)).filter((u): u is ChatUser => !!u && u.presence !== 'offline')
      if (!candidates.length) return
      const who = candidates[Math.floor(Math.random() * candidates.length)]
      window.setTimeout(() => {
        c.readAt = new Date().toISOString()
        this.typing[c.id] = who.id
      }, 700)
      window.setTimeout(() => {
        this.typing[c.id] = undefined
        c.messages.push(msg(who.id, CANNED_REPLIES[Math.floor(Math.random() * CANNED_REPLIES.length)], 0))
        if (this.activeId !== c.id || !this.viewing) c.unread += 1
        this.persist()
      }, 2200 + Math.random() * 1200)
    },

    toggleReaction(conversationId: string, messageId: string, emoji: string) {
      const m = this.find(conversationId)?.messages.find((x) => x.id === messageId)
      if (!m) return
      const users = m.reactions[emoji] ?? []
      m.reactions[emoji] = users.includes(ME) ? users.filter((u) => u !== ME) : [...users, ME]
      if (!m.reactions[emoji].length) delete m.reactions[emoji]
      this.persist()
    },

    editMessage(conversationId: string, messageId: string, text: string) {
      const m = this.find(conversationId)?.messages.find((x) => x.id === messageId)
      if (!m || m.senderId !== ME || !text.trim()) return
      m.text = text.trim()
      m.edited = true
      this.persist()
    },

    deleteMessage(conversationId: string, messageId: string) {
      const m = this.find(conversationId)?.messages.find((x) => x.id === messageId)
      if (!m || m.senderId !== ME) return
      m.deleted = true
      m.text = ''
      m.attachments = undefined
      m.reactions = {}
      this.persist()
    },

    togglePin(id: string) {
      const c = this.find(id)
      if (c) c.pinned = !c.pinned
      this.persist()
    },

    toggleMute(id: string) {
      const c = this.find(id)
      if (c) c.muted = !c.muted
      this.persist()
    },

    markUnread(id: string) {
      const c = this.find(id)
      if (c) c.unread = Math.max(c.unread, 1)
      if (this.activeId === id) this.activeId = null
      this.persist()
    },

    clearHistory(id: string) {
      const c = this.find(id)
      if (c) c.messages = [msg('system', 'Chat history cleared', 0)]
      this.persist()
    },

    deleteConversation(id: string) {
      this.conversations = this.conversations.filter((c) => c.id !== id)
      if (this.activeId === id) this.activeId = null
      this.persist()
    },

    /** Opens the existing personal chat with this user, or starts a new one. */
    startPersonal(userId: string): string {
      const existing = this.conversations.find((c) => c.type === 'personal' && c.memberIds[0] === userId)
      if (existing) {
        this.open(existing.id)
        return existing.id
      }
      const c: Conversation = { id: uid('c'), type: 'personal', memberIds: [userId], messages: [], unread: 0, pinned: false, muted: false }
      this.conversations.unshift(c)
      this.persist()
      this.open(c.id)
      return c.id
    },

    createGroup(name: string, memberIds: string[], description = ''): string {
      const c: Conversation = {
        id: uid('c'),
        type: 'group',
        name: name.trim(),
        description: description.trim(),
        memberIds: [...memberIds],
        messages: [msg('system', `You created the group "${name.trim()}"`, 0)],
        unread: 0,
        pinned: false,
        muted: false,
      }
      this.conversations.unshift(c)
      this.persist()
      this.open(c.id)
      return c.id
    },

    addMembers(id: string, userIds: string[]) {
      const c = this.find(id)
      if (!c || c.type !== 'group') return
      const fresh = userIds.filter((u) => !c.memberIds.includes(u))
      if (!fresh.length) return
      c.memberIds.push(...fresh)
      const names = fresh.map((u) => this.user(u)?.name ?? u).join(', ')
      c.messages.push(msg('system', `You added ${names}`, 0))
      this.persist()
    },

    renameGroup(id: string, name: string) {
      const c = this.find(id)
      if (!c || c.type !== 'group' || !name.trim() || name.trim() === c.name) return
      c.name = name.trim()
      c.messages.push(msg('system', `You renamed the group to "${c.name}"`, 0))
      this.persist()
    },

    leaveGroup(id: string) {
      this.deleteConversation(id)
    },

    resetDemo() {
      this.conversations = seedConversations()
      this.activeId = null
      this.typing = {}
      this.persist()
    },
  },
})
