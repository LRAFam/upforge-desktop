import { expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: { getVersion: () => 'test' } }))
vi.mock('electron-log', () => ({ default: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))
vi.mock('./app-notifications', () => ({ showAppNotification: vi.fn() }))
import { setupMainProcessErrorHandlers } from './error-reporter'
import { showAppNotification } from './app-notifications'

it('handles uncaught ENOSPC with a storage notification and mocked diagnostic reporting', async () => {
  const existingException = process.listeners('uncaughtException')
  const existingRejection = process.listeners('unhandledRejection')
  const fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
  try {
    setupMainProcessErrorHandlers({ getUser: () => null } as never)
    const handler = process.listeners('uncaughtException').find(fn => !existingException.includes(fn))!
    handler(Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' }), 'uncaughtException')
    await Promise.resolve()
    expect(showAppNotification).toHaveBeenCalledWith(expect.objectContaining({ title: 'UpForge — Disk Full', body: expect.stringContaining('free up space') }))
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({ component: 'main:uncaughtException', extra: { fatal: true } })
  } finally {
    for (const fn of process.listeners('uncaughtException')) if (!existingException.includes(fn)) process.removeListener('uncaughtException', fn)
    for (const fn of process.listeners('unhandledRejection')) if (!existingRejection.includes(fn)) process.removeListener('unhandledRejection', fn)
    vi.unstubAllGlobals()
  }
})
