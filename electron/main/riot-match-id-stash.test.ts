import { describe, expect, it } from 'vitest'
import { stashMatchIdFields } from './riot-match-id-stash'

describe('stashMatchIdFields', () => {
  it('stores match id on timeline and current fields when both are empty', () => {
    expect(stashMatchIdFields('abc-123', { timelineMatchId: null, currentMatchId: null })).toEqual({
      timelineMatchId: 'abc-123',
      currentMatchId: 'abc-123',
      changed: true,
    })
  })

  it('does not overwrite an existing match id', () => {
    expect(stashMatchIdFields('new-id', {
      timelineMatchId: 'keep-me',
      currentMatchId: 'keep-me',
    })).toEqual({
      timelineMatchId: 'keep-me',
      currentMatchId: 'keep-me',
      changed: false,
    })
  })

  it('fills only the missing field', () => {
    expect(stashMatchIdFields('late-id', {
      timelineMatchId: 'already',
      currentMatchId: null,
    })).toEqual({
      timelineMatchId: 'already',
      currentMatchId: 'late-id',
      changed: true,
    })
  })
})
