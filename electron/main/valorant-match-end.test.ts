import { describe, expect, it, vi } from 'vitest'
import { hasValorantReturnedToMenus, isValorantStillInLiveMatch } from './valorant-match-end'

function probe(loop: string | null, core: boolean | null, pregame: boolean | null, observed = false) {
  return {
    isMatchProcessRunning: vi.fn(async () => true),
    getSessionState: vi.fn(async () => loop ? { sessionLoopState: loop } : null),
    isCoreGameSessionActive: vi.fn(async () => core),
    isPregameSessionActive: vi.fn(async () => pregame),
    hasMatchEndSessionEvidence: vi.fn(() => observed),
  }
}

describe('Valorant match-end confirmation', () => {
  it('allows a confirmed match-end despite stale INGAME presence and an open game process', async () => {
    const checks = probe('INGAME', false, false, true)
    // These are the same ended sessions that trigger RiotLocalApi.onMatchEnded.
    expect(await isValorantStillInLiveMatch(checks)).toBe(false)
    expect(await isValorantStillInLiveMatch(checks)).toBe(false)
  })

  it('protects Range gameplay when session routes have never exposed an active match', async () => {
    expect(await isValorantStillInLiveMatch(probe('INGAME', false, false))).toBe(true)
  })

  it.each([[true, null], [false, true], [null, null], [false, null]] as const)(
    'protects active or unconfirmed gameplay (core=%s, pregame=%s)', async (core, pregame) => {
      expect(await isValorantStillInLiveMatch(probe('INGAME', core, pregame))).toBe(true)
    },
  )

  it('allows finalization when the game process has exited', async () => {
    const checks = probe('INGAME', true, true)
    checks.isMatchProcessRunning.mockResolvedValue(false)
    expect(await isValorantStillInLiveMatch(checks)).toBe(false)
    expect(checks.getSessionState).not.toHaveBeenCalled()
  })

  it('preserves the existing menu, pregame and missing-presence behavior', async () => {
    expect(await isValorantStillInLiveMatch(probe('MENUS', false, false))).toBe(false)
    expect(await isValorantStillInLiveMatch(probe('PREGAME', false, true))).toBe(true)
    expect(await isValorantStillInLiveMatch(probe(null, null, null))).toBe(true)
  })
})


describe('hasValorantReturnedToMenus', () => {
  it.each([
    ['MENUS', false, false, true],
    ['MENUS', true, false, false],
    ['MENUS', false, true, false],
    ['MENUS', null, false, false],
    ['MENUS', false, null, false],
    ['INGAME', false, false, false],
    [null, false, false, false],
  ] as const)('checks confirmed lobby state after recorder setup (%s, core=%s, pregame=%s)', async (loop, core, pregame, ended) => {
    expect(await hasValorantReturnedToMenus({
      getSessionState: async () => loop ? { sessionLoopState: loop } : null,
      isCoreGameSessionActive: async () => core,
      isPregameSessionActive: async () => pregame,
    })).toBe(ended)
  })
})
