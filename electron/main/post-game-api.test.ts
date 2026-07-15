import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd() },
  shell: { openExternal: vi.fn() },
}))
import { getPregameBriefFallback } from './post-game-api'

describe('pregame brief fallback', () => {
  it('never opens a browser while the game is active', () => {
    expect(getPregameBriefFallback()).toBe('defer')
  })
})
