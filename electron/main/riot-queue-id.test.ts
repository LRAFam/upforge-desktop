import { describe, expect, it } from 'vitest'
import { normalizeQueueId, resolveValorantGameMode } from './riot-queue-id'
import { isValorantModeFilteredOut } from './recorded-modes-filter'

describe('normalizeQueueId', () => {
  it('maps The Range queue id to SHOOTING_RANGE', () => {
    expect(normalizeQueueId('rangev2')).toBe('SHOOTING_RANGE')
    expect(normalizeQueueId('RANGEV2')).toBe('SHOOTING_RANGE')
  })

  it('still maps competitive and hurm', () => {
    expect(normalizeQueueId('competitive')).toBe('COMPETITIVE')
    expect(normalizeQueueId('hurm')).toBe('TEAMDEATHMATCH')
  })
})

describe('resolveValorantGameMode', () => {
  it.each(['The Range', 'Range', '/Game/Maps/Range/Range', '/Game/Maps/RangeV2/RangeV2'])('uses the Range map over a stale queue (%s)', map => {
    expect(resolveValorantGameMode('skirmish2v2', map)).toBe('SHOOTING_RANGE')
    expect(resolveValorantGameMode('competitive', map)).toBe('SHOOTING_RANGE')
    expect(resolveValorantGameMode(null, map)).toBe('SHOOTING_RANGE')
  })

  it('preserves genuine Skirmish and regular queues on other maps', () => {
    expect(resolveValorantGameMode('skirmish2v2', 'Ascent')).toBe('SKIRMISH2V2')
    expect(resolveValorantGameMode('competitive', 'Breeze')).toBe('COMPETITIVE')
    expect(resolveValorantGameMode('hurm', 'District')).toBe('TEAMDEATHMATCH')
    expect(resolveValorantGameMode(null, 'Ascent')).toBeNull()
    expect(resolveValorantGameMode(null, null)).toBeNull()
    expect(resolveValorantGameMode('competitive', 'Strange')).toBe('COMPETITIVE')
  })

  it('applies the Range recording preference when Riot reports a stale queue', () => {
    const mode = resolveValorantGameMode('skirmish2v2', 'The Range')!
    expect(isValorantModeFilteredOut(['COMPETITIVE', 'PREMIER'], mode)).toBe(true)
    expect(isValorantModeFilteredOut(['SHOOTING_RANGE'], mode)).toBe(false)
  })
})
