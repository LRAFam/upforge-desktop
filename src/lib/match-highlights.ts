import type { MatchSpatialSummary } from './spatial-types'

/** Minimal clip fields used for highlight curation */
export interface HighlightClipSource {
  id: string
  trigger: 'manual' | 'kill' | 'ace' | 'multikill' | 'clutch' | 'hotkey'
  round: number | null
  killCount: number | null
  title: string | null
  verdict: string | null
  suggestion: string | null
  overallScore: number | null
  favorited: boolean
}

export type HighlightKind =
  | 'best_play'
  | 'mistake'
  | 'clutch'
  | 'multikill'
  | 'avoidable_death'
  | 'improved_moment'

export interface MatchHighlight {
  id: string
  kind: HighlightKind
  title: string
  reason: string
  round: number | null
  videoOffsetMs: number | null
  clipId: string | null
  /** Higher = more important when trimming lists */
  rank: number
  benchmarkHint?: string | null
}

export interface MatchHighlightsInput {
  priorityImprovements?: string[]
  topIssue?: string | null
  coachingTags?: string[]
  overallScore?: number | null
  spatialSummary?: MatchSpatialSummary | null
  sessionClips?: HighlightClipSource[]
  /** Prefer API payload when backend ships curated highlights */
  apiHighlights?: MatchHighlight[] | null
}

export interface MatchHighlightsResult {
  bestPlays: MatchHighlight[]
  mistakes: MatchHighlight[]
  clutchMoments: MatchHighlight[]
  featured: MatchHighlight[]
}

const KIND_LABELS: Record<HighlightKind, string> = {
  best_play: 'Best play',
  mistake: 'Mistake',
  clutch: 'Clutch round',
  multikill: 'Multi-kill',
  avoidable_death: 'Avoidable death',
  improved_moment: 'Bright spot',
}

export function highlightKindLabel(kind: HighlightKind): string {
  return KIND_LABELS[kind] ?? kind
}

function roundLabel(round: number | null): string {
  if (round == null || round < 0) return ''
  return `R${round + 1}`
}

function clipTitle(clip: HighlightClipSource): string {
  if (clip.trigger === 'ace') return `${clip.killCount ?? 5}-kill ace`
  if (clip.trigger === 'multikill') return `${clip.killCount ?? 3}-kill round`
  if (clip.trigger === 'clutch') return 'Clutch round'
  if (clip.trigger === 'hotkey' || clip.trigger === 'manual') return clip.title ?? 'Bookmarked moment'
  return 'Kill'
}

function clipReason(clip: HighlightClipSource): string {
  if (clip.verdict) return clip.verdict
  if (clip.suggestion) return clip.suggestion
  if (clip.trigger === 'clutch') return 'Won the round under pressure'
  if (clip.trigger === 'ace' || clip.trigger === 'multikill') return 'High-impact round'
  return 'Strong moment from this match'
}

function clipRank(clip: HighlightClipSource): number {
  const scoreBoost = (clip.overallScore ?? 5) * 10
  if (clip.trigger === 'ace') return 90 + scoreBoost
  if (clip.trigger === 'clutch') return 85 + scoreBoost
  if (clip.trigger === 'multikill') return 75 + scoreBoost
  if (clip.favorited) return 70
  return 50 + scoreBoost
}

function highlightFromClip(clip: HighlightClipSource, kind: HighlightKind): MatchHighlight {
  return {
    id: `clip-${clip.id}`,
    kind,
    title: clipTitle(clip),
    reason: clipReason(clip),
    round: clip.round,
    videoOffsetMs: null,
    clipId: clip.id,
    rank: clipRank(clip),
  }
}

function deathHighlights(spatial: MatchSpatialSummary | null | undefined): MatchHighlight[] {
  if (!spatial?.events?.length) return []

  const deaths = spatial.events
    .map((ev, index) => ({ ev, index }))
    .filter((x) => x.ev.type === 'death')

  const out: MatchHighlight[] = []
  for (const { ev, index } of deaths) {
    const kind: HighlightKind = ev.isolated ? 'avoidable_death' : 'mistake'
    const rank = ev.isolated ? 80 : 55
    out.push({
      id: `death-${index}`,
      kind,
      title: ev.isolated ? 'Died alone' : `Death @ ${ev.callout || 'unknown'}`,
      reason: ev.benchmarkHint
        ?? (ev.isolated
          ? 'No teammate nearby to trade — check spacing before peeking'
          : `Died at ${ev.callout || 'this angle'}${ev.weapon ? ` (${ev.weapon})` : ''}`),
      round: ev.round,
      videoOffsetMs: ev.videoOffsetMs ?? null,
      clipId: null,
      rank,
      benchmarkHint: ev.benchmarkHint ?? null,
    })
  }

  return out.sort((a, b) => b.rank - a.rank)
}

