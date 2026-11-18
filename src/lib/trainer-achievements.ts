/**
 * Achievements after a trainer run. The app shell hears every `trainer:session-result` (Practice,
 * "Play again" on the result screen, Home, a match report), so the check lives there, once.
 */
import type { SessionResult } from '../stores/trainerResult'

type CheckContext = {
  totalDrills?: number
  streak?: number
  lastScore?: number
  lastAccuracy?: number
  lastRun?: { scenario: string; avg_reaction_ms: number; targets_hit?: number }
}

/** Header counts the API works out from every run (GET /api/training/sessions `activity`). */
export type TrainingActivity = { total_runs: number; week_count: number; streak_days: number; timezone?: string }

type HistoryLike = { total?: number; sessions?: ReadonlyArray<{ completed_at: string }>; activity?: Partial<TrainingActivity> | null }

const DAY_MS = 86_400_000

/** The player's local calendar day (YYYY-MM-DD), not the UTC day. */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Consecutive local days back from today with at least one run (today may still be empty). */
export function trainingStreak(completedAts: readonly string[], now: Date = new Date()): number {
  const days = new Set(completedAts.map(c => new Date(c)).filter(d => !Number.isNaN(d.getTime())).map(localDayKey))
  let streak = 0
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  for (let i = 0; i < 400; i++) {
    if (days.has(localDayKey(day))) streak++
    else if (i > 0) break
    day.setDate(day.getDate() - 1)
  }
  return streak
}

const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null)

/**
 * Day streak, runs in the last 7 days and total runs. Uses the API's all-run `activity` when it is there;
 * an older API or an offline cache without it falls back to the loaded page of runs.
 */
export function practiceActivity(history: HistoryLike | null | undefined, now: Date = new Date()): { streak: number; weekCount: number; total: number } {
  const runs = history?.sessions ?? []
  const weekAgo = now.getTime() - 7 * DAY_MS
  const a = history?.activity
  return {
    streak: count(a?.streak_days) ?? trainingStreak(runs.map(s => s.completed_at), now),
    weekCount: count(a?.week_count) ?? runs.filter(s => new Date(s.completed_at).getTime() >= weekAgo).length,
    total: count(a?.total_runs) ?? history?.total ?? 0,
  }
}

/** What the run and the account's history say, in the shape useAchievements().check takes. */
export function runAchievementContext(
  result: Pick<SessionResult, 'scenario' | 'score' | 'accuracy_pct' | 'avg_reaction_ms' | 'targets_hit' | 'completed_at'>,
  history: HistoryLike | null,
  now: Date = new Date(),
): CheckContext {
  const runs = (history?.sessions ?? []).map(s => s.completed_at)
  const activity = practiceActivity(history, now)
  return {
    // The run may not be synced yet, so it counts towards the total (and today) at least once.
    totalDrills: Math.max(activity.total, 1),
    streak: Math.max(activity.streak, trainingStreak([...runs, result.completed_at], now)),
    lastScore: result.score,
    lastAccuracy: result.accuracy_pct,
    // Reaction King uses measuredReactionMs (useAchievements): no tracking, 0-hit or 0 ms runs.
    lastRun: { scenario: result.scenario, avg_reaction_ms: result.avg_reaction_ms, targets_hit: result.targets_hit },
  }
}

export async function checkRunAchievements(
  result: SessionResult,
  deps: {
    getHistory: () => Promise<HistoryLike | null>
    check: (ctx: CheckContext) => Promise<string[]>
    notify: (ids: string[]) => void
  },
): Promise<string[]> {
  const history = await deps.getHistory().catch(() => null)
  const fresh = await deps.check(runAchievementContext(result, history))
  if (fresh.length) deps.notify(fresh)
  return fresh
}
