import { describe, expect, it } from 'vitest'

describe('guided session summary', () => {
  const step = (phase: 'warmup' | 'focus' | 'cooldown', scenario: 'flick' | 'microadjust', difficulty: 'easy' | 'hard', duration_seconds: number) => ({
    phase, phaseLabel: phase, scenario, difficulty, duration_seconds, weakness: 'aim', weakness_score: 5, reason: '',
  })
  const steps = [step('warmup', 'flick', 'easy', 30), step('focus', 'flick', 'hard', 60), step('cooldown', 'microadjust', 'easy', 30)]
  const results = [{ scenario: 'flick', score: 80 }, { scenario: 'flick', score: 62 }, { scenario: 'microadjust', score: 70 }]

  it('shows no number that mixes settings (no average, no focus vs warm-up)', async () => {
    const { buildSessionSummary } = await import('./structured-session')
    const s = buildSessionSummary(steps, results) as unknown as Record<string, unknown>
    expect(s).not.toHaveProperty('avgScore')
    expect(s).not.toHaveProperty('improvementVsWarmup')
    expect(s).not.toHaveProperty('warmupAvg')
    expect(s.focusScore).toBe(62)
    expect(s.focusVsLast).toBeNull()
  })

  it('compares the focus run only with the last run on its own settings', async () => {
    const { buildSessionSummary } = await import('./structured-session')
    expect(buildSessionSummary(steps, results, 4).focusVsLast).toBe(4)
    expect(buildSessionSummary(steps, results.slice(0, 1), 4).focusVsLast).toBeNull()
  })

  it('labels each step with its settings', async () => {
    const { sessionStepSettings } = await import('./structured-session')
    expect(steps.map(sessionStepSettings)).toEqual(['Easy · 30s', 'Hard · 60s', 'Easy · 30s'])
  })
})
