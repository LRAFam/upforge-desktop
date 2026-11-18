import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { checkRunAchievements, runAchievementContext, trainingStreak } from './trainer-achievements'

const run = { scenario: 'flick', duration_seconds: 60, score: 92, accuracy_pct: 80, avg_reaction_ms: 0, consistency_score: 0, targets_hit: 1, targets_missed: 0, completed_at: '2026-11-18T10:00:00' }
const now = new Date('2026-11-18T12:00:00Z')

describe('achievements after a trainer run', () => {
  it('counts the streak including the run that just ended', () => {
    expect(trainingStreak(['2026-11-17T09:00:00', '2026-11-16T09:00:00'], now)).toBe(2)
    expect(runAchievementContext(run, { total: 4, sessions: [{ completed_at: '2026-11-17T09:00:00' }] }, now).streak).toBe(2)
  })

  it('does not treat a tracking run with no reaction time as a fast reaction', () => {
    expect(runAchievementContext(run, null, now)).not.toHaveProperty('lastReactionMs')
    expect(runAchievementContext({ ...run, avg_reaction_ms: 180 }, null, now).lastReactionMs).toBe(180)
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
