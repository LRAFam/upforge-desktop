/**
 * Coach marketplace (bookable coaching) — shaping for v3. Not rosters, not Squad.
 * Only fields the API returns; anything missing stays missing (no invented ratings or slots).
 */
import { plural } from '../../../lib/plural'

export interface MarketCoach {
  id: number
  name: string
  avatarUrl: string | null
  bannerUrl: string | null
  currentRank: string | null
  peakRank: string | null
  games: string[]
  roles: string[]
  specialties: string[]
  languages: string[]
  hourlyRate: number | null
  rating: number | null
  reviewCount: number
  sessionCount: number
  bio: string | null
  philosophy: string | null
}

export interface MarketCoachDetail extends MarketCoach {
  acceptingStudents: boolean | null
  nextSlot: { start: number; end: number } | null
  reviews: Array<{ id: number; rating: number | null; text: string | null; author: string; at: number | null }>
}

export interface ReviewOffer { priceLabel: string; turnaround: string | null }

export type SessionGroup = 'upcoming' | 'past'
export interface MarketSession {
  id: number
  coachName: string
  start: number
  minutes: number
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'unknown'
  statusLabel: string
  group: SessionGroup
  sessionType: string | null
  coachNotes: string | null
  actionItems: string[]
}

export interface PaidReview {
  id: number
  coachName: string
  analysisId: number | null
  game: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'unknown'
  statusLabel: string
  requestedAt: number | null
  completedAt: number | null
}

type Row = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
const int = (v: unknown): number => { const n = num(v); return n != null && n >= 0 ? Math.round(n) : 0 }
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(s => s.trim()) : [])
const time = (v: unknown): number | null => { const s = str(v); if (!s) return null; const t = Date.parse(s); return Number.isFinite(t) ? t : null }

export function toMarketCoach(raw: unknown): MarketCoach | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Row
  const id = num(r.id)
  const name = str(r.display_name)
  if (id == null || id <= 0 || !Number.isInteger(id) || !name) return null
  const rating = num(r.average_rating)
  const rate = num(r.hourly_rate)
  return {
    id, name,
    avatarUrl: str(r.avatar_url), bannerUrl: str(r.banner_url),
    currentRank: str(r.current_rank), peakRank: str(r.peak_rank),
    games: strs(r.games), roles: strs(r.roles), specialties: strs(r.specialties), languages: strs(r.languages),
    hourlyRate: rate != null && rate >= 0 ? rate : null,
    // A rating only counts when at least one review backs it.
    rating: rating != null && rating > 0 && int(r.total_reviews) > 0 ? Math.min(5, rating) : null,
    reviewCount: int(r.total_reviews), sessionCount: int(r.total_sessions),
    bio: str(r.bio), philosophy: str(r.coaching_philosophy),
  }
}

export function toMarketCoachDetail(raw: unknown): MarketCoachDetail | null {
  const base = toMarketCoach(raw)
  if (!base) return null
  const r = raw as Row
  const slot = r.next_available_slot as Row | null | undefined
  const start = slot ? time(slot.start_time) : null
  const end = slot ? time(slot.end_time) : null
  const reviews = (Array.isArray(r.reviews) ? r.reviews : []).flatMap((x) => {
    if (!x || typeof x !== 'object') return []
    const v = x as Row
    const rid = num(v.id)
    if (rid == null) return []
    return [{ id: rid, rating: num(v.rating), text: str(v.review_text), author: str(v.student_name) ?? 'Player', at: time(v.reviewed_at) }]
  })
  return {
    ...base,
    acceptingStudents: typeof r.accepting_students === 'boolean' ? r.accepting_students : null,
    nextSlot: start != null && end != null && end > start ? { start, end } : null,
    reviews,
  }
}

export function toReviewOffer(raw: unknown): ReviewOffer | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Row
  if (r.available !== true) return null
  const label = str(r.price_formatted) ?? (num(r.price_cents) != null ? `$${((num(r.price_cents) as number) / 100).toFixed(2)}` : null)
  return label ? { priceLabel: label, turnaround: str(r.turnaround_display) } : null
}

export type CoachSort = 'rating' | 'price' | 'sessions'
export function sortCoaches(list: MarketCoach[], by: CoachSort): MarketCoach[] {
  const out = [...list]
  if (by === 'price') out.sort((a, b) => (a.hourlyRate ?? Infinity) - (b.hourlyRate ?? Infinity) || a.name.localeCompare(b.name))
  else if (by === 'sessions') out.sort((a, b) => b.sessionCount - a.sessionCount || a.name.localeCompare(b.name))
  else out.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.reviewCount - a.reviewCount || a.name.localeCompare(b.name))
  return out
}

