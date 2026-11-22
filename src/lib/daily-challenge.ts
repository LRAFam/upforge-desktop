/**
 * The daily challenge on Practice: one drill and target score per local calendar day, played at fixed
 * settings. It is done only by a run of that drill at those settings, at or above the target, finished
 * on the same local day. (The tile used to accept any difficulty or length, and chose the drill by local
 * date but checked runs by UTC date, so it could flip around midnight UTC.)
 */
import { trainingTimestamp } from './training-result-metrics'

/** Every daily challenge launches with these settings. */
export const DAILY_CHALLENGE_SETTINGS = { difficulty: 'medium', duration_seconds: 60 } as const
const TARGETS = [60, 65, 70, 75, 80] as const

export interface DailyChallenge {
  scenario: string
  /** Score to reach (0–100, shown ×10 on result screens). */
  target: number
  difficulty: typeof DAILY_CHALLENGE_SETTINGS.difficulty
  duration_seconds: typeof DAILY_CHALLENGE_SETTINGS.duration_seconds
  /** Local calendar day (YYYY-MM-DD) the challenge belongs to. */
  day: string
}

interface RunLike {
  scenario: string
  score?: number
  completed_at: string
  duration_seconds?: number
  metadata?: Record<string, unknown>
}

/** Local calendar day as YYYY-MM-DD. */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Today's challenge (deterministic from the local date; the same for everyone on that day). */
export function dailyChallengeFor(now: Date, scenarios: readonly string[]): DailyChallenge {
  const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate()
  return {
    scenario: scenarios[seed % scenarios.length],
    target: TARGETS[Math.floor(seed / 10) % TARGETS.length],
    ...DAILY_CHALLENGE_SETTINGS,
    day: localDayKey(now),
  }
}

/** True when one of `runs` is the run the challenge asked for: same drill and settings, on target, today. */
export function dailyChallengeDone(challenge: DailyChallenge, runs: readonly RunLike[]): boolean {
  return runs.some(r => {
    if (r.scenario !== challenge.scenario || typeof r.score !== 'number' || !Number.isFinite(r.score) || r.score < challenge.target) return false
    if (r.metadata?.difficulty !== challenge.difficulty || r.duration_seconds !== challenge.duration_seconds) return false
    const t = trainingTimestamp(r.completed_at)
    return Number.isFinite(t) && localDayKey(new Date(t)) === challenge.day
  })
}
