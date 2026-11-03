/**
 * Cloud retention (API contract: docs in the lead's cloud-retention-contract).
 * Pure helpers: parse the `retention` object on full-video items and the GET /account/cloud-retention
 * summary, say the countdown in plain words, and pick which video to play (this PC first).
 *
 * Old API responses have no `retention` field: every helper treats that as "nothing to say",
 * so screens keep rendering exactly as before.
 */

/**
 * `keep_time`: removal dates are switched off on the server. The video has a keep time (14 days on Free,
 * 30 after a plan ends) but no date. Say the keep time softly, never "Removed in N days".
 */
export type RetentionState = 'kept' | 'countdown' | 'keep_time' | 'removed' | 'not_started'
export type RetentionReason = 'free_plan' | 'payment_ended' | 'over_quota'

export interface Retention {
  state: RetentionState
  expires_at: string | null
  days_left: number | null
  /** keep_time only: days a video is kept (14 Free / over quota, 30 after a plan ends). */
  keep_days: number | null
  reason: RetentionReason | null
  kept_while_subscribed: boolean
  video_stored: boolean
}

export interface RetentionItem {
  kind: 'recording' | 'analysis_video'
  id: string
  map: string | null
  agent: string | null
  game: string | null
  bytes: number | null
  retention: Retention
}

export interface RetentionSummary {
  started: boolean
  tier: string | null
  /** Days each full video is kept; null = kept while subscribed. */
  keep_days: number | null
  kept_while_subscribed: boolean
  grace_days: number | null
  included_bytes: number | null
  addon_bytes: number
  capacity_bytes: number | null
  used_bytes: number | null
  over_quota: boolean
  saves_paused: boolean
  saves_paused_message: string | null
  next_removal_at: string | null
  expiring_soon: RetentionItem[]
  pack: { gb: number; cents: number } | null
}

const STATES: readonly string[] = ['kept', 'countdown', 'keep_time', 'removed', 'not_started']
const REASONS: readonly string[] = ['free_plan', 'payment_ended', 'over_quota']
const count = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
const date = (d: unknown): d is string => typeof d === 'string' && Number.isFinite(Date.parse(d))
const text = (s: unknown): string | null => (typeof s === 'string' && s.trim() ? s.trim() : null)

/** A valid retention object, or null (missing field on older APIs, or malformed). */
export function parseRetention(raw: unknown): Retention | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.state !== 'string' || !STATES.includes(r.state)) return null
  const state = r.state as RetentionState
  const reason = typeof r.reason === 'string' && REASONS.includes(r.reason) ? r.reason as RetentionReason : null
  return {
    state,
    expires_at: date(r.expires_at) ? r.expires_at : null,
    days_left: count(r.days_left) ? r.days_left : null,
    keep_days: state !== 'keep_time' ? null : count(r.keep_days) && r.keep_days > 0 ? r.keep_days : reason === 'payment_ended' ? 30 : 14,
    reason,
    kept_while_subscribed: r.kept_while_subscribed === true,
    // Removed always means no video; otherwise trust the flag and default to stored.
    video_stored: state === 'removed' ? false : r.video_stored !== false,
  }
}

/** Whole days until `expires_at` (0 = today), from the API's `days_left` first. */
export function daysLeft(r: Retention, now = Date.now()): number | null {
  if (r.days_left !== null) return r.days_left
  if (!r.expires_at) return null
  return Math.max(0, Math.ceil((Date.parse(r.expires_at) - now) / 86_400_000))
}

/** "in 9 days" / "in 1 day" / "today". */
export function inDays(days: number): string {
  if (days <= 0) return 'today'
  return days === 1 ? 'in 1 day' : `in ${days} days`
}

export type RetentionTone = 'quiet' | 'warn' | 'gone'
export interface RetentionLine {
  /** Short line for rows and headers. */
  text: string
  /** Longer reason, when the API gave one. */
  detail: string | null
  tone: RetentionTone
  /** Offer "Keep it in the cloud" + "Download". True for a dated countdown and for a keep time. */
  countdown: boolean
  /** A keep time without a date (`keep_time`): soft copy, never a warning. */
  keepTime: boolean
  removed: boolean
}

/**
 * What to say about one video. null = say nothing (older API, or before launch: no countdowns).
 * Copy is the contract's copy, word for word.
 */
export function retentionLine(raw: Retention | null | undefined, now = Date.now()): RetentionLine | null {
  if (!raw || raw.state === 'not_started') return null
  if (raw.state === 'removed') {
    return { text: 'Full video no longer stored', detail: 'Your notes, clips and stats are still here.', tone: 'gone', countdown: false, keepTime: false, removed: true }
  }
  if (raw.state === 'kept') {
    return raw.kept_while_subscribed
      ? { text: "Kept in the cloud while you're subscribed", detail: null, tone: 'quiet', countdown: false, keepTime: false, removed: false }
      : null
  }
  if (raw.state === 'keep_time') {
    const keep = raw.keep_days ?? (raw.reason === 'payment_ended' ? 30 : 14)
    const text = raw.reason === 'over_quota' ? `Cloud space full · kept for ${keep} days`
      : raw.reason === 'payment_ended' ? `Kept for ${keep} days after your plan ended`
        : `Kept for ${keep} days on Free`
    return { text, detail: null, tone: 'quiet', countdown: true, keepTime: true, removed: false }
  }
  const days = daysLeft(raw, now)
  if (days === null) return null
  const when = inDays(days)
  const detail = raw.reason === 'over_quota'
    ? "Your cloud space is full, so this video is only kept for 14 days."
    : raw.reason === 'payment_ended'
      ? `Your plan ended. Removed from cloud ${when} unless you renew.`
      : null
  return { text: `Removed from cloud ${when}`, detail, tone: days <= 7 ? 'warn' : 'quiet', countdown: true, keepTime: false, removed: false }
}

