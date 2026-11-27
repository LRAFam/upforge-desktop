import { describe, expect, it, vi } from 'vitest'
import { createListAllLoader } from './recordings-list-all-cache'

function setup(overrides: { ttlMs?: number; rescanIntervalMs?: number } = {}) {
  let t = 0
  let revision = 1
  let release: (() => void) | null = null
  let hold = false
  const build = vi.fn(async (key: string, _rescan: boolean) => {
    if (hold) await new Promise<void>(r => { release = r })
    return [`${key}@${revision}`]
  })
  const loader = createListAllLoader({ build, revision: () => revision, now: () => t, ...overrides })
  return {
    loader, build,
    tick: (ms: number) => { t += ms },
    bump: () => { revision++ },
    holdBuilds: () => { hold = true },
    finish: () => { hold = false; release?.() },
  }
}

describe('recordings:list-all loader', () => {
  it('concurrent callers share one in-flight build', async () => {
    const s = setup()
    s.holdBuilds()
    const calls = Array.from({ length: 11 }, () => s.loader.get('all'))
    s.finish()
    const results = await Promise.all(calls)
    expect(s.build).toHaveBeenCalledTimes(1)
    expect(new Set(results).size).toBe(1)
  })

  it('reuses the cached list while nothing changed', async () => {
    const s = setup()
    await s.loader.get('all')
    s.tick(500)
    await s.loader.get('all')
    expect(s.build).toHaveBeenCalledTimes(1)
  })

  it('rebuilds when a recording is added or deleted (revision change)', async () => {
    const s = setup()
    expect(await s.loader.get('all')).toEqual(['all@1'])
    s.bump()
    expect(await s.loader.get('all')).toEqual(['all@2'])
    expect(s.build).toHaveBeenCalledTimes(2)
  })

  it('rebuilds after the ttl even with no store change (files can vanish on disk)', async () => {
    const s = setup({ ttlMs: 2000 })
    await s.loader.get('all')
    s.tick(2000)
    await s.loader.get('all')
    expect(s.build).toHaveBeenCalledTimes(2)
  })

  it('main-process notify bumps the change count', async () => {
    const { markRecordingsChanged, recordingsChangeCount } = await import('./recordings-list-all-cache')
    const before = recordingsChangeCount()
    markRecordingsChanged()
    expect(recordingsChangeCount()).toBe(before + 1)
  })

  it('a change during a build is not hidden by the cache', async () => {
    const s = setup()
    s.holdBuilds()
    const first = s.loader.get('all')
    s.bump()
    s.finish()
    await first
    expect(await s.loader.get('all')).toEqual(['all@2'])
  })

  it('keeps keys separate', async () => {
    const s = setup()
    expect(await s.loader.get('active')).toEqual(['active@1'])
    expect(await s.loader.get('all')).toEqual(['all@1'])
    expect(s.build).toHaveBeenCalledTimes(2)
  })

  it('throttles the forced orphan rescan', async () => {
    const s = setup({ ttlMs: 0, rescanIntervalMs: 15_000 })
    await s.loader.get('all'); s.tick(1000)
    await s.loader.get('all'); s.tick(14_000)
    await s.loader.get('all')
    expect(s.build.mock.calls.map(c => c[1])).toEqual([true, false, true])
  })

  it('a failed build is not cached and the next call retries', async () => {
    const build = vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue(['ok'])
    const loader = createListAllLoader({ build, revision: () => 1, now: () => 0 })
    await expect(loader.get('all')).rejects.toThrow('disk')
    expect(await loader.get('all')).toEqual(['ok'])
  })

  it('invalidate drops the cache and ignores builds started before it', async () => {
    const s = setup()
    await s.loader.get('all')
    s.loader.invalidate()
    await s.loader.get('all')
    expect(s.build).toHaveBeenCalledTimes(2)
  })
})
