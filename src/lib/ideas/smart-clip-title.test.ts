import { describe, expect, it } from 'vitest'
import { smartClipTitle } from './smart-clip-title'

const base = { killCount: null, weapon: null, round: null, map: 'Ascent', game: 'valorant', clipEvents: null }

describe('smart clip titles', () => {
  it('titles multi-kills and aces from measured data', () => {
    expect(smartClipTitle({ ...base, trigger: 'multikill', killCount: 3, round: 13, clipEvents: [{ weapon: 'vandal' }, { weapon: 'vandal' }, { weapon: 'vandal' }] }))
      .toBe('3K with the Vandal · Round 14')
    expect(smartClipTitle({ ...base, trigger: 'ace', round: 6 })).toBe('Ace · Round 7')
  })
  it('names the victim only for a single kill', () => {
    expect(smartClipTitle({ ...base, trigger: 'kill', round: 2, clipEvents: [{ victim_agent: 'jett', weapon: 'sheriff' }] })).toBe('Kill on Jett with the Sheriff · Round 3')
  })
  it('falls back when there is nothing measured to add', () => {
    expect(smartClipTitle({ ...base, trigger: 'kill' })).toBeNull()
    expect(smartClipTitle({ ...base, trigger: 'death', round: 3 })).toBeNull()
    expect(smartClipTitle({ ...base, trigger: 'multikill', killCount: null })).toBeNull()
  })
  it('never shows rounds for games without rounds', () => {
    expect(smartClipTitle({ ...base, game: 'lol', trigger: 'multikill', killCount: 3, round: 4 })).toBe('3K')
  })
})
