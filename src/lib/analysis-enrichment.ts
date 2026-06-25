import type { DuelMoment } from './duel-moments'
import { parseMatchHighlightsFromApi, type MatchHighlight } from './match-highlights'
import type { SkillProfileSnapshot } from './skill-profile'
import type { MatchSpatialSummary } from './spatial-types'

export interface TimingComparisonRow {
  id: string
  type: string
  round: number | null
  label: string
  player_label: string
  reference_label: string
  reference_scope: string
  difference_seconds: number
  result: string
  video_offset_ms?: number | null
}

export interface AnalysisDetailEnriched {
  verdict: string | null
  top_issue: string | null
  priority_improvements: string[]
  coaching_tags: string[]
  ally_score: number | null
  enemy_score: number | null
  duel_moments: DuelMoment[] | null
  match_highlights: MatchHighlight[] | null
  timing_comparisons: TimingComparisonRow[]
  spatial_summary: MatchSpatialSummary | null
  skill_profile: SkillProfileSnapshot | null
  pipeline: string | null
  heatmap_insight: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function parseEmbeddedAnalysisField(raw: unknown): {
  priority_improvements: string[]
  coaching_tags: string[]
} {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      return {
        priority_improvements: Array.isArray(parsed.priority_improvements)
          ? parsed.priority_improvements.filter((x): x is string => typeof x === 'string')
          : [],
        coaching_tags: Array.isArray(parsed.coaching_tags)
          ? parsed.coaching_tags.filter((x): x is string => typeof x === 'string')
          : [],
      }
    } catch {
      return { priority_improvements: [], coaching_tags: [] }
    }
  }
  const row = asRecord(raw)
  if (!row) return { priority_improvements: [], coaching_tags: [] }
  return {
    priority_improvements: Array.isArray(row.priority_improvements)
      ? row.priority_improvements.filter((x): x is string => typeof x === 'string')
      : [],
    coaching_tags: Array.isArray(row.coaching_tags)
      ? row.coaching_tags.filter((x): x is string => typeof x === 'string')
      : [],
  }
}

/** Pull spatial intel from poll payloads or full analysis objects (nested under match_data). */
export function extractSpatialFromAnalysisPayload(
  payload: Record<string, unknown> | null | undefined,
): MatchSpatialSummary | null {
  if (!payload) return null

  const direct = asRecord(payload.spatial_summary)
  if (direct?.events && Array.isArray(direct.events) && direct.events.length > 0) {
    return direct as unknown as MatchSpatialSummary
  }

  const md = asRecord(payload.match_data)
  const nested = asRecord(md?.spatialSummary) ?? asRecord(md?.spatial_summary)
  if (nested?.events && Array.isArray(nested.events) && nested.events.length > 0) {
    return nested as unknown as MatchSpatialSummary
  }

  if (direct) return direct as unknown as MatchSpatialSummary
  if (nested) return nested as unknown as MatchSpatialSummary
  return null
}

function parseTimingComparisons(raw: unknown): TimingComparisonRow[] {
  if (!Array.isArray(raw)) return []
  const out: TimingComparisonRow[] = []
  for (const item of raw) {
    const row = asRecord(item)
    if (!row || typeof row.label !== 'string') continue
    out.push({
      id: typeof row.id === 'string' ? row.id : `timing-${out.length}`,
      type: typeof row.type === 'string' ? row.type : 'timing',
      round: typeof row.round === 'number' ? row.round : null,
      label: row.label,
      player_label: typeof row.player_label === 'string'
        ? row.player_label
        : (typeof row.player_seconds === 'number' ? `${row.player_seconds}s` : '—'),
      reference_label: typeof row.reference_label === 'string'
        ? row.reference_label
        : (typeof row.reference_seconds === 'number' ? `${row.reference_seconds}s` : '—'),
      reference_scope: typeof row.reference_scope === 'string' ? row.reference_scope : 'Rank avg',
      difference_seconds: typeof row.difference_seconds === 'number' ? row.difference_seconds : 0,
      result: typeof row.result === 'string' ? row.result : '',
      video_offset_ms: typeof row.video_offset_ms === 'number' ? row.video_offset_ms : null,
    })
  }
  return out
}

function parseSkillProfile(raw: unknown): SkillProfileSnapshot | null {
  const row = asRecord(raw)
  if (!row?.skills || typeof row.skills !== 'object') return null
  return row as unknown as SkillProfileSnapshot
}

/** Normalize GET /api/analysis/{id} or poll result into desktop coaching detail. */
export function enrichAnalysisDetail(analysis: Record<string, unknown>): AnalysisDetailEnriched {
  const md = asRecord(analysis.match_data) ?? {}
  const embedded = parseEmbeddedAnalysisField(analysis.analysis)

  const priorityImprovements = Array.isArray(analysis.priority_improvements)
    && analysis.priority_improvements.length > 0
    ? analysis.priority_improvements.filter((x): x is string => typeof x === 'string')
    : embedded.priority_improvements

  const coachingTags = Array.isArray(analysis.coaching_tags)
    && analysis.coaching_tags.length > 0
    ? analysis.coaching_tags.filter((x): x is string => typeof x === 'string')
    : embedded.coaching_tags

  const spatial = extractSpatialFromAnalysisPayload(analysis)
  const matchHighlights = parseMatchHighlightsFromApi(analysis.match_highlights)

  return {
    verdict: typeof analysis.verdict === 'string'
      ? analysis.verdict
      : (typeof analysis.summary === 'string' ? analysis.summary : null),
    top_issue: typeof analysis.top_issue === 'string'
      ? analysis.top_issue
      : (typeof analysis.coaching_diagnosis === 'string' ? analysis.coaching_diagnosis : null),
    priority_improvements: priorityImprovements,
    coaching_tags: coachingTags.length > 0
      ? coachingTags
      : (Array.isArray(analysis.coaching_tags)
        ? analysis.coaching_tags.filter((x): x is string => typeof x === 'string')
        : embedded.coaching_tags),
    ally_score: typeof md.finalScore === 'object' && md.finalScore
      ? (md.finalScore as { allyScore?: number }).allyScore ?? null
      : (typeof analysis.ally_score === 'number' ? analysis.ally_score : null),
    enemy_score: typeof md.finalScore === 'object' && md.finalScore
      ? (md.finalScore as { enemyScore?: number }).enemyScore ?? null
      : (typeof analysis.enemy_score === 'number' ? analysis.enemy_score : null),
    duel_moments: Array.isArray(analysis.duel_moments)
      ? analysis.duel_moments as DuelMoment[]
      : null,
    match_highlights: matchHighlights,
    timing_comparisons: parseTimingComparisons(analysis.timing_comparisons),
    spatial_summary: spatial,
    skill_profile: parseSkillProfile(md.skillProfile ?? analysis.skill_profile),
    pipeline: typeof analysis.pipeline === 'string'
      ? analysis.pipeline
      : (typeof analysis.pipeline_type === 'string' ? analysis.pipeline_type : null),
    heatmap_insight: spatial?.heatmapInsight ?? spatial?.patterns?.[0] ?? null,
  }
}

export function hasMomentHybridContent(detail: AnalysisDetailEnriched | null | undefined): boolean {
  if (!detail) return false
  return Boolean(
    detail.match_highlights?.length
    || detail.timing_comparisons.length
    || detail.duel_moments?.length
    || detail.spatial_summary?.events?.length
    || detail.heatmap_insight
    || detail.priority_improvements.length
    || detail.verdict
    || detail.top_issue,
  )
}
