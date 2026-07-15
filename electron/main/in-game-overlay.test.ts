import { describe, expect, it, vi } from 'vitest'

vi.mock('./app-notifications', () => ({ showAppNotification: vi.fn() }))

import { getSessionPollIntervalMs } from './in-game-overlay'

describe('session polling with overlay disabled', () => {
  it('keeps match-end detection active at a reduced cadence', () => {
    expect(getSessionPollIntervalMs(false)).toBe(2_000)
    expect(getSessionPollIntervalMs(true)).toBe(1_000)
  })
})
