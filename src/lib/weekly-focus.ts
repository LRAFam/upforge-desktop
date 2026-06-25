import {
  buildCoachMemoryLine,
  buildSkillScores,
  resolveRankBenchmark,
  type SkillId,
  type SkillProfileSnapshot,
} from './skill-profile'
import { pickTrainingScenario, trainingScenarioLabel } from './training-drills'
import { scoreGrade } from './analysis-scoring'

export interface PlaystyleFocusArea {
  category: string
  text: string
  severity?: 'low' | 'medium' | 'high'
}

export interface WeeklyFocusPlan {
  goal: string
  drill: { label: string; scenario: string }
  metric: { label: string; hint: string }
  recurrence?: string
  grade?: string | null
}

const METRIC_BY_SKILL: Record<SkillId, { label: string; hint: string }> = {
  game_sense: { label: 'First deaths', hint: 'Fewer untraded opening picks per half' },
  crosshair: { label: 'Headshot %', hint: 'Track HS% vs your rank benchmark' },
  movement: { label: 'Wide swings', hint: 'Fewer deaths while wide-swinging' },
  trading: { label: 'Trade rate', hint: 'Get a trade within 3s of a teammate death' },
  utility: { label: 'Util before peek', hint: 'Use util before dry peeking a held angle' },
  communication: { label: 'Call timing', hint: 'Call info before you die, not after' },
}

function formatIssueTag(tag: string): string {
  return tag.replace(/_/g, ' ')
}

function topIssueFromProfile(profile: SkillProfileSnapshot | null | undefined): {
  tag: string
  count: number
} | null {
  if (!profile) return null
  const [tag, count] = Object.entries(profile.issueCounts).sort((a, b) => b[1] - a[1])[0] ?? []
  if (!tag || !count) return null
  return { tag, count }
}

export function buildWeeklyFocusPlan(opts: {
  skillProfile?: SkillProfileSnapshot | null
  playstyleFocus?: PlaystyleFocusArea[] | null
  rankName?: string | null
  sessionFix?: string | null
  avgSessionScore?: number | null
}): WeeklyFocusPlan | null {
  const profile = opts.skillProfile
  const topIssue = topIssueFromProfile(profile)
  const playstyleText = opts.playstyleFocus?.find((f) => f.severity !== 'low')?.text
    ?? opts.playstyleFocus?.[0]?.text

  let goal =
    playstyleText
    ?? opts.sessionFix
    ?? (topIssue && topIssue.count >= 2
      ? `Cut down on ${formatIssueTag(topIssue.tag)}`
      : null)

  if (!goal && profile && profile.gamesAnalysed >= 1) {
    goal = buildCoachMemoryLine(profile)?.focusNext ?? null
  }

  if (!goal) return null

  const scenario = pickTrainingScenario(goal, topIssue?.tag, playstyleText)
  const scores = buildSkillScores(profile, { rankName: opts.rankName })
  const weakest = [...scores].sort((a, b) => a.score - b.score)[0]
  const metricBase = METRIC_BY_SKILL[weakest?.id ?? 'crosshair']
  const hsBenchmark = resolveRankBenchmark(opts.rankName ?? null)
  const metricHint =
    weakest?.id === 'crosshair' && hsBenchmark != null
      ? `Target ${hsBenchmark}%+ HS at your rank`
      : metricBase.hint

  const recurrence =
    topIssue && topIssue.count >= 2 && profile
      ? `${topIssue.count}× in last ${profile.gamesAnalysed} games`
      : undefined

  return {
    goal,
    drill: { label: trainingScenarioLabel(scenario), scenario },
    metric: { label: metricBase.label, hint: metricHint },
    recurrence,
    grade: opts.avgSessionScore != null ? scoreGrade(opts.avgSessionScore) : null,
  }
}
