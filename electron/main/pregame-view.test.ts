import { describe, expect, it } from 'vitest'
import { pregameKey, pregameQuery, sanitizePregameContext } from './pregame-view'

describe('pregame view (board 12)', () => {
  it('accepts a real lobby context and builds a read-only query', () => {
    const ctx = sanitizePregameContext({ matchId: 'abc-123', agent: 'Jett', map: 'Ascent', mode: 'COMPETITIVE', allyAgents: ['Jett', 'Omen', 'Sova', 'KAY/O', 'Killjoy'], enemyAgents: [] })
    expect(ctx).not.toBeNull()
    expect(pregameQuery(ctx!)).toEqual({ match_id: 'abc-123', agent: 'Jett', map: 'Ascent', mode: 'COMPETITIVE', ally_agents: 'Jett,Omen,Sova,KAY/O,Killjoy' })
  })
  it('rejects junk and injection attempts from the renderer', () => {
    expect(sanitizePregameContext(null)).toBeNull()
    expect(sanitizePregameContext({ matchId: '../../x' })).toBeNull()
    const ctx = sanitizePregameContext({ matchId: 'm1', agent: '<script>', map: 'A'.repeat(80), mode: 'comp; drop', allyAgents: ['Jett', 42, '&x=1'] })
    expect(ctx).toEqual({ matchId: 'm1', agent: null, map: null, mode: null, allyAgents: ['Jett'], enemyAgents: [] })
  })
  it('only changes key when the lobby changes', () => {
    const a = sanitizePregameContext({ matchId: 'm1', agent: null, allyAgents: [] })
    const b = sanitizePregameContext({ matchId: 'm1', agent: 'Sova', allyAgents: ['Sova'] })
    expect(pregameKey(a)).not.toBe(pregameKey(b))
    expect(pregameKey(b)).toBe(pregameKey(sanitizePregameContext({ matchId: 'm1', agent: 'Sova', allyAgents: ['Sova'] })))
    expect(pregameKey(null)).toBe('')
  })
})
