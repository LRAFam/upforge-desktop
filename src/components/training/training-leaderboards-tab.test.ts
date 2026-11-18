import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The leaderboard said "since the scoring update on 24 Sep 2026" while the Train tab said Nov 2026.
describe('leaderboard scoring note', () => {
  it('uses the one scoring-update date the rest of Practice shows', () => {
    const tab = readFileSync(resolve(__dirname, 'TrainingLeaderboardsTab.vue'), 'utf8')
    const note = tab.split('\n').filter(l => /scoring update/i.test(l) && !/^\s*(\/\/|\/?\*)/.test(l))
    expect(note).toHaveLength(1)
    expect(note[0]).toContain('{{ SCORING_UPDATE_LABEL }}')
    expect(tab).toMatch(/import \{ SCORING_UPDATE_LABEL \} from '\.\.\/v3\/practice\/practice-v3'/)
    // No hard-coded day-month-year dates left in the tab.
    expect(tab).not.toMatch(/\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* 20\d\d\b/)
  })
})
