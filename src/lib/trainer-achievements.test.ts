import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { checkRunAchievements, localDayKey, practiceActivity, runAchievementContext, trainingStreak } from './trainer-achievements'
import { historyTimeZoneParams } from './practice-trainer-data'

const run = { scenario: 'flick', duration_seconds: 60, score: 92, accuracy_pct: 80, avg_reaction_ms: 0, consistency_score: 0, targets_hit: 1, targets_missed: 0, completed_at: '2026-11-18T10:00:00' }
const now = new Date(2026, 10, 18, 12) // local noon: streaks count the player's local days

describe('achievements after a trainer run', () => {
  it('counts the streak including the run that just ended', () => {
    expect(trainingStreak(['2026-11-17T09:00:00', '2026-11-16T09:00:00'], now)).toBe(2)
    expect(runAchievementContext(run, { total: 4, sessions: [{ completed_at: '2026-11-17T09:00:00' }] }, now).streak).toBe(2)
  })

  it('passes the run so Reaction King uses the measured-reaction rule', () => {
    expect(runAchievementContext({ ...run, avg_reaction_ms: 180 }, null, now).lastRun)
      .toEqual({ scenario: 'flick', avg_reaction_ms: 180, targets_hit: 1 })
  })

  it('checks a 90+ run even when history cannot be read', async () => {
    const check = vi.fn(async () => ['score-90'])
    const notify = vi.fn()
    await checkRunAchievements(run, { getHistory: () => Promise.reject(new Error('offline')), check, notify })
    expect(check).toHaveBeenCalledWith(expect.objectContaining({ lastScore: 92, totalDrills: 1 }))
    expect(notify).toHaveBeenCalledWith(['score-90'])
  })

  it('is wired once, in the app shell, before the route check (so "Play again" runs count)', () => {
    const root = join(__dirname, '..')
    const app = readFileSync(join(root, 'App.vue'), 'utf8')
    const listener = app.slice(app.indexOf("api.on('trainer:session-result'"))
    expect(listener.indexOf('checkRunAchievements(')).toBeGreaterThan(-1)
    expect(listener.indexOf('checkRunAchievements(')).toBeLessThan(listener.indexOf('shellOpensTrainerResult('))
    for (const view of ['views/TrainingHubView.vue', 'views/TrainerResultsView.vue']) {
      expect(readFileSync(join(root, view), 'utf8')).not.toMatch(/achievements\.check\(/)
    }
  })
})

// 200 runs over 10 local days (20 a day), newest first, like GET /api/training/sessions.
function tenDaysOfRuns(today: Date): Array<{ completed_at: string }> {
  const runs: Array<{ completed_at: string }> = []
  for (let d = 0; d < 10; d++) {
    for (let r = 0; r < 20; r++) {
      runs.push({ completed_at: new Date(today.getFullYear(), today.getMonth(), today.getDate() - d, 20, 30 - r).toISOString() })
    }
  }
  return runs
}

describe('day streak and week count come from every run', () => {
  const today = new Date(2026, 10, 18, 22, 0)

  it('200 runs over 10 days: the API activity gives streak 10 and the true week count', () => {
    const all = tenDaysOfRuns(today)
    const page = { total: 200, sessions: all.slice(0, 50), activity: { total_runs: 200, week_count: 140, streak_days: 10, timezone: 'Europe/London' } }
    expect(practiceActivity(page, today)).toEqual({ streak: 10, weekCount: 140, total: 200 })
    // The 50-run page alone could only see 3 days; that was the bug.
    expect(practiceActivity({ ...page, activity: undefined }, today).streak).toBe(3)
    // The full 200 runs give the same answer locally.
    expect(trainingStreak(all.map(r => r.completed_at), today)).toBe(10)
  })

  it('streak achievements use the all-run streak, not the 50-run page', async () => {
    const check = vi.fn(async () => [])
    const history = { total: 200, sessions: tenDaysOfRuns(today).slice(0, 50), activity: { total_runs: 200, week_count: 140, streak_days: 10 } }
    await checkRunAchievements({ ...run, completed_at: today.toISOString() } as never, { getHistory: async () => history, check, notify: () => {} })
    expect(check).toHaveBeenCalledWith(expect.objectContaining({ streak: 10, totalDrills: 200 }))
  })

  it('an unsynced run today still extends the API streak (API counted through yesterday)', () => {
    const ctx = runAchievementContext({ ...run, completed_at: today.toISOString() },
      { total: 3, sessions: [], activity: { total_runs: 3, week_count: 3, streak_days: 2 } }, today)
    expect(ctx.streak).toBe(2)
    const yesterdayRuns = [1, 2].map(d => ({ completed_at: new Date(2026, 10, 18 - d, 12).toISOString() }))
    expect(runAchievementContext({ ...run, completed_at: today.toISOString() }, { total: 2, sessions: yesterdayRuns, activity: { total_runs: 2, week_count: 2, streak_days: 2 } }, today).streak).toBe(3)
  })

  it('falls back to the loaded runs when the API (or an old cache) has no activity', () => {
    const runs = [0, 1, 2, 9].map(d => ({ completed_at: new Date(2026, 10, 18 - d, 12).toISOString() }))
    expect(practiceActivity({ total: 4, sessions: runs }, today)).toEqual({ streak: 3, weekCount: 3, total: 4 })
    expect(practiceActivity(null, today)).toEqual({ streak: 0, weekCount: 0, total: 0 })
  })

  it('counts local days, not UTC days', () => {
    // 23:30 local is still "today" even when UTC has rolled over (or not yet arrived).
    const late = new Date(2026, 10, 17, 23, 30)
    expect(localDayKey(late)).toBe('2026-11-17')
    expect(trainingStreak([late.toISOString(), new Date(2026, 10, 16, 0, 15).toISOString()], new Date(2026, 10, 18, 9))).toBe(2)
  })

  it('sends the player time zone on the history call', () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(historyTimeZoneParams()).toEqual(tz ? { tz } : {})
    const root = join(__dirname, '..', '..')
    const ipc = readFileSync(join(root, 'electron/main/ipc/gaming-ipc.ts'), 'utf8')
    const calls = ipc.match(/get\('\/api\/training\/sessions', \{ params: \{[^\n]*/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const c of calls) expect(c).toContain('historyTimeZoneParams()')
  })
})

