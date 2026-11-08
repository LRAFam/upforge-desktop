import { describe, expect, it, vi } from 'vitest'
import {
  MAX_RECORDING_DURATION_MS,
  checkRecordingMaxDuration,
  createSerialRunner,
  decideGameStartedWhileRecording,
  decideMaxDurationAction,
  isSupersededGameStop,
  resolveGameStartOwnership,
  type GameStartOwnershipDeps,
} from './recording-ownership'

function ownership(overrides: Partial<GameStartOwnershipDeps> & { recording?: { value: boolean } } = {}) {
  const recording = overrides.recording ?? { value: true }
  const deps: GameStartOwnershipDeps = {
    game: 'valorant',
    finalizeInFlight: () => null,
    releaseStale: vi.fn(async () => false),
    isRecording: () => recording.value,
    recordingGame: () => 'lol',
    matchHandled: () => false,
    finalize: vi.fn(async () => { recording.value = false; return true }),
    retryStop: vi.fn(async () => { recording.value = false }),
    log: { info: vi.fn(), warn: vi.fn() },
    ...overrides,
  }
  return { deps, recording }
}

describe('decideGameStartedWhileRecording', () => {
  it('finalises a different game that still owns the recording', () => {
    expect(decideGameStartedWhileRecording({ startedGame: 'valorant', recordingGame: 'lol', matchHandled: false })).toBe('finalize-previous')
  })
  it('keeps the same game recording (re-arm / process blip)', () => {
    expect(decideGameStartedWhileRecording({ startedGame: 'lol', recordingGame: 'lol', matchHandled: false })).toBe('ignore-same-game')
  })
  it('retries a stranded stop once the match was already finalised', () => {
    expect(decideGameStartedWhileRecording({ startedGame: 'valorant', recordingGame: 'lol', matchHandled: true })).toBe('retry-stop')
    expect(decideGameStartedWhileRecording({ startedGame: 'lol', recordingGame: 'lol', matchHandled: true })).toBe('retry-stop')
  })
})

describe('resolveGameStartOwnership', () => {
  it('League owned + Valorant game-started → League finalised as game-switch, Valorant start proceeds', async () => {
    const { deps } = ownership()
    const result = await resolveGameStartOwnership(deps)
    expect(deps.finalize).toHaveBeenCalledWith('lol', 'game-switch')
    expect(result).toEqual({ action: 'proceed', finalizedPrevious: true })
  })

  it('same-poll stop:lol/start:valorant race — waits for the in-flight finalise instead of dropping the start', async () => {
    const recording = { value: true }
    let resolveFinalize!: () => void
    const inFlight = new Promise<void>((resolve) => { resolveFinalize = () => { recording.value = false; resolve() } })
    let pending: Promise<void> | null = inFlight
    void inFlight.then(() => { pending = null })
    const { deps } = ownership({ recording, finalizeInFlight: () => pending })
    const resultPromise = resolveGameStartOwnership(deps)
    await Promise.resolve()
    resolveFinalize()
    const result = await resultPromise
    expect(result.action).toBe('proceed')
    expect(deps.finalize).not.toHaveBeenCalled()
  })

  it('keeps ignoring a same-game re-start while recording', async () => {
    const { deps } = ownership({ game: 'lol' })
    expect(await resolveGameStartOwnership(deps)).toEqual({ action: 'ignore', finalizedPrevious: false })
    expect(deps.finalize).not.toHaveBeenCalled()
  })

  it('retries a stranded stop on the next game-started and proceeds when OBS goes idle', async () => {
    const { deps } = ownership({ matchHandled: () => true })
    expect((await resolveGameStartOwnership(deps)).action).toBe('proceed')
    expect(deps.retryStop).toHaveBeenCalledOnce()
  })

  it('ignores the start (with a warning) when the old recording still cannot stop', async () => {
    const { deps } = ownership({ matchHandled: () => true, retryStop: vi.fn(async () => {}) })
    expect((await resolveGameStartOwnership(deps)).action).toBe('ignore')
    expect(deps.log.warn).toHaveBeenCalledWith(expect.stringContaining('could not stop'))
  })

  it('proceeds without touching anything when nothing is recording', async () => {
    const { deps } = ownership({ recording: { value: false } })
    expect(await resolveGameStartOwnership(deps)).toEqual({ action: 'proceed', finalizedPrevious: false })
    expect(deps.finalize).not.toHaveBeenCalled()
  })
})

