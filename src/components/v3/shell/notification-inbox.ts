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

const GAME_LABELS: Record<string, string> = { valorant: 'Valorant', cs2: 'CS2', deadlock: 'Deadlock', lol: 'League of Legends' }
/** The API's old fixed title for every finished analysis (before match context was added). */
const GENERIC_ANALYSIS_TITLE = /^your vod analysis is ready/i

function mapName(raw: unknown): string {
  let m = str(raw)
  if (!m || /^unknown$/i.test(m)) return ''
  if (m.includes('/')) m = m.split('/').filter(Boolean).pop() ?? ''
  m = m.replace(/^(de|cs|ar)_/i, '').replace(/_/g, ' ')
  return m ? m.charAt(0).toUpperCase() + m.slice(1) : ''
}

function shortDate(iso: unknown, now: number): string {
  const at = Date.parse(str(iso))
  if (!Number.isFinite(at)) return ''
  const d = new Date(at)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * What the bell shows for an item. Finished analyses name the match ("Valorant · Bind · 22 Nov —
 * match coaching ready"): newer API rows already do; older rows all said "Your VOD Analysis is
 * Ready", so they are rebuilt from the map / agent / game the API stored with them.
 */
export function inboxDisplay(item: Pick<InboxItem, 'type' | 'title' | 'message' | 'data'>, now: number): { title: string; message: string } {
  if (item.type !== 'analysis_complete' || !GENERIC_ANALYSIS_TITLE.test(item.title)) return { title: item.title, message: item.message }
  const d = item.data ?? {}
  const game = GAME_LABELS[str(d.game_type).toLowerCase()] ?? 'Valorant'
  const map = mapName(d.map)
  const date = shortDate(d.played_at, now)
  const agent = str(d.agent)
  const as = agent && !agent.startsWith('hero_') ? ` as ${agent}` : ''
  return {
    title: `${[game, map, date].filter(Boolean).join(' · ')} — match coaching ready`,
    message: map ? `Your AI coaching for ${map}${as} is ready.` : `Your AI coaching for this ${game} match${as} is ready.`,
  }
}

export interface InboxGroup {
  key: string
  /** Newest item (opens on click). */
  item: InboxItem
  /** Every id in the group, so opening it marks them all read. */
  ids: number[]
  count: number
  unread: boolean
}

/** Repeats of the same event (same type and same analysis or review) collapse to one row with a count. */
export function groupInbox(items: readonly InboxItem[]): InboxGroup[] {
  const groups: InboxGroup[] = []
  const byKey = new Map<string, InboxGroup>()
  for (const item of items) {
    const ref = idOf(item.data?.analysis_log_id) ?? idOf(item.data?.analysis_id) ?? idOf(item.data?.review_id) ?? idOf(item.data?.job_id)
    const key = ref ? `${item.type}:${ref}` : `id:${item.id}`
    const hit = byKey.get(key)
    if (hit) {
      hit.ids.push(item.id)
      hit.count++
      hit.unread = hit.unread || !item.read
      continue
    }
    const g: InboxGroup = { key, item, ids: [item.id], count: 1, unread: !item.read }
    byKey.set(key, g)
    groups.push(g)
  }
  return groups
}
