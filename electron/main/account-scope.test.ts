import { describe, expect, it, vi } from 'vitest'
import { bumpAccountScope, snapshotAccountOwner } from './account-scope'

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))
import { waitUntilBackgroundWorkAllowed } from './match-priority-guard'

describe('account-owned background work', () => {
  it('is owned until sign-out bumps the scope, even if the same user signs back in', () => {
    let user: number | null = 101
    const owner = snapshotAccountOwner(() => user)
    expect(owner.stillOwned()).toBe(true)
    bumpAccountScope()
    expect(owner.stillOwned()).toBe(false)
    user = 101
    expect(owner.stillOwned()).toBe(false)
  })

  it('is not owned once a different account is active', () => {
    let user: number | null = 101
    const owner = snapshotAccountOwner(() => user)
    user = 202
    expect(owner.stillOwned()).toBe(false)
  })

  it('a guest snapshot never owns account work', () => {
    expect(snapshotAccountOwner(() => null).stillOwned()).toBe(false)
  })

  it('the wait-for-match-end loop exits once the owner signs out', async () => {
    let user: number | null = 101
    const owner = snapshotAccountOwner(() => user)
    const waiting = waitUntilBackgroundWorkAllowed(
      { isRecording: () => true } as never,
      { intervalMs: 1, shouldStop: () => !owner.stillOwned() },
    )
    setTimeout(() => { bumpAccountScope(); user = 202 }, 5)
    await expect(waiting).resolves.toBeUndefined()
    expect(owner.stillOwned()).toBe(false)
  })

  it('a same-account wait still resumes once capture ends', async () => {
    let recording = true
    const owner = snapshotAccountOwner(() => 101)
    const waiting = waitUntilBackgroundWorkAllowed(
      { isRecording: () => recording } as never,
      { intervalMs: 1, shouldStop: () => !owner.stillOwned() },
    )
    setTimeout(() => { recording = false }, 5)
    await waiting
    expect(owner.stillOwned()).toBe(true)
  })
})

describe('cloud save wiring in the main process', () => {
  it('account switch bumps the scope and the archive save rechecks its owner at every boundary', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const src = readFileSync(join(__dirname, 'index.ts'), 'utf8').replace(/\r\n/g, '\n')
    const clear = src.slice(src.indexOf('function clearAccountScopedRuntimeState'), src.indexOf('function clearAccountScopedRuntimeState') + 200)
    expect(clear).toContain('bumpAccountScope()')
    const start = src.indexOf('async function uploadArchiveOnlyImpl')
    const body = src.slice(start, src.indexOf('\n}\n', start))
    expect(body).toContain('snapshotAccountOwner(getActiveUserId)')
    expect(body).toContain("shouldStop: () => !owner.stillOwned()")
    // Before any upload request, and again before catalogue writes or local deletion.
    expect(body.indexOf('if (!owner.stillOwned())', body.indexOf('waitUntilBackgroundWorkAllowed'))).toBeGreaterThan(0)
    expect(body.lastIndexOf('if (!owner.stillOwned())')).toBeLessThan(body.indexOf('recordingsStore.markArchived'))
    expect(body.lastIndexOf('if (!owner.stillOwned())')).toBeGreaterThan(body.indexOf('uploadManager.archiveUpload'))
  })
})