describe('isSupersededGameStop', () => {
  it('ignores a late game-stopped for a game that no longer owns the flow or the recording', () => {
    expect(isSupersededGameStop({ stoppedGame: 'lol', flowGame: 'valorant', recordingGame: null })).toBe(true)
  })
  it('handles a stop for the game that owns the recording or the flow', () => {
    expect(isSupersededGameStop({ stoppedGame: 'lol', flowGame: 'valorant', recordingGame: 'lol' })).toBe(false)
    expect(isSupersededGameStop({ stoppedGame: 'lol', flowGame: 'lol', recordingGame: null })).toBe(false)
    expect(isSupersededGameStop({ stoppedGame: 'lol', flowGame: null, recordingGame: null })).toBe(false)
  })
})

describe('createSerialRunner (re-entrant handleMatchEnd)', () => {
  it('queues a second finalise instead of dropping it, so its stop still runs', async () => {
    const run = createSerialRunner()
    const order: string[] = []
    let releaseFirst!: () => void
    const first = run(async () => {
      order.push('first:start')
      await new Promise<void>((resolve) => { releaseFirst = resolve })
      order.push('first:end')
    })
    const stop = vi.fn()
    const second = run(async () => { order.push('second'); stop() })
    await Promise.resolve()
    expect(stop).not.toHaveBeenCalled()
    releaseFirst()
    await Promise.all([first, second])
    expect(order).toEqual(['first:start', 'first:end', 'second'])
    expect(stop).toHaveBeenCalledOnce()
  })

  it('keeps running later calls after an earlier one throws', async () => {
    const run = createSerialRunner()
    const failed = run(async () => { throw new Error('boom') })
    const next = run(async () => 'ok')
    await expect(failed).rejects.toThrow('boom')
    await expect(next).resolves.toBe('ok')
  })
})

describe('max-duration safety stop', () => {
  it('uses per-game caps', () => {
    expect(MAX_RECORDING_DURATION_MS).toEqual({ lol: 90 * 60_000, valorant: 90 * 60_000, deadlock: 90 * 60_000, cs2: 120 * 60_000 })
  })

  it('decides from duration, process and live match', () => {
    const over = 91 * 60_000
    expect(decideMaxDurationAction({ game: 'lol', elapsedMs: 30 * 60_000, processRunning: false, liveMatch: false })).toBe('ok')
    expect(decideMaxDurationAction({ game: 'lol', elapsedMs: over, processRunning: false, liveMatch: null })).toBe('finalize')
    expect(decideMaxDurationAction({ game: 'valorant', elapsedMs: over, processRunning: true, liveMatch: false })).toBe('finalize')
    expect(decideMaxDurationAction({ game: 'valorant', elapsedMs: over, processRunning: true, liveMatch: true })).toBe('keep-live')
    expect(decideMaxDurationAction({ game: 'valorant', elapsedMs: over, processRunning: true, liveMatch: null })).toBe('keep-live')
    expect(decideMaxDurationAction({ game: 'cs2', elapsedMs: over, processRunning: false, liveMatch: null })).toBe('ok')
  })

  it('finalises with source max-duration when the game process is gone', async () => {
    const finalize = vi.fn(async () => {})
    const log = { info: vi.fn(), warn: vi.fn() }
    const result = await checkRecordingMaxDuration({
      game: 'lol', now: 4 * 3_600_000, recordingStartedAt: 0,
      probeProcess: async () => false, probeLiveMatch: async () => null, finalize, log,
    })
    expect(result).toBe('finalize')
    expect(finalize).toHaveBeenCalledWith('lol', 'max-duration')
  })

  it('does not cut a match that is still genuinely live', async () => {
    const finalize = vi.fn(async () => {})
    const log = { info: vi.fn(), warn: vi.fn() }
    const result = await checkRecordingMaxDuration({
      game: 'valorant', now: 2 * 3_600_000, recordingStartedAt: 0,
      probeProcess: async () => true, probeLiveMatch: async () => true, finalize, log,
    })
    expect(result).toBe('keep-live')
    expect(finalize).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalled()
  })

  it('does not probe anything under the cap', async () => {
    const probeProcess = vi.fn(async () => false)
    const finalize = vi.fn(async () => {})
    const result = await checkRecordingMaxDuration({
      game: 'lol', now: 10 * 60_000, recordingStartedAt: 0,
      probeProcess, probeLiveMatch: async () => null, finalize, log: { info: vi.fn(), warn: vi.fn() },
    })
    expect(result).toBe('ok')
    expect(probeProcess).not.toHaveBeenCalled()
  })
})
