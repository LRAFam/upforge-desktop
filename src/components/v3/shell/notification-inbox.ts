/**
 * Title-bar notifications inbox (pure helpers, shared by the main-process poller and the bell).
 * Source: GET /api/notifications (the coach poller already fetches it every minute; the bell reads
 * that cached answer, so opening it never spends the API's 60/hour list budget).
 */

export interface InboxItem {
  id: number
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string | null
  data: Record<string, unknown>
}

export interface InboxSnapshot {
  items: InboxItem[]
  unreadCount: number
  fetchedAt: number
}

/** Most recent items kept for the dropdown. */
export const INBOX_LIMIT = 20

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** Normalise the API's `data` block ({ notifications, unread_count }); bad rows are dropped. */
export function toInboxSnapshot(raw: unknown, now: number): InboxSnapshot {
  const body = (raw && typeof raw === 'object' ? raw : {}) as { notifications?: unknown; unread_count?: unknown }
  const list = Array.isArray(body.notifications) ? body.notifications : []
  const items: InboxItem[] = []
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const n = row as Record<string, unknown>
    const id = n.id
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) continue
    const title = str(n.title)
    const message = str(n.message)
    if (!title && !message) continue
    items.push({
      id,
      type: str(n.type),
      title: title || message,
      message: title ? message : '',
      read: n.read === true || n.read === 1,
      createdAt: str(n.created_at) || null,
      data: n.data && typeof n.data === 'object' && !Array.isArray(n.data) ? (n.data as Record<string, unknown>) : {},
    })
    if (items.length >= INBOX_LIMIT) break
  }
  const count = body.unread_count
  const unreadCount = typeof count === 'number' && Number.isFinite(count) && count >= 0
    ? Math.floor(count)
    : items.filter(i => !i.read).length
  return { items, unreadCount, fetchedAt: now }
}

/** Where clicking an item goes: an in-app route, an analysis result (opened in the app), an upforge.gg path, or nowhere (just marks read). */
export type InboxTarget =
  | { kind: 'app'; path: string; query?: Record<string, string> }
  | { kind: 'analysis'; analysisId: number }
  | { kind: 'web'; path: string }
  | null

function idOf(v: unknown): string | null {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return String(v)
  if (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v)) return v
  return null
}

/** Mirrors the web bell (upforge-frontend NotificationDropdown) and the desktop coach poller. */
export function inboxTarget(item: Pick<InboxItem, 'type' | 'data'>): InboxTarget {
  const d = item.data ?? {}
  const t = item.type
  // Coach-roster replies live in the app (Coaches).
  if ((t === 'review_completed' || t === 'review_in_progress') && d.source === 'roster') return { kind: 'app', path: '/rosters' }
  if (t === 'review_completed' || t === 'review_in_progress') {
    const analysisId = idOf(d.analysis_id)
    if (analysisId) {
      const query: Record<string, string> = { timelineId: analysisId }
      if (t === 'review_completed') query.coachNotes = '1'
      return { kind: 'app', path: '/vod-review', query }
    }
    return { kind: 'web', path: '/my-coaches' }
  }
  if (t === 'analysis_complete') {
    // Results open in the app (match page, else Coaching reviews) for every game, never the website.
    const logId = d.analysis_log_id
    return typeof logId === 'number' && Number.isSafeInteger(logId) && logId > 0
      ? { kind: 'analysis', analysisId: logId }
      : typeof logId === 'string' && /^[1-9]\d{0,9}$/.test(logId)
        ? { kind: 'analysis', analysisId: Number(logId) }
        : { kind: 'app', path: '/recordings' }
  }
  if (t === 'analysis_failed') return { kind: 'app', path: '/recordings' }
  // Cloud retention warnings (7 days / 1 day before a full video leaves the cloud).
  if (t === 'cloud_video_expiring' || d.deep_link === 'upforge://cloud-storage') return { kind: 'app', path: '/cloud-storage' }
  if (t === 'review_requested') {
    const reviewId = idOf(d.review_id)
    return { kind: 'web', path: reviewId ? `/coach-dashboard/reviews/feed?review=${reviewId}` : '/coach-dashboard/reviews/feed' }
  }
  if (t === 'review_received') return { kind: 'web', path: '/my-coaches' }
  const guideId = idOf(d.guide_id)
  if (guideId && d.action === 'view_guide') return { kind: 'web', path: `/guides/${guideId}` }
  const sessionId = idOf(d.session_id)
  if (sessionId) return { kind: 'web', path: `/coaching/session/${sessionId}` }
  if (d.action === 'leave_review') return { kind: 'web', path: '/profile?tab=coaching' }
  return null
}

/** "now", "5m", "3h", "2d", else a short date. */
export function inboxAge(createdAt: string | null, now: number): string {
  if (!createdAt) return ''
  const at = Date.parse(createdAt)
  if (!Number.isFinite(at)) return ''
  const mins = Math.max(0, Math.floor((now - at) / 60_000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
