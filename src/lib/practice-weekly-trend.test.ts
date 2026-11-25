import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import cases from './__fixtures__/practice-weekly-trend.json'
import { weeklyShareCardData, type WeeklyCardRun } from './weekly-share-card'
import { comparableTrainingRuns, currentScoringVersion, trainingComparisonRequest } from './training-result-metrics'
import { practiceActivity } from './trainer-achievements'
import { practiceStatItems, type PracticeStats } from '../components/v3/practice/practice-v3'

// Execute the real computed that feeds PracticeV3, without mounting the trainer/IPC-heavy view.
const view = readFileSync(resolve(__dirname, '../views/TrainingHubView.vue'), 'utf8')
const start = view.indexOf('const trainingStats = computed(')
const end = view.indexOf('// ── Daily challenge', start)
if (start < 0 || end < 0) throw new Error('TrainingHub trainingStats block not found')
const compiled = ts.transpileModule(`${view.slice(start, end)}\nglobalThis.result = trainingStats.value`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText
const now = new Date('2026-11-24T12:00:00Z')
function run(score: number, daysAgo: number): WeeklyCardRun {
  return { scenario: 'flick', score, duration_seconds: 60,
    completed_at: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
    metadata: { game: 'valorant', difficulty: 'medium', scoring_version: currentScoringVersion('flick') } }
}
function stats(sessions: WeeklyCardRun[]): PracticeStats {
  const context = vm.createContext({ Date, apiHistory: { value: { sessions } },
    computed: (fn: () => unknown) => ({ value: fn() }),
    trainingComparisonRequest, comparableTrainingRuns, practiceActivity, SCENARIO_META: { flick: { label: 'Flick' } } })
  vm.runInContext(compiled, context)
  return context.result
}

afterEach(() => vi.useRealTimers())
describe('Practice weekly trend minimum sample golden cases', () => {
  for (const c of cases) {
    it(c.name, () => {
      vi.useFakeTimers().setSystemTime(now)
      const sessions = [...c.current.map((score, i) => run(score, 1 + i)),
        ...c.previous.map((score, i) => run(score, 8 + i))]
      const practice = stats(sessions)
      expect.soft(practice.improvement).toBe(c.delta)
      expect.soft(practiceStatItems(practice).some(item => item.label === 'vs last week')).toBe(c.delta !== null)
      expect(weeklyShareCardData(sessions, now, () => 'Flick').vsPrevious?.value ?? null).toBe(c.delta)
    })
  }

  it('does not let other settings, games or scoring rules fill an undersized cohort', () => {
    vi.useFakeTimers().setSystemTime(now)
    const mismatched = [
      { ...run(95, 2), duration_seconds: 30 },
      { ...run(95, 3), metadata: { ...run(95, 3).metadata, difficulty: 'hard' } },
      { ...run(95, 4), metadata: { ...run(95, 4).metadata, game: 'cs2' } },
      { ...run(95, 5), metadata: { ...run(95, 5).metadata, scoring_version: 2 } },
    ]
    const sessions = [run(80, 1), ...mismatched, run(50, 8), run(50, 9), run(50, 10)]
    expect.soft(stats(sessions).improvement).toBeNull()
    const card = weeklyShareCardData(sessions, now, () => 'Flick')
    expect(card.vsPrevious).toBeNull()
    expect(card.avg?.value).toBe(80)
    expect(card.runCount).toBe(5)
  })
})