function improvementHighlights(improvements: string[], topIssue: string | null | undefined): MatchHighlight[] {
  const lines = [...improvements]
  if (topIssue && !lines.includes(topIssue)) lines.unshift(topIssue)

  return lines.slice(0, 5).map((text, i) => ({
    id: `imp-${i}`,
    kind: 'mistake' as const,
    title: 'Focus area',
    reason: text,
    round: null,
    videoOffsetMs: null,
    clipId: null,
    rank: 40 - i,
  }))
}

function dedupeHighlights(items: MatchHighlight[]): MatchHighlight[] {
  const seen = new Set<string>()
  const out: MatchHighlight[] = []
  for (const item of items.sort((a, b) => b.rank - a.rank)) {
    const key = `${item.round ?? 'x'}:${item.title}:${item.reason.slice(0, 40)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/** Build curated match moments from analysis, spatial data, and session clips. */
export function buildMatchHighlights(input: MatchHighlightsInput): MatchHighlightsResult {
  if (input.apiHighlights?.length) {
    const bestPlays = input.apiHighlights.filter((h) => h.kind === 'best_play' || h.kind === 'multikill' || h.kind === 'improved_moment').slice(0, 5)
    const mistakes = input.apiHighlights.filter((h) => h.kind === 'mistake' || h.kind === 'avoidable_death').slice(0, 5)
    const clutchMoments = input.apiHighlights.filter((h) => h.kind === 'clutch').slice(0, 3)
    const featured = [...bestPlays, ...clutchMoments, ...mistakes].slice(0, 5)
    return { bestPlays, mistakes, clutchMoments, featured }
  }

  const clips = input.sessionClips ?? []
  const clutchMoments = dedupeHighlights(
    clips.filter((c) => c.trigger === 'clutch').map((c) => highlightFromClip(c, 'clutch')),
  ).slice(0, 3)

  const bestFromClips = dedupeHighlights(
    clips
      .filter((c) => c.trigger === 'ace' || c.trigger === 'multikill' || (c.trigger === 'kill' && (c.overallScore ?? 0) >= 7))
      .map((c) => highlightFromClip(c, c.trigger === 'multikill' || c.trigger === 'ace' ? 'multikill' : 'best_play')),
  )

  const killPlays = dedupeHighlights(
    clips
      .filter((c) => c.trigger === 'kill' && (c.overallScore ?? 0) >= 5 && (c.overallScore ?? 0) < 7)
      .map((c) => highlightFromClip(c, 'best_play')),
  )

  const bestPlays = dedupeHighlights([...bestFromClips, ...killPlays]).slice(0, 5)

  const deathMistakes = deathHighlights(input.spatialSummary).slice(0, 5)
  const coachingMistakes = improvementHighlights(
    input.priorityImprovements ?? [],
    input.topIssue,
  )
  const mistakes = dedupeHighlights([...deathMistakes, ...coachingMistakes]).slice(0, 5)

  const featured = dedupeHighlights([
    ...clutchMoments,
    ...bestPlays,
    ...mistakes.filter((m) => m.videoOffsetMs != null || m.clipId != null),
  ]).slice(0, 5)

  return { bestPlays, mistakes, clutchMoments, featured }
}

export function formatHighlightRound(h: MatchHighlight): string {
  return roundLabel(h.round)
}

const HIGHLIGHT_KINDS = new Set<HighlightKind>([
  'best_play',
  'mistake',
  'clutch',
  'multikill',
  'avoidable_death',
  'improved_moment',
])

/** Parse backend `match_highlights` when the API provides curated moments. */
export function parseMatchHighlightsFromApi(raw: unknown): MatchHighlight[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: MatchHighlight[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const kind = row.kind as HighlightKind
    if (!HIGHLIGHT_KINDS.has(kind)) continue
    const title = typeof row.title === 'string' ? row.title : ''
    const reason = typeof row.reason === 'string' ? row.reason : title
    if (!title && !reason) continue
    out.push({
      id: typeof row.id === 'string' ? row.id : `api-${out.length}`,
      kind,
      title: title || reason,
      reason,
      round: typeof row.round === 'number' ? row.round : null,
      videoOffsetMs: typeof row.video_offset_ms === 'number' ? row.video_offset_ms : null,
      clipId: typeof row.clip_id === 'string' ? row.clip_id : null,
      rank: typeof row.rank === 'number' ? row.rank : 50,
      benchmarkHint: typeof row.benchmark_hint === 'string' ? row.benchmark_hint : null,
    })
  }
  return out.length ? out : null
}
