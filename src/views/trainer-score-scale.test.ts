import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { trainerRunSummary } from '../lib/trainer-run-summary'
import { trainerSyncLine } from '../lib/trainer-sync'
import { drillLoop } from '../lib/drill-loop'

// The trainer scores a run 0–100 and the API stores and ranks that number. Every Practice surface shows it
// as it is: the result screen once showed 870 "/ 1000" for a run that read 87 everywhere else.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const dir = (path: string) => readdirSync(new URL(path, import.meta.url)).filter(f => f.endsWith('.vue')).map(f => `${path}/${f}`)

const SURFACES = [
  './TrainerResultsView.vue',
  './OverlayView.vue',
  './TrainingHubView.vue',
  './v3/PracticeV3.vue',
  ...dir('../components/training'),
  ...dir('../components/v3/practice'),
  '../lib/trainer-run-summary.ts',
  '../lib/trainer-sync.ts',
  '../lib/drill-loop.ts',
]

describe('one score scale for trainer runs (0–100)', () => {
  it('no Practice surface multiplies a trainer score or shows it out of 1000', () => {
    const scaled: string[] = []
    for (const path of SURFACES) {
      const src = read(path)
      for (const pattern of [/score\)?\s*\*\s*10\b/, /\*\s*SCALE\b/, /scoreScale/, /\/ 1000(?!\d|px)/]) {
        if (pattern.test(src)) scaled.push(`${path}: ${pattern}`)
      }
    }
    expect(scaled).toEqual([])
  })

  it('the result screen shows the run’s own score out of 100, and its chart is labelled on the same scale', () => {
    const view = read('./TrainerResultsView.vue')
    expect(view).toMatch(/<span class="uf-d1">\{\{ result\.score \}\}<\/span>\s*<span class="uf-tr-score-meta">\s*<span class="uf-t4">\/ 100 · \{\{ scoreLabel\(result\.score\) \}\}<\/span>/)
    expect(view).toMatch(/label: String\(v\),/)
    expect(view).toMatch(/const scoreDelta = computed\(\(\) => priorSessions\.value\.length \? result\.value\.score - priorSessions\.value\[0\]\.score : null\)/)
  })

  it('the in-game overlay shows the same number', () => {
    expect(read('./OverlayView.vue')).toMatch(/\{\{ trainerResult\.score \}\}\s*<\/span>\s*<span[^>]*>\/ 100<\/span>/)
  })

  it('the run summary, the drill line and the pass marks use the numbers the API stores', () => {
    const run = { scenario: 'flick', score: 87, accuracy_pct: 80, avg_reaction_ms: 300, consistency_score: 60, targets_hit: 40 }
    const summary = trainerRunSummary({ run, previous: { ...run, score: 84 }, best: 87, history: 'ok' })
    expect(summary.headline).toBe('Up 3 from your last run at these settings (84 → 87).')
    expect(summary.details[0]).toBe('Matches your best at these settings (87).')
    const drill = { drill_id: 1, status: 'active', attempt_count: 1, attempts_allowed: 3, pass_score: 75, completed: false, next: null }
    expect(trainerSyncLine({ key: 'k', clientRunId: 'c', state: 'saved', drill } as never, true).text).toContain('Pass at 75')
    expect(drillLoop(null, { ...drill, practice_passed: false } as never)!.state.text).toBe('Score 75 or more to hit the practice target.')
  })
})
