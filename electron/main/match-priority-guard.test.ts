import { describe, expect, it } from 'vitest'
import { shouldDeferHeavyBackgroundWork } from './match-priority-guard'

describe('shouldDeferHeavyBackgroundWork', () => {
  it('does not defer when Valorant is open but OBS is not recording', () => {
    expect(shouldDeferHeavyBackgroundWork({ isRecording: () => false })).toBe(false)
  })

  it('defers while OBS is recording', () => {
    expect(shouldDeferHeavyBackgroundWork({ isRecording: () => true })).toBe(true)
  })
})
