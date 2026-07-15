import { describe, expect, it, vi } from 'vitest'
import { usesNotificationFeedback, usesOverlayFeedback } from './in-game-feedback'

describe('in-game-feedback overlay gate', () => {
  it('disables overlay feedback when overlay feature flag is off', async () => {
    vi.resetModules()
    vi.doMock('./in-game-overlay', () => ({
      isInGameOverlayEnabled: () => false,
    }))
    const mod = await import('./in-game-feedback')
    expect(mod.usesOverlayFeedback('overlay')).toBe(false)
    expect(mod.usesOverlayFeedback('all')).toBe(false)
    expect(mod.usesOverlayFeedback('notifications')).toBe(false)
  })

  it('falls back to notifications for users with a saved overlay-only mode', () => {
    expect(usesNotificationFeedback('overlay')).toBe(true)
  })
})
