/** RPG-style skill dimensions for progress tracking */

export type SkillId =
  | 'game_sense'
  | 'crosshair'
  | 'movement'
  | 'trading'
  | 'utility'
  | 'communication'

export interface SkillScore {
  id: SkillId
  label: string
  score: number
  /** Change since last match (after EMA update) */
  trend: number | null
  /** Rank-cohort reference when available */
  benchmark: number | null
}

export interface SkillProfileSnapshot {
  skills: Record<SkillId, number>
  gamesAnalysed: number
  updatedAt: string
  /** Coaching tag → occurrence count (rolling, for coach memory copy) */
  issueCounts: Record<string, number>
}

export interface CategoryScoreLike {
  category: string
  score: number
}

const SKILL_META: Record<SkillId, { label: string; defaultScore: number }> = {
  game_sense: { label: 'Game Sense', defaultScore: 50 },
  crosshair: { label: 'Crosshair', defaultScore: 50 },
  movement: { label: 'Movement', defaultScore: 50 },
  trading: { label: 'Trading', defaultScore: 50 },
  utility: { label: 'Utility', defaultScore: 50 },
  communication: { label: 'Communication', defaultScore: 50 },
}

const CATEGORY_ALIASES: Record<string, SkillId> = {
  game_sense: 'game_sense',
  gamesense: 'game_sense',
  positioning: 'game_sense',
  economy: 'game_sense',
  decision_making: 'game_sense',
  decisions: 'game_sense',
  aim: 'crosshair',
  crosshair: 'crosshair',
  crosshair_placement: 'crosshair',
  first_bullet: 'crosshair',
  movement: 'movement',
  peeking: 'movement',
  spacing: 'movement',
  trading: 'trading',
  trade: 'trading',
  team_play: 'trading',
  utility: 'utility',
  util: 'utility',
  ability_usage: 'utility',
  communication: 'communication',
  comms: 'communication',
  leadership: 'communication',
}

/** Headshot % benchmarks by rank tier (population reference). */
export const RANK_HS_BENCHMARKS: Record<string, number> = {
  iron: 15,
  bronze: 16,
  silver: 18,
  gold: 20,
  platinum: 22,
  diamond: 25,
  ascendant: 27,
  immortal: 29,
  radiant: 31,
}

const EMA_ALPHA = 0.25

export function defaultSkillProfile(): SkillProfileSnapshot {
  const skills = Object.fromEntries(
    (Object.keys(SKILL_META) as SkillId[]).map((id) => [id, SKILL_META[id].defaultScore]),
  ) as Record<SkillId, number>
  return {
    skills,
    gamesAnalysed: 0,
    updatedAt: new Date().toISOString(),
    issueCounts: {},
  }
}

function normalizeCategory(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_')
}

function mapCategoryToSkill(category: string): SkillId | null {
  const key = normalizeCategory(category)
  if (CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key]
  for (const [alias, skill] of Object.entries(CATEGORY_ALIASES)) {
    if (key.includes(alias) || alias.includes(key)) return skill
  }
  return null
}

/** Convert 0–10 API category scores to 0–100 skill scale */
function toSkillScale(score: number): number {
  if (score <= 10) return Math.round(Math.max(0, Math.min(100, score * 10)))
  return Math.round(Math.max(0, Math.min(100, score)))
}

export function scoresFromCategories(categories: CategoryScoreLike[]): Partial<Record<SkillId, number>> {
  const buckets: Partial<Record<SkillId, number[]>> = {}
  for (const item of categories) {
    const skill = mapCategoryToSkill(item.category)
    if (!skill || typeof item.score !== 'number') continue
    if (!buckets[skill]) buckets[skill] = []
    buckets[skill]!.push(toSkillScale(item.score))
  }
  const out: Partial<Record<SkillId, number>> = {}
  for (const [skill, values] of Object.entries(buckets) as [SkillId, number[]][]) {
    out[skill] = Math.round(values.reduce((a, b) => a + b, 0) / values.length)
  }
  return out
}

export interface MergeSkillProfileInput {
  categoryScores?: CategoryScoreLike[]
  coachingTags?: string[]
  overallScore?: number | null
  headshotPct?: number | null
}

