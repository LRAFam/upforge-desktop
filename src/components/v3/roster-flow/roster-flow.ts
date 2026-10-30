/**
 * Coach ↔ student roster flow (UI v3): pure helpers shared by Home, the match page,
 * post-game, Coaches and the sidebar badge. No network here — callers pass API payloads in.
 */

/** Student hub payload, as returned by `window.api.coach.getStudentHub()` (loosely typed rows). */
export interface StudentHub {
  coaches: Array<Record<string, unknown>>
  stats?: { coaches_count?: number; pending_reviews?: number; completed_reviews?: number; actionable_matches?: number }
  pending_reviews?: Array<Record<string, unknown>>
  recent_completed?: Array<Record<string, unknown>>
  actionable_analyses?: Array<Record<string, unknown>>
}

export interface CoachReply {
  reviewId: number
  analysisId: number | null
  coachName: string
  map: string | null
  score: string | null
  completedAt: string | null
}

export interface SendCoach {
  coach_id: number
  display_name: string
  avatar_url: string | null
  current_rank: string | null
  can_request_review?: boolean
  can_request_code?: string | null
  can_request_reason?: string | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Coach id from an invite the coach shared: `https://upforge.gg/coaches/123#join-roster`,
 * any host with `/coaches/123`, the bare path, or just the number. Anything else → null.
 */
export function parseCoachInvite(input: string): number | null {
  const text = input.trim()
  if (!text) return null
  if (/^\d{1,9}$/.test(text)) {
    const n = Number(text)
    return n > 0 ? n : null
  }
  const m = /(?:^|\/)coaches\/(\d{1,9})(?=$|[/?#])/.exec(text)
  if (!m) return null
  const n = Number(m[1])
  return n > 0 ? n : null
}

function replyFrom(row: Record<string, unknown>): CoachReply | null {
  const reviewId = num(row.id)
  if (reviewId == null) return null
  const coach = (row.coach ?? null) as Record<string, unknown> | null
  const analysis = (row.analysis ?? null) as Record<string, unknown> | null
  const won = num(analysis?.rounds_won)
  const lost = num(analysis?.rounds_lost)
  return {
    reviewId,
    analysisId: num(analysis?.id) ?? num(row.analysis_id),
    coachName: str(coach?.display_name) ?? 'Your coach',
    map: str(analysis?.map) ?? str(analysis?.map_name),
    score: won != null && lost != null ? `${won}–${lost}` : null,
    completedAt: str(row.completed_at),
  }
}

/** Completed coach reviews, newest first. */
export function coachReplies(hub: StudentHub | null | undefined): CoachReply[] {
  const rows = (hub?.recent_completed ?? []).map(replyFrom).filter((r): r is CoachReply => r != null)
  return rows.sort((a, b) => Date.parse(b.completedAt ?? '') - Date.parse(a.completedAt ?? '') || b.reviewId - a.reviewId)
}

/** Replies the student hasn't opened yet, within `maxAgeDays` (default 14). */
export function unseenReplies(
  hub: StudentHub | null | undefined,
  seen: ReadonlySet<number>,
  now = Date.now(),
  maxAgeDays = 14,
): CoachReply[] {
  const cutoff = now - maxAgeDays * 86_400_000
  return coachReplies(hub).filter((r) => {
    if (seen.has(r.reviewId)) return false
    const at = Date.parse(r.completedAt ?? '')
    return Number.isNaN(at) || at >= cutoff
  })
}

/** Replies that weren't in the previous poll (for one desktop notification each). */
export function newReplyIds(previous: ReadonlySet<number>, hub: StudentHub | null | undefined): number[] {
  return coachReplies(hub).map(r => r.reviewId).filter(id => !previous.has(id))
}

/** Coaches as the send sheet expects them. */
export function sendCoaches(hub: StudentHub | null | undefined): SendCoach[] {
  return (hub?.coaches ?? []).flatMap((c) => {
    const id = num(c.coach_id)
    if (id == null) return []
    return [{
      coach_id: id,
      display_name: str(c.display_name) ?? 'Coach',
      avatar_url: str(c.avatar_url),
      current_rank: str(c.current_rank),
      can_request_review: typeof c.can_request_review === 'boolean' ? c.can_request_review : undefined,
      can_request_code: str(c.can_request_code),
      can_request_reason: str(c.can_request_reason),
    }]
  })
}

export type SendState =
  | { kind: 'hidden' }
  | { kind: 'already'; status: string; coachName: string }
  | { kind: 'blocked'; reason: string }
  | { kind: 'ready'; coaches: SendCoach[] }

/**
 * Whether this analysis can be sent to a coach. Hidden when the player has no coach or no analysis,
 * "already" when a review for it exists, "blocked" when every coach is at a limit.
 */
export function sendStateFor(hub: StudentHub | null | undefined, analysisId: number | null | undefined): SendState {
  if (!hub || analysisId == null) return { kind: 'hidden' }
  const coaches = sendCoaches(hub)
  if (!coaches.length) return { kind: 'hidden' }
  const existing = [...(hub.pending_reviews ?? []), ...(hub.recent_completed ?? [])].find((r) => {
    const a = (r.analysis ?? null) as Record<string, unknown> | null
    return (num(a?.id) ?? num(r.analysis_id)) === analysisId
  })
  if (existing) {
    const coach = (existing.coach ?? null) as Record<string, unknown> | null
    return { kind: 'already', status: str(existing.status) ?? 'pending', coachName: str(coach?.display_name) ?? 'your coach' }
  }
  const eligible = coaches.filter(c => c.can_request_review !== false)
  if (!eligible.length) {
    const reason = coaches.find(c => c.can_request_reason)?.can_request_reason
    return { kind: 'blocked', reason: reason ?? 'Your coaches can’t take another review right now.' }
  }
  return { kind: 'ready', coaches }
}

/** Sidebar Coaches badge: unopened coach replies (student) + open review requests (coach). */
export function teamBadgeCount(unseen: number, coachRequests: unknown): number {
  const coach = Array.isArray(coachRequests)
    ? coachRequests.filter((r) => {
        const s = (r as { status?: unknown })?.status
        return s === 'pending' || s === 'in_progress'
      }).length
    : 0
  return Math.max(0, unseen) + coach
}

/** One plain sentence for a reply. */
export function replySentence(r: CoachReply): string {
  const match = [r.map, r.score].filter(Boolean).join(' ')
  return match ? `${r.coachName} reviewed your ${match} match.` : `${r.coachName} reviewed your match.`
}

// ---- seen-reply memory (per viewer convenience; safe if storage is unavailable) ----
const SEEN_KEY = 'uf.coachReplies.seen'
const NOTIFIED_KEY = 'uf.coachReplies.notified'
const MAX_IDS = 200

function readIds(key: string, storage: Storage | null): Set<number> {
  try {
    const raw = storage?.getItem(key)
    const arr = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? arr.filter((n): n is number => Number.isInteger(n)) : [])
  } catch {
    return new Set()
  }
}

function writeIds(key: string, ids: Set<number>, storage: Storage | null): void {
  try { storage?.setItem(key, JSON.stringify([...ids].slice(-MAX_IDS))) } catch { /* ignore */ }
}

function store(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export const readSeenReplies = (s: Storage | null = store()) => readIds(SEEN_KEY, s)
export function markReplySeen(id: number, s: Storage | null = store()): void {
  const ids = readIds(SEEN_KEY, s); ids.add(id); writeIds(SEEN_KEY, ids, s)
}
export const readNotifiedReplies = (s: Storage | null = store()) => readIds(NOTIFIED_KEY, s)
export function markRepliesNotified(idsToAdd: number[], s: Storage | null = store()): void {
  const ids = readIds(NOTIFIED_KEY, s); idsToAdd.forEach(i => ids.add(i)); writeIds(NOTIFIED_KEY, ids, s)
}

// ---- "I have a coach" reminder set during onboarding ----
const INVITE_LATER_KEY = 'uf.rosterFlow.joinCoachLater'
export function readJoinCoachLater(s: Storage | null = store()): boolean {
  try { return s?.getItem(INVITE_LATER_KEY) === '1' } catch { return false }
}
export function setJoinCoachLater(on: boolean, s: Storage | null = store()): void {
  try { if (on) s?.setItem(INVITE_LATER_KEY, '1'); else s?.removeItem(INVITE_LATER_KEY) } catch { /* ignore */ }
}
