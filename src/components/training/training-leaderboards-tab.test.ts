import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CURRENT_SCORING_ONLY } from '../v3/practice/practice-v3'

// The leaderboard said "since the scoring update on 24 Sep 2026" while the Train tab said Nov 2026. Scoring now
// changes per drill (trainer 1.13.0, then the drills changed after it), so the note names no date at all.
describe('leaderboard scoring note', () => {
  it('uses the one scoring line the rest of Practice shows, with no date', () => {
    const tab = readFileSync(resolve(__dirname, 'TrainingLeaderboardsTab.vue'), 'utf8')
    expect(tab).toMatch(/import \{ CURRENT_SCORING_ONLY \} from '\.\.\/v3\/practice\/practice-v3'/)
    expect(tab).toContain('{{ CURRENT_SCORING_ONLY }}')
    expect(tab).not.toMatch(/scoring update/i)
    expect(CURRENT_SCORING_ONLY).not.toMatch(/\b(20\d\d|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/)
    // No hard-coded day-month-year dates left in the tab.
    expect(tab).not.toMatch(/\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* 20\d\d\b/)
  })

  it('asks for the board and your own best on this app’s scoring rules for the drill', () => {
    const tab = readFileSync(resolve(__dirname, 'TrainingLeaderboardsTab.vue'), 'utf8')
    expect(tab).toMatch(/getLeaderboard\([^)]*currentScoringVersion\(activeScenario\.value\)\)/)
    expect(tab).toMatch(/scoring_version: currentScoringVersion\(activeScenario\.value\)/)
  })
})
