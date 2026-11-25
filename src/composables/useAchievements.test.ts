import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setAchievementsAccount, useAchievements } from './useAchievements'

describe('Reaction King only counts a measured reaction', () => {
  beforeEach(() => {
    setAchievementsAccount(null)
    setAchievementsAccount(1)
    ;(globalThis as any).window = {
      api: {
        achievements: { sync: vi.fn(async () => null) },
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
        achievements: { sync: vi.fn(async () => null) },
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

describe('account cloud sync and offline recovery', () => {
  const early = '2026-11-01T00:00:00.000Z'
  let file: Record<string, any>
  let cloud: ReturnType<typeof vi.fn>
  beforeEach(() => {
    setAchievementsAccount(null)
    file = {}
    cloud = vi.fn(async () => null)
    ;(globalThis as any).window = { api: {
      achievements: { sync: cloud }, app: { getStatus: async () => ({ user: { id: 7 } }) },
      settings: { get: vi.fn(async () => structuredClone(file)), save: vi.fn(async (patch) => { file = { ...file, ...patch } }) },
    } }
    setAchievementsAccount(7)
  })
  it('loads another device’s unlocks, caches them locally and does not toast them again', async () => {
    cloud.mockResolvedValue({ 'score-90': early })
    const a = useAchievements()
    expect(await a.check({ lastScore: 95 })).toEqual([])
    expect(a.unlocked.value).toEqual({ 'score-90': early })
    expect(file.achievementsByUser['7']).toEqual({ 'score-90': early })
  })
  it('keeps offline unlocks and retries them on a later run without earning them twice', async () => {
    const a = useAchievements()
    expect(await a.check({ lastScore: 95 })).toEqual(['score-90'])
    const earned = file.achievementsByUser['7']['score-90']
    cloud.mockImplementation(async (_owner, list) => list)
    expect(await a.check({ lastScore: 95 })).toEqual([])
    expect(cloud).toHaveBeenLastCalledWith(7, { 'score-90': earned })
    expect(a.unlocked.value['score-90']).toBe(earned)
  })
  it('does not merge a delayed old-account reply or award its in-flight run to a new account', async () => {
    let finish!: (list: Record<string, string>) => void
    cloud.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const a = useAchievements()
    const pending = a.check({ lastScore: 95 })
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    setAchievementsAccount(8)
    finish({ 'score-90': early })
    expect(await pending).toEqual([])
    await a.load()
    expect(a.unlocked.value).toEqual({})
    expect(file.achievementsByUser?.['8']?.['score-90']).toBeUndefined()
  })
  it('rejects stale replies even if the same account signs out and back in', async () => {
    let finish!: (list: Record<string, string>) => void
    cloud.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const a = useAchievements()
    const pending = a.load()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    setAchievementsAccount(null)
    setAchievementsAccount(7)
    finish({ 'score-90': early })
    await pending
    expect(a.unlocked.value).toEqual({})
  })
  it('serializes local writes so simultaneous unlocks survive reload', async () => {
    const a = useAchievements()
    await Promise.all([a.unlock('first-drill'), a.unlock('score-90')])
    expect(Object.keys(file.achievementsByUser['7']).sort()).toEqual(['first-drill', 'score-90'])
    setAchievementsAccount(null); setAchievementsAccount(7)
    await a.load()
    expect(Object.keys(a.unlocked.value).sort()).toEqual(['first-drill', 'score-90'])
  })
  it('preserves an unlock earned while an older cloud snapshot is in flight', async () => {
    const a = useAchievements()
    await a.check({})
    let finish!: (list: Record<string, string>) => void
    cloud.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const loading = a.load()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    const unlocking = a.unlock('score-90')
    await vi.waitFor(() => expect(file.achievementsByUser?.['7']?.['score-90']).toBeTruthy())
    finish({ 'first-drill': early })
    await Promise.all([loading, unlocking])
    expect(Object.keys(a.unlocked.value).sort()).toEqual(['first-drill', 'score-90'])
    expect(Object.keys(file.achievementsByUser['7']).sort()).toEqual(['first-drill', 'score-90'])
    expect(cloud).toHaveBeenLastCalledWith(7, expect.objectContaining({ 'first-drill': early, 'score-90': expect.any(String) }))
  })
})
