import { describe, expect, it } from 'vitest'
import { squadActivityUrl } from './squad-ui'

describe('squadActivityUrl', () => {
  it('opens a shared analysis at the web /shared/<token> report page', () => {
    expect(squadActivityUrl({ id: 42, user_id: 7, game: 'valorant', share_token: 'tok-abc' }, 1))
      .toBe('https://upforge.gg/shared/tok-abc')
  })

  it('encodes the token', () => {
    expect(squadActivityUrl({ id: 42, user_id: 7, share_token: 'a/b c' }, 1))
      .toBe('https://upforge.gg/shared/a%2Fb%20c')
  })

  it('opens your own unshared analysis on its results page', () => {
    expect(squadActivityUrl({ id: 42, user_id: 7, game: 'cs2', share_token: null }, 7))
      .toBe('https://upforge.gg/cs2/results/42')
  })

  it("never builds a link from a teammate's private analysis id", () => {
    expect(squadActivityUrl({ id: 42, user_id: 7, game: 'valorant', share_token: null }, 1)).toBeNull()
    expect(squadActivityUrl({ id: 42, user_id: 7, game: 'valorant' }, null)).toBeNull()
  })
})
