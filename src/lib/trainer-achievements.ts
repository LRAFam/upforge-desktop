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
  lastReactionMs?: number
}

const DAY_MS = 86_400_000

/** Consecutive days back from today with at least one run (today may still be empty). */
export function trainingStreak(completedAts: readonly string[], now: Date = new Date()): number {
  const days = new Set(completedAts.map(c => c.slice(0, 10)))
  let streak = 0
  for (let i = 0; i < 60; i++) {
    const key = new Date(now.getTime() - i * DAY_MS).toISOString().slice(0, 10)
    if (days.has(key)) streak++
    else if (i > 0) break
  }
  return streak
}

/** What the run and the account's history say, in the shape useAchievements().check takes. */
export function runAchievementContext(
  result: Pick<SessionResult, 'score' | 'accuracy_pct' | 'avg_reaction_ms' | 'completed_at'>,
  history: { total?: number; sessions?: ReadonlyArray<{ completed_at: string }> } | null,
  now: Date = new Date(),
): CheckContext {
  const runs = (history?.sessions ?? []).map(s => s.completed_at)
  return {
    // The run may not be synced yet, so it counts towards the total at least once.
    totalDrills: Math.max(history?.total ?? 0, 1),
    streak: trainingStreak([...runs, result.completed_at], now),
    lastScore: result.score,
    lastAccuracy: result.accuracy_pct,
    // Tracking drills report 0 ms (no reaction measured): that is not a sub-200 ms reaction.
    ...(result.avg_reaction_ms > 0 ? { lastReactionMs: result.avg_reaction_ms } : {}),
  }
}

export async function checkRunAchievements(
  result: SessionResult,
  deps: {
    getHistory: () => Promise<{ total?: number; sessions?: ReadonlyArray<{ completed_at: string }> } | null>
    check: (ctx: CheckContext) => Promise<string[]>
    notify: (ids: string[]) => void
  },
): Promise<string[]> {
  const history = await deps.getHistory().catch(() => null)
  const fresh = await deps.check(runAchievementContext(result, history))
  if (fresh.length) deps.notify(fresh)
  return fresh
}
