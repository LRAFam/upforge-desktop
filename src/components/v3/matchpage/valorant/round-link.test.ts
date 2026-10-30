import { describe, expect, it } from 'vitest'
import { roundFromQuery, roundToQuery } from './round-link'

describe('round links', () => {
  it('maps the on-screen round number to the 0-based Riot round and back', () => {
    expect(roundFromQuery('1')).toBe(0)
    expect(roundFromQuery(['13'])).toBe(12)
    expect(roundToQuery(0)).toBe('1')
    expect(roundToQuery(12)).toBe('13')
  })
  it('rejects anything that is not a whole round number in range', () => {
    for (const bad of [undefined, null, '', '0', '-1', '1.5', 'abc', '999', '61', 3]) expect(roundFromQuery(bad)).toBeNull()
    expect(roundToQuery(-1)).toBeNull()
    expect(roundToQuery(1.5)).toBeNull()
  })
})
