import { describe, expect, it } from 'vitest'
import { runTrendMessage, topRuns, trainerRunSummary, type RunNumbers } from './trainer-run-summary'

const run = (over: Partial<RunNumbers> = {}): RunNumbers => ({
  scenario: 'flick', score: 64, accuracy_pct: 81, avg_reaction_ms: 310, consistency_score: 58, targets_hit: 40, ...over,
})
const lines = (s: ReturnType<typeof trainerRunSummary>) => [s.headline, ...s.details]

describe('trainerRunSummary: measured facts only', () => {
  it('compares with the last run at these settings, names what moved and the best', () => {
    const s = trainerRunSummary({ run: run(), previous: run({ score: 60, accuracy_pct: 72, avg_reaction_ms: 340, consistency_score: 60 }), best: 72, history: 'ok' })
    expect(s.headline).toBe('Up 4 from your last run at these settings (60 → 64).')
    expect(s.details).toEqual([
      'Best at these settings: 72.',
      'Since your last run: accuracy 72.0% → 81.0%, time to hit 340 → 310 ms, consistency 60 → 58.',
    ])
  })

  it('says when the score went down or stayed the same', () => {
    expect(trainerRunSummary({ run: run({ score: 50 }), previous: run({ score: 53 }), best: 70, history: 'ok' }).headline)
      .toBe('Down 3 from your last run at these settings (53 → 50).')
    const same = trainerRunSummary({ run: run(), previous: run(), best: 64, history: 'ok' })
    expect(same.headline).toBe('Same score as your last run at these settings (64).')
    expect(same.details).toEqual(['Matches your best at these settings (64).'])
  })

  it('a new best names the old one', () => {
    expect(trainerRunSummary({ run: run({ score: 75 }), previous: run(), best: 70, history: 'ok' }).details[0]).toBe('New best at these settings. Previous best: 70.')
  })

  it('first run at these settings: nothing to compare', () => {
    expect(lines(trainerRunSummary({ run: run(), previous: null, best: null, history: 'ok' }))).toEqual(['First run at these settings.'])
  })

  it('history that did not load is not shown as a first run or a rank', () => {
    const s = trainerRunSummary({ run: run(), previous: null, best: null, history: 'failed' })
    expect(s.headline).toBe('Couldn’t load your earlier runs, so this run isn’t compared yet.')
    expect(lines(trainerRunSummary({ run: run(), previous: null, best: null, history: 'loading' }))[0]).toBe('Loading your earlier runs…')
    expect(trainerRunSummary({ run: run(), previous: null, best: null, history: 'none' }).headline).toMatch(/^Not compared/)
  })

  it('uses the drill’s own labels and leaves out numbers that were not measured', () => {
    const peek = trainerRunSummary({ run: run({ scenario: 'jiggle_peek', accuracy_pct: 70, avg_reaction_ms: 380 }), previous: run({ scenario: 'jiggle_peek', accuracy_pct: 60, avg_reaction_ms: 420 }), best: 64, history: 'ok' })
    expect(peek.details).toContain('Since your last run: safe-spot rate 60.0% → 70.0%, exposure 420 → 380 ms.')
    const track = trainerRunSummary({ run: run({ scenario: 'tracking', accuracy_pct: 55 }), previous: run({ scenario: 'tracking', accuracy_pct: 50 }), best: 64, history: 'ok' })
    expect(track.details).toContain('Since your last run: time on target 50.0% → 55.0%.')
    expect(track.details.at(-1)).toBe('Time on target is the share of the drill your crosshair stayed on the target (no click needed). Reaction time and click consistency do not apply to this drill.')
    // Strafe Track needs no click either: it does not measure "while firing".
    const strafe = trainerRunSummary({ run: run({ scenario: 'strafe_track' }), previous: null, best: null, history: 'ok' })
    expect(strafe.details).toEqual([track.details.at(-1)])
    const oneHit = trainerRunSummary({ run: run({ targets_hit: 1 }), previous: run({ targets_hit: 1, avg_reaction_ms: 400 }), best: 64, history: 'ok' })
    expect(oneHit.details).toContain('Since your last run: time to hit 400 → 310 ms.')
    expect(oneHit.details.at(-1)).toBe('At least two successful hits are needed to measure consistency.')
    const noHits = trainerRunSummary({ run: run({ targets_hit: 0, avg_reaction_ms: 0, accuracy_pct: 0 }), previous: null, best: null, history: 'ok' })
    expect(noHits.details).toEqual(['No successful hits recorded, so time to hit and consistency were not measured.'])
  })

  it('does not compare or count a consistency the run did not measure (Defuse Decision, Trade Window)', () => {
    // Defuse Decision: older trainers sent the spread of whole rounds (0 on a clean run), never a consistency.
    const oldDefuse = run({ scenario: 'defuse_decision', score: 90, avg_reaction_ms: 320, consistency_score: 0, targets_hit: 5, metadata: { lurkers_killed: 4 } })
    const defuse = run({ scenario: 'defuse_decision', score: 94, avg_reaction_ms: 300, consistency_score: 92, targets_hit: 5, metadata: { lurkers_killed: 4, consistency_samples: 4 } })
    const vsOld = trainerRunSummary({ run: defuse, previous: oldDefuse, best: 90, history: 'ok' })
    expect(vsOld.details).toContain('Since your last run: reaction 320 → 300 ms.')
    const oneDuel = trainerRunSummary({ run: { ...defuse, consistency_score: 0, metadata: { lurkers_killed: 1, consistency_samples: 1 } }, previous: null, best: null, history: 'ok' })
    expect(oneDuel.details).toEqual(['At least two lurker kills are needed to measure consistency.'])
    // Trade Window: one trade and some opening kills times one trade, so no consistency yet.
    const trade = run({ scenario: 'trade_window', avg_reaction_ms: 900, consistency_score: 0, targets_hit: 10, metadata: { trades: 1, opening_kills: 9 } })
    const before = run({ scenario: 'trade_window', avg_reaction_ms: 950, consistency_score: 70, targets_hit: 8, metadata: { trades: 4, opening_kills: 4 } })
    const tw = trainerRunSummary({ run: trade, previous: before, best: 70, history: 'ok' })
    expect(tw.details.join(' ')).not.toMatch(/consistency 70/)
    expect(tw.details.at(-1)).toBe('At least two trades are needed to measure consistency.')
  })

  it('an earlier run from the API with decimals as strings ("72.50", MySQL DECIMAL) still compares', () => {
    // GET /api/training/sessions row as the live API sends it: accuracy, reaction and consistency are strings.
    const apiRow = JSON.parse('{"scenario":"flick","score":60,"accuracy_pct":"72.50","avg_reaction_ms":"340.00","consistency_score":"60.00","targets_hit":38}') as RunNumbers
    const s = trainerRunSummary({ run: run(), previous: apiRow, best: 64, history: 'ok' })
    expect(s.headline).toBe('Up 4 from your last run at these settings (60 → 64).')
    expect(s.details).toEqual([
      'Matches your best at these settings (64).',
      'Since your last run: accuracy 72.5% → 81.0%, time to hit 340 → 310 ms, consistency 60 → 58.',
    ])
    // A best that arrives as a string is still the same number.
    expect(trainerRunSummary({ run: run(), previous: apiRow, best: '64' as unknown as number, history: 'ok' }).details[0])
      .toBe('Matches your best at these settings (64).')
    // A number the API left out is skipped, never printed as "NaN".
    const partial = trainerRunSummary({ run: run(), previous: { ...apiRow, accuracy_pct: null as unknown as number }, best: 64, history: 'ok' })
    expect(partial.details).toContain('Since your last run: time to hit 340 → 310 ms, consistency 60 → 58.')
  })

  it('offline, shows no rank and no "play another run" trend hint', () => {
    const current = { score: 64, completed_at: '2026-11-18T10:00:00Z' }
    const prior = [{ score: 70, completed_at: '2026-11-17T10:00:00Z' }, { score: 50, completed_at: '2026-11-16T10:00:00Z' }]
    for (const history of ['failed', 'loading', 'none'] as const) {
      expect(topRuns(history, prior, current), history).toEqual([]) // no "★1" against nothing
      expect(runTrendMessage(history, 1), history).toBeNull()
    }
    expect(topRuns('ok', prior, current).map(r => [r.rank, r.score, r.isCurrent])).toEqual([[1, 70, false], [2, 64, true], [3, 50, false]])
    expect(runTrendMessage('ok', 1)).toBe('Play another run with the same difficulty and length to see a trend.')
    expect(runTrendMessage('ok', 3)).toBeNull()
  })

  it('never praises, advises or claims a cause, so it cannot contradict the score label', () => {
    const banned = /strong|excellent|outstanding|great|good|poor|weak|consider|try |should|warm up|muscle|suggest|because|impact|improv|lock this in|ceiling|cadence/i
    for (const score of [5, 30, 50, 65, 80, 95]) {
      for (const accuracy_pct of [10, 40, 70, 90]) {
        for (const history of ['ok', 'failed', 'loading', 'none'] as const) {
          const r = run({ score, accuracy_pct })
          for (const previous of [null, run({ score: 50, accuracy_pct: 50 })]) {
            for (const line of lines(trainerRunSummary({ run: r, previous, best: previous ? 60 : null, history }))) {
              expect(line, line).not.toMatch(banned)
            }
          }
        }
      }
    }
  })
})
