/**
 * The API's personal best and rank for a drill come from one comparison group: the difficulty, length and
 * scoring version of the player's latest run of that drill. These helpers keep the settings a row prints
 * (and what "Play" launches) matched with the runs that best and rank came from.
 */
import { difficultyLabel, durationLabel } from './practice-v3'
import { scoringVersionOf } from '../../../lib/training-result-metrics'

type Difficulty = 'easy' | 'medium' | 'hard' | 'pro'
const DIFFICULTIES: readonly string[] = ['easy', 'medium', 'hard', 'pro']

export interface BestGroup { difficulty: string; duration_seconds: number }
export interface DrillSettings { difficulty: Difficulty; duration_seconds: number }
interface RunLike { scenario: string; score: number; duration_seconds: number; metadata?: Record<string, unknown> }

/** The comparison group a best came from, or null when the API sent none (or an unknown one). */
export function bestGroup(comparison: unknown): DrillSettings | null {
  if (!comparison || typeof comparison !== 'object') return null
  const { difficulty, duration_seconds } = comparison as Partial<BestGroup>
  if (typeof difficulty !== 'string' || !DIFFICULTIES.includes(difficulty)) return null
  if (typeof duration_seconds !== 'number' || !Number.isFinite(duration_seconds) || duration_seconds <= 0) return null
  return { difficulty: difficulty as Difficulty, duration_seconds }
}

export function sameSettings(a: BestGroup | null | undefined, b: BestGroup | null | undefined): boolean {
  return !!a && !!b && a.difficulty === b.difficulty && a.duration_seconds === b.duration_seconds
}

/** "Easy · 30 s" */
export function settingsLabel(s: BestGroup | null | undefined): string {
  if (!s) return ''
  return [difficultyLabel(s.difficulty), durationLabel(s.duration_seconds)].filter(Boolean).join(' · ')
}

/**
 * Best and rank for a row that launches `settings`. When the API's group matches, its best and rank
 * stand. Otherwise the best is the highest run at exactly these settings and the group's scoring version on
 * the history page (no rank: ranks are per group), or none.
 */
export function bestForSettings(
  scenario: string,
  settings: BestGroup,
  group: BestGroup | null,
  apiBest: number | null,
  apiRank: number | null,
  recentRuns: readonly RunLike[] | null | undefined,
  scoringVersion: number | null,
): { best: number | null; rank: number | null } {
  if (group === null || sameSettings(group, settings)) return { best: apiBest, rank: apiRank }
  let best: number | null = null
  for (const r of recentRuns ?? []) {
    if (r.scenario !== scenario || r.duration_seconds !== settings.duration_seconds || !Number.isFinite(r.score)) continue
    if (r.metadata?.difficulty !== settings.difficulty) continue
    if (scoringVersion == null || scoringVersionOf(r) !== scoringVersion) continue
    best = best === null ? r.score : Math.max(best, r.score)
  }
  return { best, rank: null }
}
