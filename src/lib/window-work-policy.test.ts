import { describe, expect, it } from 'vitest'
import { isPostGameWindowRoute, shouldInitializeFullAppShell } from './window-work-policy'

describe('window work ownership', () => {
  it('keeps the normal app and onboarding on the full shell', () => {
    expect(shouldInitializeFullAppShell('/dashboard')).toBe(true)
    expect(shouldInitializeFullAppShell('/onboarding')).toBe(true)
  })

  it('uses a lightweight shell for post-game windows', () => {
    expect(isPostGameWindowRoute('/post-game')).toBe(true)
    expect(isPostGameWindowRoute('/post-game-preview')).toBe(true)
    expect(shouldInitializeFullAppShell('/post-game')).toBe(false)
    expect(shouldInitializeFullAppShell('/post-game-preview')).toBe(false)
  })
})
