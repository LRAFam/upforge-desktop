import { describe, expect, it } from 'vitest'
import {
  cs2MapNameFromGameType,
  pickValveMatchForSession,
  type ValveMatchSummary,
} from './cs2-valve-match'

function match(overrides: Partial<ValveMatchSummary>): ValveMatchSummary {
  return {
    matchId: '1',
    matchTimeSec: 1_700_000_000,
    mapName: 'de_dust2',
    demoUrl: 'http://replay1.valve.net/730/demo.dem.bz2',
    fileName: 'match730_test',
    ...overrides,
  }
}

describe('cs2MapNameFromGameType', () => {
  it('resolves de_dust2', () => {
    expect(cs2MapNameFromGameType(((1 << 1) << 8) | 8)).toBe('de_dust2')
  })

  it('resolves de_mirage in competitive mode', () => {
    expect(cs2MapNameFromGameType(((1 << 7) << 8) | 8)).toBe('de_mirage')
  })
})

describe('pickValveMatchForSession', () => {
  const sessionMs = 1_700_000_000_000

  it('prefers map match when gsi map is known', () => {
    const picked = pickValveMatchForSession(
      [
        match({ mapName: 'de_inferno', matchTimeSec: 1_700_000_100 }),
        match({ mapName: 'de_dust2', matchTimeSec: 1_700_000_050 }),
      ],
      sessionMs,
      'de_dust2',
    )
    expect(picked?.mapName).toBe('de_dust2')
  })

  it('falls back to closest match time', () => {
    const picked = pickValveMatchForSession(
      [
        match({ matchTimeSec: 1_699_999_000 }),
        match({ matchTimeSec: 1_700_000_010, mapName: 'de_nuke' }),
      ],
      sessionMs,
      null,
    )
    expect(picked?.mapName).toBe('de_nuke')
  })
})

describe('safe automatic demo selection', () => {
  const start = 1_700_000_000_000
  it('rejects stale matches instead of falling back to all history', () => {
    expect(pickValveMatchForSession([match({ matchTimeSec: start / 1000 - 86400 })], start, 'de_dust2')).toBeNull()
  })
  it('rejects a different map even when the timestamp matches', () => {
    expect(pickValveMatchForSession([match({ mapName: 'de_nuke' })], start, 'de_dust2')).toBeNull()
  })
  it('does not select the next game just because its map matches', () => {
    const correct = match({ matchId: 'correct' })
    expect(pickValveMatchForSession([match({ matchId: 'next', matchTimeSec: start / 1000 + 3600 }), correct], start, 'de_dust2')).toBe(correct)
  })
  it('leaves ambiguous matches for manual selection', () => {
    expect(pickValveMatchForSession([match({ matchId: 'one' }), match({ matchId: 'two', matchTimeSec: start / 1000 + 100 })], start, 'de_dust2')).toBeNull()
  })
  it('rejects invalid session times', () => {
    expect(pickValveMatchForSession([match({})], NaN, 'de_dust2')).toBeNull()
  })
})
