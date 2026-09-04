import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackgroundWorkGate } from './background-work'
import { BackgroundMatchState } from './background-match-state'

afterEach(() => vi.useRealTimers())

describe('match background work', () => {
  it('interrupts active work and retries only after a match ends, repeatedly', async () => {
    vi.useFakeTimers()
    let playing = false
    const gate = new BackgroundWorkGate(() => playing, 10)
    let finish!: () => void
    const operation = vi.fn((signal: AbortSignal) => new Promise<void>((resolve, reject) => {
      finish = resolve
      signal.addEventListener('abort', () => reject(signal.reason))
    }))
    const pending = gate.run(operation)
    await vi.advanceTimersByTimeAsync(0)
    for (let match = 0; match < 3; match++) {
      playing = true
      gate.pause()
      await vi.advanceTimersByTimeAsync(1000)
      expect(operation).toHaveBeenCalledTimes(match + 1)
      playing = false
      await vi.advanceTimersByTimeAsync(10)
      expect(operation).toHaveBeenCalledTimes(match + 2)
    }
    finish()
    await pending
    expect(vi.getTimerCount()).toBe(0)
  })

  it('blocks jobs first requested during a match and detects matches without an explicit interrupt', async () => {
    vi.useFakeTimers()
    let playing = true
    const gate = new BackgroundWorkGate(() => playing, 10)
    const operation = vi.fn((signal: AbortSignal) => new Promise<void>((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason))
    }))
    const pending = gate.run(operation)
    const cancelled = expect(pending).rejects.toThrow('cancelled')
    await vi.advanceTimersByTimeAsync(100)
    expect(operation).not.toHaveBeenCalled()
    playing = false
    await vi.advanceTimersByTimeAsync(10)
    playing = true
    await vi.advanceTimersByTimeAsync(100)
    expect(operation).toHaveBeenCalledOnce()
    gate.cancel()
    await vi.advanceTimersByTimeAsync(10)
    await cancelled
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not retry ordinary failures', async () => {
    const gate = new BackgroundWorkGate()
    const operation = vi.fn(async () => { throw new Error('disk full') })
    await expect(gate.run(operation)).rejects.toThrow('disk full')
    expect(operation).toHaveBeenCalledOnce()
  })

  it('retains match protection through unknown signals and requires confirmed end samples', () => {
    const state = new BackgroundMatchState()
    expect(state.observe(true)).toBe(true)
    expect(state.observe(false)).toBe(true)
    expect(state.observe(null)).toBe(true)
    expect(state.observe(false)).toBe(true)
    expect(state.observe(false)).toBe(false)
    expect(state.observe(true)).toBe(true)
  })
})
