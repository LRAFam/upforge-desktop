/**
 * CS2/Deadlock re-watch loop (rearmGameDetection) — runs every 3 s for up to 15 min, including
 * through a whole skipped/unrecorded match. It used a filtered `tasklist /fi` per tick (20 process
 * spawns a minute on top of the detector's own list), which bypassed the card-169 snapshot reuse.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameDetector } from './game-detector'
import { REARM_PROCESS_MAX_AGE_MS } from './process-poll-plan'

vi.mock('./steam-gsi-server', () => ({
  isGsiMatchLive: vi.fn(() => true),
  isGsiReceiving: vi.fn(() => true),
}))

const CS2 = '"cs2.exe","3","Console","1","1 K"'

function rearmLoopSource(): string {
  const src = readFileSync(join(__dirname, 'index.ts'), 'utf8').replace(/\r\n/g, '\n') // Windows checkouts are CRLF
  const start = src.indexOf('async function rearmGameDetection(')
  const end = src.indexOf('\n  }\n', src.indexOf('const REWATCH_MS', start))
  expect(start).toBeGreaterThan(0)
  return src.slice(start, end)
}

describe('rearm re-watch loop process check', () => {
  it('reuses the detector snapshot instead of a filtered tasklist per 3 s tick', () => {
    const loop = rearmLoopSource()
    expect(loop).not.toMatch(/isGameProcessRunning\(game\)/)
    expect(loop).toMatch(/probeGameProcessRecent\(game, REARM_PROCESS_MAX_AGE_MS\)/)
  })
})

describe('GameDetector snapshot reuse for the re-watch loop', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('60 s of 3 s re-watch ticks adds no process spawns beyond the detector\'s own polls', async () => {
    const listProcesses = vi.fn(async () => CS2)
    const detector = new GameDetector({ listProcesses })
    detector.start()
    await vi.advanceTimersByTimeAsync(5_000) // idle poll sees cs2 → active (10 s) cadence
    listProcesses.mockClear()
    let probes = 0
    for (let t = 0; t < 60_000; t += 3_000) {
      await vi.advanceTimersByTimeAsync(3_000)
      expect(await detector.probeGameProcessRecent('cs2', REARM_PROCESS_MAX_AGE_MS)).toBe('running')
      probes++
    }
    expect(probes).toBe(20) // before: 20 filtered `tasklist /fi` spawns per minute
    expect(listProcesses.mock.calls.length).toBeLessThanOrEqual(6) // the detector's own 10 s list only
    detector.stop()
  })
})
