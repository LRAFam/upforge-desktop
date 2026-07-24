import { describe, expect, it } from 'vitest'
import {
  decideMatchWaitAfterProcessMiss,
  formatMatchWaitCancelActivity,
  formatMatchWaitMilestone,
  interpretTasklistProcessStdout,
  MATCH_WAIT_PROCESS_MISS_HARD,
  MATCH_WAIT_PROCESS_MISS_SOFT,
  shouldAbortMatchWaitOnGameStopped,
  shouldCancelGenericProcessMiss,
  shouldSuppressFinalizeOnGameStopped,
  shouldLogUnknownProbe,
  shouldReauthAfterPresenceNulls,
} from './match-wait-guard'

describe('interpretTasklistProcessStdout', () => {
  it('detects running process from filtered tasklist row', () => {
    const stdout = '"VALORANT-Win64-Shipping.exe","1234","Console","1","1,000,000 K"\r\n'
    expect(interpretTasklistProcessStdout(stdout, 'VALORANT-Win64-Shipping.exe')).toBe('running')
  })

  it('treats empty / no-match tasklist as stopped', () => {
    expect(interpretTasklistProcessStdout('INFO: No tasks are running which match the specified criteria.\r\n', 'VALORANT-Win64-Shipping.exe')).toBe('stopped')
    expect(interpretTasklistProcessStdout('', 'VALORANT-Win64-Shipping.exe')).toBe('stopped')
  })
})

describe('decideMatchWaitAfterProcessMiss', () => {
  it('waits below soft threshold without consulting Riot outcome', () => {
    expect(
      decideMatchWaitAfterProcessMiss({
        consecutiveStopped: MATCH_WAIT_PROCESS_MISS_SOFT - 1,
        riotMatchActive: false,
      }),
    ).toEqual({ action: 'wait', resetStreak: false })
  })

  it('keeps waiting and resets streak when Riot still active', () => {
    expect(
      decideMatchWaitAfterProcessMiss({
        consecutiveStopped: MATCH_WAIT_PROCESS_MISS_SOFT,
        riotMatchActive: true,
      }),
    ).toMatchObject({ action: 'wait', resetStreak: true })
  })

  it('cancels when process gone and Riot confirms left', () => {
    expect(
      decideMatchWaitAfterProcessMiss({
        consecutiveStopped: MATCH_WAIT_PROCESS_MISS_SOFT,
        riotMatchActive: false,
      }),
    ).toMatchObject({ action: 'cancel' })
  })

  it('keeps waiting while Riot unknown until hard threshold', () => {
    expect(
      decideMatchWaitAfterProcessMiss({
        consecutiveStopped: MATCH_WAIT_PROCESS_MISS_HARD - 1,
        riotMatchActive: null,
      }),
    ).toEqual({ action: 'wait', resetStreak: false })

    expect(
      decideMatchWaitAfterProcessMiss({
        consecutiveStopped: MATCH_WAIT_PROCESS_MISS_HARD,
        riotMatchActive: null,
      }),
    ).toMatchObject({ action: 'cancel' })
  })
})

describe('shouldAbortMatchWaitOnGameStopped', () => {
  it('only aborts when Riot confirms out of match', () => {
    expect(shouldAbortMatchWaitOnGameStopped(false)).toBe(true)
    expect(shouldAbortMatchWaitOnGameStopped(true)).toBe(false)
    expect(shouldAbortMatchWaitOnGameStopped(null)).toBe(false)
  })
})

describe('shouldSuppressFinalizeOnGameStopped', () => {
  it('only suppresses while Riot still shows match flow', () => {
    expect(shouldSuppressFinalizeOnGameStopped(true)).toBe(true)
    expect(shouldSuppressFinalizeOnGameStopped(false)).toBe(false)
    expect(shouldSuppressFinalizeOnGameStopped(null)).toBe(false)
  })
})

describe('shouldCancelGenericProcessMiss', () => {
  it('cancels at threshold', () => {
    expect(shouldCancelGenericProcessMiss(4, 5)).toBe(false)
    expect(shouldCancelGenericProcessMiss(5, 5)).toBe(true)
  })
})

describe('format helpers', () => {
  it('formats cancel activity for the feed', () => {
    expect(formatMatchWaitCancelActivity('Shipping.exe gone and Riot confirmed left match'))
      .toBe('Match cancelled — Riot confirmed left match')
  })

  it('formats wait milestones', () => {
    expect(formatMatchWaitMilestone({
      sessionLoopState: 'PREGAME',
      processMissStreak: 2,
      waitedSec: 90,
    })).toBe('Still waiting for match (PREGAME, process misses=2, 90s)')
  })
})

describe('shouldLogUnknownProbe', () => {
  it('logs first event and respects interval', () => {
    expect(shouldLogUnknownProbe(null, 1000)).toBe(true)
    expect(shouldLogUnknownProbe(1000, 2000, 15_000)).toBe(false)
    expect(shouldLogUnknownProbe(1000, 16_000, 15_000)).toBe(true)
  })
})

describe('shouldReauthAfterPresenceNulls', () => {
  it('fires every N null polls', () => {
    expect(shouldReauthAfterPresenceNulls(0)).toBe(false)
    expect(shouldReauthAfterPresenceNulls(10)).toBe(true)
    expect(shouldReauthAfterPresenceNulls(11)).toBe(false)
    expect(shouldReauthAfterPresenceNulls(20)).toBe(true)
  })
})
