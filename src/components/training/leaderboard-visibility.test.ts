import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { leaderboardDisplayName, visibilityLine, youNote } from './leaderboard-visibility'

describe('leaderboard visibility', () => {
  it('names the Riot ID other players see', () => {
    expect(leaderboardDisplayName({ name: 'Acc', riot_name: 'Player', riot_tag: 'EUW' })).toBe('Player#EUW')
    expect(leaderboardDisplayName({ name: 'Acc', riot_name: null })).toBe('Acc')
    expect(visibilityLine(true, 'Player#EUW')).toContain('Player#EUW')
    expect(visibilityLine(null, 'Player#EUW')).toBeNull()
  })

  it('tells a hidden player they are hidden, not that they will appear', () => {
    const waiting = 'Not on the board yet. It refreshes every 10 minutes and hides players who opted out.'
    expect(youNote(waiting, false)).toBe('You are hidden from leaderboards.')
    expect(youNote(waiting, true)).toBe(waiting)
    expect(visibilityLine(false, 'Player#EUW')).toMatch(/^You are hidden from leaderboards/)
  })

  it('the leaderboard tab offers the switch through the account privacy setting', () => {
    const tab = readFileSync(join(__dirname, 'TrainingLeaderboardsTab.vue'), 'utf8')
    expect(tab).toContain('setLeaderboardVisibility(')
    const ipc = readFileSync(join(__dirname, '..', '..', '..', 'electron', 'main', 'ipc', 'gaming-ipc.ts'), 'utf8')
    expect(ipc).toMatch(/put\('\/api\/profile\/privacy', \{ leaderboard_opt_in: visible \}\)/)
  })
})