/** Update persisted skill profile after a match analysis completes. */
export function mergeSkillProfileFromAnalysis(
  current: SkillProfileSnapshot | null | undefined,
  input: MergeSkillProfileInput,
): SkillProfileSnapshot {
  const base = current?.gamesAnalysed ? { ...current, skills: { ...current.skills } } : defaultSkillProfile()
  const matchSkills = scoresFromCategories(input.categoryScores ?? [])

  if (input.overallScore != null && Object.keys(matchSkills).length === 0) {
    const scaled = toSkillScale(input.overallScore)
    for (const id of Object.keys(SKILL_META) as SkillId[]) {
      if (base.skills[id] === SKILL_META[id].defaultScore) {
        matchSkills[id] = scaled
      }
    }
  }

  if (input.headshotPct != null) {
    matchSkills.crosshair = Math.round(Math.max(0, Math.min(100, input.headshotPct * 2.5)))
  }

  const prev = { ...base.skills }
  for (const id of Object.keys(SKILL_META) as SkillId[]) {
    const incoming = matchSkills[id]
    if (incoming == null) continue
    const existing = base.skills[id] ?? SKILL_META[id].defaultScore
    base.skills[id] = Math.round(existing * (1 - EMA_ALPHA) + incoming * EMA_ALPHA)
  }

  const issueCounts = { ...base.issueCounts }
  for (const tag of input.coachingTags ?? []) {
    const key = normalizeCategory(tag)
    if (!key) continue
    issueCounts[key] = (issueCounts[key] ?? 0) + 1
  }

  return {
    skills: base.skills,
    gamesAnalysed: base.gamesAnalysed + 1,
    updatedAt: new Date().toISOString(),
    issueCounts,
  }
}

export function resolveRankBenchmark(rankName: string | null | undefined): number | null {
  if (!rankName) return null
  const lower = rankName.toLowerCase()
  for (const [tier, value] of Object.entries(RANK_HS_BENCHMARKS)) {
    if (lower.includes(tier)) return value
  }
  return null
}

export function buildSkillScores(
  profile: SkillProfileSnapshot | null | undefined,
  options?: { rankName?: string | null; previous?: SkillProfileSnapshot | null },
): SkillScore[] {
  const prev = options?.previous?.skills
  const hsBenchmark = resolveRankBenchmark(options?.rankName ?? null)

  return (Object.keys(SKILL_META) as SkillId[]).map((id) => {
    const score = profile?.skills?.[id] ?? SKILL_META[id].defaultScore
    const trend = prev && profile ? Math.round(score - (prev[id] ?? score)) : null
    const benchmark = id === 'crosshair' ? hsBenchmark : null
    return {
      id,
      label: SKILL_META[id].label,
      score,
      trend,
      benchmark,
    }
  })
}

export interface CoachMemoryLine {
  gamesAnalysed: number
  improving?: { label: string; before: number; after: number }
  focusNext?: string
}

/** Lightweight coach memory copy from structured profile (not LLM chat history). */
export function buildCoachMemoryLine(
  profile: SkillProfileSnapshot | null | undefined,
  focusAreas?: Array<{ category: string; text: string }>,
): CoachMemoryLine | null {
  if (!profile || profile.gamesAnalysed < 2) return null

  const sortedIssues = Object.entries(profile.issueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  let improving: CoachMemoryLine['improving']
  if (sortedIssues.length >= 2) {
    const [label, after] = sortedIssues[0]
    const before = sortedIssues[1]?.[1] ?? after
    if (before > after + 2) {
      improving = {
        label: label.replace(/_/g, ' '),
        before,
        after,
      }
    }
  }

  const focusNext = focusAreas?.[0]?.text
    ?? (sortedIssues[0] ? `Let's work on ${sortedIssues[0][0].replace(/_/g, ' ')}` : undefined)

  return {
    gamesAnalysed: profile.gamesAnalysed,
    improving,
    focusNext,
  }
}

export interface FocusHeroCopy {
  headline: string
  subline?: string
  recurrence?: string
}

/** Post-game hero: one headline + optional recurrence from skill profile. */
export function buildFocusHeroCopy(opts: {
  topIssue?: string | null
  priorityImprovements?: string[]
  verdict?: string | null
  heatmapInsight?: string | null
  profile?: SkillProfileSnapshot | null
}): FocusHeroCopy | null {
  let headline: string | null = null

  if (opts.topIssue) {
    const first = opts.topIssue.split(/[.!?]/)[0]?.trim()
    headline = first && first.length < 140 ? first : opts.topIssue.slice(0, 120) + (opts.topIssue.length > 120 ? '…' : '')
  } else if (opts.priorityImprovements?.[0]) {
    const imp = opts.priorityImprovements[0]
    headline = imp.split(/[.!?]/)[0]?.trim() || imp.slice(0, 120)
  } else if (opts.heatmapInsight) {
    headline = opts.heatmapInsight
  } else if (opts.verdict) {
    headline = opts.verdict.slice(0, 120) + (opts.verdict.length > 120 ? '…' : '')
  }

  if (!headline) return null

  const profile = opts.profile
  let recurrence: string | undefined
  let subline: string | undefined

  if (profile && profile.gamesAnalysed >= 2) {
    const [topTag, count] = Object.entries(profile.issueCounts).sort((a, b) => b[1] - a[1])[0] ?? []
    if (topTag && count >= 2) {
      const label = topTag.replace(/_/g, ' ')
      recurrence = `${count}× in last ${profile.gamesAnalysed} games`
      subline = `Recurring pattern: ${label} — make this your focus before the next queue.`
    }
  }

  const memory = buildCoachMemoryLine(profile)
  if (memory?.focusNext && !subline) {
    subline = memory.focusNext
  }

  return { headline, subline, recurrence }
}
