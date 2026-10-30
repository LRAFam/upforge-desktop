import { describe, expect, it } from 'vitest'
import { pregameView } from './pregame-brief'

const ctx = { matchId: 'm1', agent: 'Jett', map: 'Ascent', mode: 'COMPETITIVE', allyAgents: [], enemyAgents: [] }

describe('pregameView (board 12)', () => {
  it('shows nothing outside agent select', () => {
    expect(pregameView(null, { focus_points: [{ text: 'x' }] })).toBeNull()
  })
  it('uses only what the brief contains, at most three lines', () => {
    const v = pregameView(ctx, {
      focus_points: [{ text: 'Get your entry traded before you swing.' }],
      comp_gaps: [{ side: 'ally', text: 'Your team has no Controller.' }],
      agent_context: { agent: 'Jett', games: 1, display: '6.8' },
      momentum: { direction: 'hot' },
    })!
    expect(v.title).toBe('Before this match · Jett on Ascent')
    expect(v.lines.map(l => l.label)).toEqual(['Your focus', 'This lobby', 'Jett'])
    expect(v.lines[2].text).toBe('1 analysed match on this agent · average 6.8.')
  })
  it('stays honest with an empty brief', () => {
    expect(pregameView(ctx, null)).toEqual({ title: 'Before this match · Jett on Ascent', lines: [] })
  })
})
