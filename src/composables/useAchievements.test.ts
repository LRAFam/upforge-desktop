import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setAchievementsAccount, useAchievements } from './useAchievements'

describe('Reaction King only counts a measured reaction', () => {
  beforeEach(() => {
    setAchievementsAccount(null)
    setAchievementsAccount(1)
    ;(globalThis as any).window = {
      api: {
        app: { getStatus: vi.fn(async () => ({ user: { id: 1 } })) },
        settings: { get: vi.fn(async () => ({})), save: vi.fn(async () => {}) },
      },
    }
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

describe('achievements belong to the signed-in account', () => {
  let file: Record<string, unknown>

  beforeEach(() => {
    file = {}
    ;(globalThis as any).window = {
      api: {
        app: { getStatus: vi.fn(async () => ({ user: { id: 7 } })) },
        settings: {
          get: vi.fn(async () => JSON.parse(JSON.stringify(file))),
          save: vi.fn(async (partial: Record<string, unknown>) => { file = { ...file, ...partial } }),
        },
      },
    }
    setAchievementsAccount(null)
  })

  it('a second account on the same PC starts with its own empty list', async () => {
    setAchievementsAccount(7)
    const a = useAchievements()
    expect(await a.check({ lastScore: 95 })).toContain('score-90')
    expect(a.unlocked.value['score-90']).toBeTruthy()

    setAchievementsAccount(8)
    await a.load()
    expect(a.unlocked.value).toEqual({})
    // The second account earns Elite Aim for itself, with its own toast.
    expect(await a.check({ lastScore: 92 })).toContain('score-90')

    const byUser = file.achievementsByUser as Record<string, Record<string, string>>
    expect(Object.keys(byUser).sort()).toEqual(['7', '8'])
  })

  it('switching back shows the first account its unlocks again', async () => {
    setAchievementsAccount(7)
    const a = useAchievements()
    await a.check({ lastAccuracy: 95 })
    setAchievementsAccount(8)
    await a.load()
    expect(a.unlocked.value['accuracy-90']).toBeUndefined()
    setAchievementsAccount(7)
    await a.load()
    expect(a.unlocked.value['accuracy-90']).toBeTruthy()
    expect(await a.check({ lastAccuracy: 99 })).not.toContain('accuracy-90')
  })

  it('the PC-wide list from an older build goes to the first account only', async () => {
    file = { achievements: { 'first-drill': '2026-10-01T10:00:00.000Z' } }
    setAchievementsAccount(7)
    const a = useAchievements()
    await a.load()
    expect(a.unlocked.value['first-drill']).toBe('2026-10-01T10:00:00.000Z')
    expect(file.achievements).toEqual({})

    setAchievementsAccount(8)
    await a.load()
    expect(a.unlocked.value['first-drill']).toBeUndefined()
  })

  it('signed out: nothing unlocks and nothing is saved', async () => {
    const a = useAchievements()
    expect(await a.check({ lastScore: 100, totalDrills: 5 })).toEqual([])
    expect((window as any).api.settings.save).not.toHaveBeenCalled()
  })

  it('before the shell says who is signed in, the account comes from app status', async () => {
    setAchievementsAccount(undefined)
    const a = useAchievements()
    expect(await a.check({ totalDrills: 1 })).toContain('first-drill')
    expect(Object.keys(file.achievementsByUser as object)).toEqual(['7'])
  })
})
