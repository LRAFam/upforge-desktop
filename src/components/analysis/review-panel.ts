/**
 * UI v3 review panel helpers (match page side panel). Pure: they only choose and word what the
 * AI already returned — no new coaching claims, and no internal confidence labels for players.
 */
import { formatPeekSequence, isWinDuelMoment, normalizeStringList, type DuelMoment } from '../../lib/duel-moments'
import { matchScore, type MatchScoreDisplay } from '../../lib/upforge-score'

const isLow = (c: unknown) => typeof c === 'string' && c.toLowerCase() === 'low'

/**
 * The 1–2 moments to watch first: the AI's own observations with a fix ("Try: …"), lost duels
 * before won ones, clear clips before unclear ones, higher pipeline weight first.
 * Returned in match order; `rest` keeps every other moment in its original order.
 */
export function momentsToWatch<T extends DuelMoment>(moments: readonly T[], n = 2): { watch: T[]; rest: T[] } {
  const ranked = moments
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => Boolean(m.key_observation?.trim()))
    .sort((a, b) => {
      const key = (x: T) => [
        x.player_fix?.trim() ? 0 : 1,
        isWinDuelMoment(x) ? 1 : 0,
        isLow(x.confidence) ? 1 : 0,
        -(typeof x.weight === 'number' ? x.weight : 0),
      ]
      const ka = key(a.m)
      const kb = key(b.m)
      for (let k = 0; k < ka.length; k++) if (ka[k] !== kb[k]) return ka[k] - kb[k]
      return a.i - b.i
    })
    .slice(0, n)
  const picked = new Set(ranked.map(r => r.i))
  return {
    watch: ranked.sort((a, b) => a.i - b.i).map(r => r.m),
    rest: moments.filter((_, i) => !picked.has(i)),
  }
}

/**
 * "Held the angle · crosshair head · standing still" style line, without confidence labels.
 * Parts the AI marked low-confidence or "unknown" are left out rather than shown with a caveat.
 */
export function mechanicsLine(m: DuelMoment): string | null {
  const mc = m.mechanics_confidence ?? {}
  const clean = (v: string | null | undefined) => (v && v !== 'unknown' ? v.replace(/_/g, ' ') : null)
  const peek = isLow(mc.peek) ? null : formatPeekSequence(m.peek_sequence)
  const parts = [
    peek && peek !== 'unknown' ? `Peek: ${peek}` : null,
    !isLow(mc.crosshair) && clean(m.crosshair_on_commit) ? `Crosshair: ${clean(m.crosshair_on_commit)}` : null,
    !isLow(mc.movement) && clean(m.movement_on_commit) ? `Move: ${clean(m.movement_on_commit)}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/** One plain note when the clip itself was hard to read; null otherwise (no "high/medium" labels). */
export function clipNote(m: DuelMoment): string | null {
  if (m.player_action_visibility === 'obscured' || m.movement_actor === 'enemy' || m.movement_actor === 'uncertain') {
    return 'Hard to see in this clip: your own action wasn’t clearly visible.'
  }
  if (isLow(m.confidence)) return 'Hard to see in this clip, so treat this one as a rough read.'
  return null
}

/** The AI's caveats for a moment, shown under "Why this moment?" only. */
export function momentCaveats(m: DuelMoment): string[] {
  return normalizeStringList(m.caveats)
}

/**
 * Category scores are the AI coach's sub-ratings, 0–10 from the API (older reports 0–100).
 * Shown as coach ratings out of 10 ("7/10"), never as the stats-based UpForge score.
 */
export function categoryScore(score: number | null | undefined): MatchScoreDisplay | null {
  if (score == null || !Number.isFinite(score)) return null
  return matchScore({ overall_score: score <= 10 ? score * 10 : score })
}

/** "More from the coach" without the sentence the match header already shows (verdict / top issue). */
export function extraCoachNotes(
  notes: readonly string[],
  detail: { verdict?: string | null; top_issue?: string | null } | null | undefined,
): string[] {
  const shown = [detail?.verdict, detail?.top_issue]
    .map(t => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
    .filter(Boolean)
  return notes.filter(n => !shown.includes(n.trim().toLowerCase()))
}

interface DetailCounts {
  summary?: string | null
  coaching_diagnosis?: string | null
  behaviours?: unknown[]
  pattern_insights?: unknown[]
  category_scores?: unknown[]
  key_strengths?: unknown[]
  drill_recommendations?: unknown[]
  timing_comparisons?: unknown[]
}

/** What sits under "More detail", as a count and a short plain summary ("Full review · 9 more moments"). */
export function moreDetailSummary(detail: DetailCounts | null | undefined, otherMoments: number, extraNotes: number): { count: number; summary: string } {
  const d = detail ?? {}
  const hasReview = Boolean(
    d.summary || d.coaching_diagnosis || d.behaviours?.length || d.pattern_insights?.length || d.category_scores?.length
    || d.key_strengths?.length || d.drill_recommendations?.length || d.timing_comparisons?.length,
  )
  const parts = [
    hasReview ? 'Full review' : null,
    otherMoments > 0 ? `${otherMoments} more ${otherMoments === 1 ? 'moment' : 'moments'}` : null,
    extraNotes > 0 ? `${extraNotes} more ${extraNotes === 1 ? 'note' : 'notes'}` : null,
  ].filter((p): p is string => Boolean(p))
  return { count: (hasReview ? 1 : 0) + otherMoments + extraNotes, summary: parts.join(' · ') }
}
