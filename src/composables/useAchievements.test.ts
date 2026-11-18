import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAchievements } from './useAchievements'

describe('Reaction King only counts a measured reaction', () => {
  beforeEach(() => {
    ;(globalThis as any).window = { api: { settings: { get: vi.fn(async () => ({})), save: vi.fn(async () => {}) } } }
  })

  it('a tracking run with 0 ms does not unlock reaction-200', async () => {
    const a = useAchievements()
    const got = await a.check({ lastRun: { scenario: 'strafe_track', avg_reaction_ms: 0, targets_hit: 0 } })
    expect(got).not.toContain('reaction-200')
  })

  it('a zero-hit run does not unlock reaction-200', async () => {
    const a = useAchievements()
    const got = await a.check({ lastRun: { scenario: 'gridshot', avg_reaction_ms: 0, targets_hit: 0 } })
    expect(got).not.toContain('reaction-200')
  })

  it('a measured time to hit under 200 ms does unlock it', async () => {
    const a = useAchievements()
    const got = await a.check({ lastRun: { scenario: 'gridshot', avg_reaction_ms: 185, targets_hit: 30 } })
    expect(got).toContain('reaction-200')
  })
})
