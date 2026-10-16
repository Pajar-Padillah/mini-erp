// Small display helpers shared by the chat components.

const AVATAR_TONES = ['blue', 'amber', 'green', 'violet', 'rose', 'teal']

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/** Stable avatar tone per name, so a person keeps the same color everywhere. */
export function avatarTone(key: string): string {
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_TONES[hash % AVATAR_TONES.length]
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

/** Conversation list stamp: "13.06", "Yesterday", "Mon", or "12 Oct". */
export function listStamp(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (sameDay(d, now)) return timeOf(iso)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return 'Yesterday'
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Date separator inside a thread: "Today", "Yesterday", or "Monday, 12 October 2026". */
export function dayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (sameDay(d, now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`
}
