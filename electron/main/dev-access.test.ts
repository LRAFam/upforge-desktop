import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { DEV_ACCESS_DENIED, canUseDeveloperTools, devOnly } from './dev-access'

describe('canUseDeveloperTools (card 45)', () => {
  it('denies a packaged build for a normal signed-in user', () => {
    expect(canUseDeveloperTools({ isDev: false, devModeEnabled: false, isAdmin: false })).toBe(false)
    expect(canUseDeveloperTools({ isDev: false })).toBe(false)
  })

  it('allows dev builds, dev mode and admins', () => {
    expect(canUseDeveloperTools({ isDev: true })).toBe(true)
    expect(canUseDeveloperTools({ isDev: false, devModeEnabled: true })).toBe(true)
    expect(canUseDeveloperTools({ isDev: false, isAdmin: true })).toBe(true)
  })
})

describe('devOnly', () => {
  it('rejects without running the handler when access is denied', async () => {
    const handler = vi.fn(async (_e: unknown, _args: { matchId: string }) => 'ran')
    const guarded = devOnly(() => false, 'dev:valorant-replay:download', handler)
    await expect(guarded({}, { matchId: 'x' })).rejects.toThrow(DEV_ACCESS_DENIED)
    expect(handler).not.toHaveBeenCalled()
  })

  it('passes arguments through when access is allowed', async () => {
    const handler = vi.fn(async (_e: unknown, n: number) => n * 2)
    const guarded = devOnly(() => true, 'debug:poc-recent-matches', handler)
    await expect(guarded({}, 5)).resolves.toBe(10)
  })

  it('re-checks access on every call', async () => {
    let allowed = true
    const guarded = devOnly(() => allowed, 'dev:valorant-replay:sync', async () => 'ok')
    await expect(guarded()).resolves.toBe('ok')
    allowed = false
    await expect(guarded()).rejects.toThrow(DEV_ACCESS_DENIED)
  })
})

describe('index.ts registration', () => {
  const source = readFileSync(join(__dirname, 'index.ts'), 'utf8')
  const gated = [
    'dev:valorant-replay:download',
    'dev:valorant-replay:sync',
    'debug:poc-recent-matches',
    'debug:poc-open-folder',
    'debug:poc-latest-report',
    'debug:probe-lol-lcu',
  ]
  it.each(gated)('wraps %s in the developer guard', (channel) => {
    expect(source).toContain(`ipcMain.handle('${channel}', devOnly(canUseDevTools, '${channel}'`)
  })
})