/** The plan's keep time, said once on the Cloud storage page. */
export function keepTimeLine(s: Pick<RetentionSummary, 'keep_days' | 'kept_while_subscribed' | 'tier'> | null | undefined): string | null {
  if (!s) return null
  if (s.kept_while_subscribed || s.keep_days === null) return "Kept while you're subscribed"
  const plan = s.tier === 'free' || !s.tier ? 'Free' : s.tier === 'premium' ? 'Plus' : s.tier === 'pro' ? 'Pro' : 'Your plan'
  return `${plan}: each video kept ${s.keep_days} ${s.keep_days === 1 ? 'day' : 'days'}`
}

/** "2 videos leave the cloud soon · first in 3 days" for warnings, or null when nothing is expiring. */
export function expiringSoonLine(s: Pick<RetentionSummary, 'started' | 'expiring_soon'> | null | undefined, now = Date.now()): string | null {
  if (!s?.started || !s.expiring_soon.length) return null
  const days = s.expiring_soon.map(i => daysLeft(i.retention, now)).filter((d): d is number => d !== null)
  const n = s.expiring_soon.length
  const head = `${n} ${n === 1 ? 'video leaves' : 'videos leave'} the cloud soon`
  return days.length ? `${head} · first ${inDays(Math.min(...days))}` : head
}

export type VideoSource = 'local' | 'cloud' | 'none'

/**
 * Which video to play: the file on this PC always wins (self-coaching keeps working after the cloud
 * copy is removed), then the cloud copy while it is stored, else none (notes and clips still show).
 */
export function chooseVideoSource(opts: { hasLocalFile?: boolean | null; inCloud?: boolean | null; retention?: Retention | null }): VideoSource {
  if (opts.hasLocalFile) return 'local'
  if (!opts.inCloud) return 'none'
  const r = opts.retention
  if (r && (r.state === 'removed' || !r.video_stored)) return 'none'
  return 'cloud'
}

/** Normalise GET /account/cloud-retention. Throws when the body isn't the summary (caller shows an error). */
export function parseRetentionSummary(raw: unknown): RetentionSummary {
  if (!raw || typeof raw !== 'object') throw new Error('Cloud retention could not be verified.')
  const s = raw as Record<string, unknown>
  if (typeof s.started !== 'boolean') throw new Error('Cloud retention could not be verified.')
  const items: RetentionItem[] = []
  for (const row of Array.isArray(s.expiring_soon) ? s.expiring_soon : []) {
    if (!row || typeof row !== 'object') continue
    const i = row as Record<string, unknown>
    const retention = parseRetention(i.retention)
    const id = typeof i.id === 'number' && Number.isSafeInteger(i.id) ? String(i.id) : text(i.id)
    if (!retention || !id || (i.kind !== 'recording' && i.kind !== 'analysis_video')) continue
    items.push({ kind: i.kind, id, map: text(i.map), agent: text(i.agent), game: text(i.game), bytes: count(i.bytes) ? i.bytes : null, retention })
    if (items.length >= 10) break
  }
  const pack = s.pack && typeof s.pack === 'object' ? s.pack as Record<string, unknown> : null
  return {
    started: s.started,
    tier: text(s.tier),
    keep_days: count(s.keep_days) && s.keep_days > 0 ? s.keep_days : null,
    kept_while_subscribed: s.kept_while_subscribed === true,
    grace_days: count(s.grace_days) ? s.grace_days : null,
    included_bytes: count(s.included_bytes) ? s.included_bytes : null,
    addon_bytes: count(s.addon_bytes) ? s.addon_bytes : 0,
    capacity_bytes: count(s.capacity_bytes) ? s.capacity_bytes : null,
    used_bytes: count(s.used_bytes) ? s.used_bytes : null,
    over_quota: s.over_quota === true,
    saves_paused: s.saves_paused === true,
    saves_paused_message: s.saves_paused === true ? text(s.saves_paused_message) : null,
    next_removal_at: date(s.next_removal_at) ? s.next_removal_at : null,
    // Warnings only for dated countdowns, and only while the server shows removal dates.
    expiring_soon: s.started && s.removal_dates_shown !== false ? items.filter(i => i.retention.state === 'countdown') : [],
    pack: pack && count(pack.gb) && count(pack.cents) ? { gb: pack.gb, cents: pack.cents } : null,
  }
}

/** The over-quota sentence (contract copy) for when the API gave none. */
export const SAVES_PAUSED_FALLBACK = "Your cloud space is full. New videos aren't kept in the cloud until you add space. Analysis still works, and nothing you've saved is removed."

/**
 * Post-game: how long the video just uploaded for analysis stays in the cloud. null when it is kept
 * while subscribed (nothing to warn about), before launch, or on an older API.
 */
export function postGameCloudLine(s: RetentionSummary | null | undefined): string | null {
  if (!s?.started) return null
  // Over quota, analysis uploads are kept only 14 days on every plan.
  if (s.saves_paused || s.over_quota) return 'Your cloud space is full, so this video is only kept for 14 days.'
  if (s.kept_while_subscribed || s.keep_days === null) return null
  return `Free plan: this video stays in the cloud for ${s.keep_days} days.`
}
