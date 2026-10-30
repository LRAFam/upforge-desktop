import { describe, expect, it } from 'vitest'
import { deepLinkRoute } from './deep-link-route'

describe('deepLinkRoute', () => {
  it('opens Coaches with the invite in the new design', () => {
    expect(deepLinkRoute({ kind: 'roster-join', coachId: 12 }, true))
      .toEqual({ type: 'route', location: { path: '/rosters', query: { join: '1', invite: '12' } } })
  })
  it('falls back to the web invite page in the old design', () => {
    expect(deepLinkRoute({ kind: 'roster-join', coachId: 12 }, false)).toEqual({ type: 'web', path: '/coaches/12#join-roster' })
  })
  it('ignores anything else', () => {
    for (const bad of [null, undefined, {}, { kind: 'other', coachId: 1 }, { kind: 'roster-join', coachId: '1' }, { kind: 'roster-join', coachId: 0 }, { kind: 'roster-join', coachId: 1.5 }]) {
      expect(deepLinkRoute(bad, true)).toBeNull()
    }
  })
})
