import { describe, expect, it } from 'vitest'
import { shouldDeferHeavyBackgroundWork } from './match-priority-guard'

describe('shouldDeferHeavyBackgroundWork', () => {
  it('does not defer when no game or recording is active', () => {
    expect(shouldDeferHeavyBackgroundWork({ isRecording: () => false })).toBe(false)
  })

  it('defers while OBS is recording', () => {
    expect(shouldDeferHeavyBackgroundWork({ isRecording: () => true })).toBe(true)
  })

  it('defers as soon as a supported game is active', () => {
    expect(shouldDeferHeavyBackgroundWork({
      isRecording: () => false,
      isGameActive: () => true,
    })).toBe(true)
  })
})

describe('waitUntilBackgroundWorkAllowed', () => {
  it('returns immediately when skipDefer is set', async () => {
    const { waitUntilBackgroundWorkAllowed } = await import('./match-priority-guard')
    const started = Date.now()
    await waitUntilBackgroundWorkAllowed(
      { isRecording: () => true },
      { skipDefer: true },
    )
    expect(Date.now() - started).toBeLessThan(50)
  })
})
