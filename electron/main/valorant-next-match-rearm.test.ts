import { describe, expect, it } from 'vitest'
import { decideValorantNextMatchRearm } from './valorant-next-match-rearm'

describe('decideValorantNextMatchRearm', () => {
  it('clears stale tracking when Shipping.exe is between match processes', () => {
    expect(decideValorantNextMatchRearm(false)).toBe('reset_and_wait_for_process')
  })

  it('checks Riot session state while Shipping.exe is still running', () => {
    expect(decideValorantNextMatchRearm(true)).toBe('inspect_riot_session')
  })
})
