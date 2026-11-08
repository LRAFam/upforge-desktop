import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameDetector } from './game-detector'
import { POLL_ACTIVE_MS, POLL_CONFIRMED_MS, nextProcessPollDelayMs, probeFromSnapshot } from './process-poll-plan'

vi.mock('./steam-gsi-server', () => ({
  isGsiMatchLive: vi.fn(() => true),
  isGsiReceiving: vi.fn(() => true),
}))

const VAL = '"VALORANT.exe","1","Console","1","1 K"\n"VALORANT-Win64-Shipping.exe","2","Console","1","1 K"'
const VAL_MENU = '"VALORANT.exe","1","Console","1","1 K"'
const CS2 = '"cs2.exe","3","Console","1","1 K"'

function makeDetector(initial: string) {
  let stdout = initial
  const listProcesses = vi.fn(async () => stdout)
  const detector = new GameDetector({ listProcesses })
  const started = vi.fn()
  const stopped = vi.fn()
  detector.on('game-started', started)
  detector.on('game-stopped', stopped)
  return { detector, listProcesses, started, stopped, set: (next: string) => { stdout = next } }
}

describe('process poll plan', () => {
  it('slows only a confirmed match with no pending miss', () => {
    expect(nextProcessPollDelayMs({ activeGame: null, matchConfirmed: true, missedPollStreak: 0 })).toBe(5_000)
    expect(nextProcessPollDelayMs({ activeGame: 'cs2', matchConfirmed: false, missedPollStreak: 0 })).toBe(POLL_ACTIVE_MS)
    expect(nextProcessPollDelayMs({ activeGame: 'cs2', matchConfirmed: true, missedPollStreak: 0 })).toBe(POLL_CONFIRMED_MS)
    expect(nextProcessPollDelayMs({ activeGame: 'cs2', matchConfirmed: true, missedPollStreak: 1 })).toBe(POLL_ACTIVE_MS)
  })

  it('answers from a fresh snapshot and refuses a stale one', () => {
    const snap = { stdout: VAL, at: 0 }
    expect(probeFromSnapshot(snap, ['VALORANT-Win64-Shipping.exe'], 10_000, 10_000)).toBe('running')
    expect(probeFromSnapshot({ stdout: VAL_MENU, at: 0 }, ['VALORANT-Win64-Shipping.exe'], 10_000, 5_000)).toBe('stopped')
    expect(probeFromSnapshot(snap, ['VALORANT-Win64-Shipping.exe'], 10_000, 10_001)).toBeNull()
  })
})

describe('GameDetector tasklist reuse', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('a confirmed 60 s CS2 match spawns 2 tasklists (was 6)', async () => {
    const { detector, listProcesses, started } = makeDetector(CS2)
    detector.start()
    await vi.advanceTimersByTimeAsync(5_000) // idle poll sees cs2
    expect(started).toHaveBeenCalledWith('cs2')
    detector.setMatchConfirmed(true) // GSI live
    listProcesses.mockClear()
    for (let t = 0; t < 60_000; t += 2_000) {
      detector.setMatchConfirmed(true) // background probe every 2 s
      await vi.advanceTimersByTimeAsync(2_000)
    }
    expect(listProcesses.mock.calls.length).toBeLessThanOrEqual(3)
    detector.stop()
  })

  it('Valorant recording: Shipping check + probe reuse the full list (5 vs ~12 spawns per 60 s)', async () => {
    const { detector, listProcesses, started } = makeDetector(VAL)
    detector.start()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(started).toHaveBeenCalledWith('valorant')
    detector.setMatchConfirmed(true)
    listProcesses.mockClear()
    let lastShipping = -Infinity
    for (let t = 0; t < 60_000; t += 1_000) {
      // Overlay loop (1 s) runs the Shipping check every 10 s.
      if (t - lastShipping >= 10_000) {
        lastShipping = t
        expect(await detector.isMatchProcessRunningRecent()).toBe(true)
      }
      if (t % 2_000 === 0) {
        detector.setMatchConfirmed(true)
        await detector.probeGameProcessRecent('valorant')
      }
      await vi.advanceTimersByTimeAsync(1_000)
    }
    // Shipping freshness stays ≤10 s, but never a second (filtered) tasklist per check.
    expect(listProcesses.mock.calls.length).toBeLessThanOrEqual(6)
    detector.stop()
  })

  it('detects process exit at the first confirmed poll, then stops one active poll later', async () => {
    const { detector, set, stopped } = makeDetector(CS2)
    detector.start()
    await vi.advanceTimersByTimeAsync(5_000)
    detector.setMatchConfirmed(true)
    await vi.advanceTimersByTimeAsync(1) // reschedule happens on the next poll
    await vi.advanceTimersByTimeAsync(POLL_ACTIVE_MS) // first poll was on the 10 s timer
    set('')
    // Next confirmed poll (≤30 s) records the miss; confirmation poll follows at the active cadence.
    await vi.advanceTimersByTimeAsync(POLL_CONFIRMED_MS)
    expect(stopped).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(POLL_ACTIVE_MS)
    expect(stopped).toHaveBeenCalledWith('cs2')
    detector.stop()
  })

  it('unconfirmed matches keep the 10 s active poll and two-miss stop', async () => {
    const { detector, set, stopped, listProcesses } = makeDetector(CS2)
    detector.start()
    await vi.advanceTimersByTimeAsync(5_000)
    listProcesses.mockClear()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(listProcesses).toHaveBeenCalledTimes(3)
    set('')
    await vi.advanceTimersByTimeAsync(POLL_ACTIVE_MS)
    expect(stopped).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(POLL_ACTIVE_MS)
    expect(stopped).toHaveBeenCalledWith('cs2')
    detector.stop()
  })

  it('a stale snapshot refreshes via one shared full poll; poll failure is unknown', async () => {
    const { detector, listProcesses, set } = makeDetector(VAL)
    await detector.pollOnce()
    listProcesses.mockClear()
    await vi.advanceTimersByTimeAsync(10_001)
    set(VAL_MENU)
    const [a, b] = await Promise.all([
      detector.probeGameProcessRecent('valorant'),
      detector.probeGameProcessRecent('valorant'),
    ])
    expect([a, b]).toEqual(['stopped', 'stopped'])
    expect(listProcesses).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_001)
    listProcesses.mockRejectedValueOnce(new Error('timeout'))
    expect(await detector.probeGameProcessRecent('valorant')).toBe('unknown')
  })
})
