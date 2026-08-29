import type { DuelMoment } from './duel-moments'
import { normalizeDuelMoment, normalizeDuelMoments } from './duel-moments'
import { parseMatchHighlightsFromApi, type MatchHighlight } from './match-highlights'
import type { SkillProfileSnapshot } from './skill-profile'
import type { MatchSpatialSummary } from './spatial-types'
import { sanitizeUnsupportedRankClaimsForDisplay } from './coaching-copy-safety'

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
  summary: string | null
  coaching_diagnosis: string | null
  verdict: string | null
  top_issue: string | null
  key_strengths: string[]
  priority_improvements: string[]
  coaching_tags: string[]
  category_scores: Array<{ category: string; score: number; reasoning?: string }>
  drill_recommendations: Array<{
    title?: string
    category?: string
    practice_mode?: string
    instructions?: string
    why_this_drill?: string
    success_metric?: string
  }>
  pattern_insights: string[]
  behaviours: Array<{
    behaviour_id: string
    title?: string
    occurrences?: number
    confidence?: string
    evidence: string[]
  }>
  insights: Array<{
    behaviour_id: string
    verdict?: string
    text?: string
  }>
  confidence: Record<string, string> | null
  observation_confidence: string | null
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

function stringList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []
}

function recordList(raw: unknown): Record<string, unknown>[] {
  return Array.isArray(raw)
    ? raw.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)))
    : []
}

function stringRecord(raw: unknown): Record<string, string> | null {
  const row = asRecord(raw)
  if (!row) return null
  const entries = Object.entries(row).filter((entry): entry is [string, string] => (
    typeof entry[1] === 'string'
  ))
  return entries.length ? Object.fromEntries(entries) : null
}

/** Normalize GET /api/analysis/{id} or poll result into desktop coaching detail. */
export function enrichAnalysisDetail(analysis: Record<string, unknown>): AnalysisDetailEnriched {
  const md = asRecord(analysis.match_data) ?? {}
  const priorityImprovements = stringList(analysis.priority_improvements)
  const coachingTags = stringList(analysis.coaching_tags)

  const spatial = extractSpatialFromAnalysisPayload(analysis)
  const matchHighlights = parseMatchHighlightsFromApi(analysis.match_highlights)

  return {
    summary: sanitizeUnsupportedRankClaimsForDisplay(
      typeof analysis.summary === 'string' ? analysis.summary : null,
    ),
    coaching_diagnosis: sanitizeUnsupportedRankClaimsForDisplay(
      typeof analysis.coaching_diagnosis === 'string' ? analysis.coaching_diagnosis : null,
    ),
    verdict: sanitizeUnsupportedRankClaimsForDisplay(
      typeof analysis.verdict === 'string' ? analysis.verdict : null,
    ),
    top_issue: sanitizeUnsupportedRankClaimsForDisplay(
      typeof analysis.top_issue === 'string' ? analysis.top_issue : null,
    ),
    key_strengths: stringList(analysis.key_strengths)
      .map(item => sanitizeUnsupportedRankClaimsForDisplay(item) ?? ''),
    priority_improvements: priorityImprovements
      .map(item => sanitizeUnsupportedRankClaimsForDisplay(item) ?? ''),
    coaching_tags: coachingTags,
    category_scores: recordList(analysis.category_scores)
      .filter(row => typeof row.category === 'string' && typeof row.score === 'number')
      .map(row => ({
        category: row.category as string,
        score: row.score as number,
        reasoning: typeof row.reasoning === 'string' ? row.reasoning : undefined,
      })),
    drill_recommendations: recordList(analysis.drill_recommendations).map(row => ({
      title: typeof row.title === 'string' ? row.title : undefined,
      category: typeof row.category === 'string' ? row.category : undefined,
      practice_mode: typeof row.practice_mode === 'string' ? row.practice_mode : undefined,
      instructions: typeof row.instructions === 'string' ? row.instructions : undefined,
      why_this_drill: typeof row.why_this_drill === 'string' ? row.why_this_drill : undefined,
      success_metric: typeof row.success_metric === 'string' ? row.success_metric : undefined,
    })),
    pattern_insights: stringList(analysis.pattern_insights)
      .map(item => sanitizeUnsupportedRankClaimsForDisplay(item) ?? ''),
    behaviours: recordList(analysis.behaviours)
      .filter(row => typeof row.behaviour_id === 'string')
      .map(row => ({
        behaviour_id: row.behaviour_id as string,
        title: typeof row.title === 'string' ? row.title : undefined,
        occurrences: typeof row.occurrences === 'number' ? row.occurrences : undefined,
        confidence: typeof row.confidence === 'string' ? row.confidence : undefined,
        evidence: stringList(row.evidence),
      })),
    insights: recordList(analysis.insights)
      .filter(row => typeof row.behaviour_id === 'string')
      .map(row => ({
        behaviour_id: row.behaviour_id as string,
        verdict: typeof row.verdict === 'string' ? row.verdict : undefined,
        text: typeof row.text === 'string' ? row.text : undefined,
      })),
    confidence: stringRecord(analysis.confidence),
    observation_confidence: typeof analysis.observation_confidence === 'string'
      ? analysis.observation_confidence
      : null,
    ally_score: typeof md.finalScore === 'object' && md.finalScore
      ? (md.finalScore as { allyScore?: number }).allyScore ?? null
      : (typeof analysis.ally_score === 'number' ? analysis.ally_score : null),
    enemy_score: typeof md.finalScore === 'object' && md.finalScore
      ? (md.finalScore as { enemyScore?: number }).enemyScore ?? null
      : (typeof analysis.enemy_score === 'number' ? analysis.enemy_score : null),
    duel_moments: Array.isArray(analysis.duel_moments)
      ? normalizeDuelMoments(analysis.duel_moments as DuelMoment[])
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
