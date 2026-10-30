import { describe, expect, it } from 'vitest'
import { matchRowSummary, storageLine } from './match-row'

const a = { won: true, rounds_won: 13, rounds_lost: 10, kills: 29, deaths: 15, assists: 8 }

describe('matchRowSummary with the server analysis', () => {
  it('fills score, result and K/D/A when the timeline has none', () => {
    expect(matchRowSummary({ timeline: null } as never, a)).toEqual({ result: 'win', score: '13–10', kda: '29/15/8' })
  })
  it('keeps the timeline values when present', () => {
    const timeline = { finalScore: { allyScore: 9, enemyScore: 13 }, finalStats: { won: false, kills: 1, deaths: 2, assists: 3 } }
    expect(matchRowSummary({ timeline } as never, a)).toEqual({ result: 'loss', score: '9–13', kda: '1/2/3' })
  })
  it('stays empty without either source', () => {
    expect(matchRowSummary({ timeline: null } as never, null)).toEqual({ result: null, score: null, kda: null })
  })
})

describe('storageLine', () => {
  it('does not repeat the status', () => {
    expect(storageLine('Cloud', false, true)).toBe('')
    expect(storageLine('Analysed', true, true)).toBe('On this PC · Cloud')
    expect(storageLine('cloud', true, true)).toBe('On this PC')
  })
})
