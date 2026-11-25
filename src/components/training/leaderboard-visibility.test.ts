import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { leaderboardDisplayName, looksLikeEmail, publicAlias, safeBoardName, visibilityLine, youNote } from './leaderboard-visibility'

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

describe('leaderboard public names', () => {
  it('never shows an email-shaped name: it uses the generated alias', () => {
    expect(leaderboardDisplayName({ id: 1, name: 'me@example.com', riot_name: null })).toBe('Player-9E37')
    expect(leaderboardDisplayName({ id: 2, name: '   ' })).toBe('Player-3C6E')
    expect(leaderboardDisplayName({ name: 'me@example.com' })).toBeNull()
    expect(leaderboardDisplayName({ id: 1, name: 'Ace' })).toBe('Ace')
    expect(safeBoardName('other.person@example.co.uk', 12345)).toBe('Player-A12B')
    expect(safeBoardName('Ace', 12345)).toBe('Ace')
    expect(looksLikeEmail('ace@home')).toBe(false)
  })

  it('alias matches the API formula (PublicNameTest)', () => {
    expect(publicAlias(0)).toBe('Player-0000')
    expect(publicAlias(1)).toBe('Player-9E37')
    expect(publicAlias(2)).toBe('Player-3C6E')
    expect(publicAlias(12345)).toBe('Player-A12B')
    expect(publicAlias(987654321)).toMatch(/^Player-[0-9A-F]{4}$/)
  })

  it('says a generated name keeps the email private', () => {
    expect(visibilityLine(true, 'Player-9E37')).toContain('generated so your email stays private')
    expect(visibilityLine(true, 'Ace')).not.toContain('generated')
  })

  it('the tab masks every board row name', () => {
    const tab = readFileSync(join(__dirname, 'TrainingLeaderboardsTab.vue'), 'utf8')
    expect(tab).not.toMatch(/\{\{ e\.name \}\}/)
  })
})