export function filterCoaches(list: MarketCoach[], opts: { role?: string | null; maxRate?: number | null }): MarketCoach[] {
  return list.filter(c =>
    (!opts.role || c.roles.some(r => r.toLowerCase() === opts.role!.toLowerCase()))
    && (opts.maxRate == null || (c.hourlyRate != null && c.hourlyRate <= opts.maxRate)))
}

export function rateLabel(c: Pick<MarketCoach, 'hourlyRate'>): string | null {
  if (c.hourlyRate == null) return null
  return c.hourlyRate === 0 ? 'Free' : `$${Number.isInteger(c.hourlyRate) ? c.hourlyRate : c.hourlyRate.toFixed(2)} / hour`
}

/** "4.8 · 23 reviews" — the count is a whole number; no rating without reviews. */
export function ratingLabel(c: Pick<MarketCoach, 'rating' | 'reviewCount'>): string {
  if (c.rating == null || c.reviewCount === 0) return 'No reviews yet'
  return `${c.rating.toFixed(1)} · ${plural(c.reviewCount, 'review')}`
}

const SESSION_STATUS: Record<string, MarketSession['status']> = { pending: 'pending', confirmed: 'confirmed', completed: 'completed', cancelled: 'cancelled', no_show: 'no_show' }
const SESSION_LABEL: Record<MarketSession['status'], string> = {
  pending: 'Waiting for the coach', confirmed: 'Confirmed', completed: 'Done', cancelled: 'Cancelled', no_show: 'Missed', unknown: 'Booked',
}

export function toMarketSession(raw: unknown, now = Date.now()): MarketSession | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Row
  const id = num(r.id)
  const start = time(r.scheduled_at)
  if (id == null || start == null) return null
  const status = SESSION_STATUS[String(r.status ?? '')] ?? 'unknown'
  const minutes = int(r.duration_minutes) || int(r.duration) || 60
  const coach = (r.coach as Row | undefined)
  const coachName = str(coach?.display_name) ?? str((coach?.user as Row | undefined)?.name) ?? 'Your coach'
  const ended = start + minutes * 60_000
  const group: SessionGroup = (status === 'pending' || status === 'confirmed' || status === 'unknown') && ended > now ? 'upcoming' : 'past'
  return {
    id, coachName, start, minutes, status, statusLabel: SESSION_LABEL[status], group,
    sessionType: str(r.session_type), coachNotes: str(r.coach_notes), actionItems: strs(r.action_items),
  }
}

export function groupSessions(list: MarketSession[]): { upcoming: MarketSession[]; past: MarketSession[] } {
  return {
    upcoming: list.filter(s => s.group === 'upcoming').sort((a, b) => a.start - b.start),
    past: list.filter(s => s.group === 'past').sort((a, b) => b.start - a.start),
  }
}

const REVIEW_LABEL: Record<PaidReview['status'], string> = { pending: 'Waiting for the coach', in_progress: 'Coach is reviewing', completed: 'Notes ready', unknown: 'Requested' }

/** Paid one-off VOD reviews only (roster reviews live on the Coaches › Your coaches tab). */
export function toPaidReview(raw: unknown): PaidReview | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Row
  if (String(r.source ?? '') === 'roster') return null
  const id = num(r.id)
  if (id == null) return null
  const status = (['pending', 'in_progress', 'completed'] as const).find(s => s === r.status) ?? 'unknown'
  const coach = r.coach as Row | undefined
  const analysis = r.analysis as Row | undefined
  return {
    id, coachName: str(coach?.display_name) ?? 'Your coach',
    analysisId: num(r.analysis_id) ?? num(analysis?.id),
    game: str(analysis?.game_type) ?? str(analysis?.game),
    status, statusLabel: REVIEW_LABEL[status],
    requestedAt: time(r.requested_at) ?? time(r.created_at), completedAt: time(r.completed_at),
  }
}

export function sessionWhen(s: Pick<MarketSession, 'start' | 'minutes'>, locale?: string): string {
  const d = new Date(s.start)
  const day = d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
  const t = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  return `${day} · ${t} · ${plural(s.minutes, 'minute')}`
}
