import { afterEach, expect, it, vi } from 'vitest'
vi.mock('./desktop-api', () => ({ hasDesktopApi: () => true }))
import { reportError } from './errorReporter'

afterEach(() => vi.unstubAllGlobals())

it('includes bounded and redacted activity for renderer errors', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('window', {
    location: { hash: '#test' },
    api: { auth: { getUser: async () => null }, app: { getActivityLog: async () =>
      Array.from({ length: 60 }, (_, time) => ({ time, message: 'user@example.com token=secret' })) } },
  })
  await reportError({ message: 'Renderer test' })
  const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
  expect(body.extra.recent_activity).toHaveLength(50)
  expect(body.extra.recent_activity[0]).toEqual({ time: 10, message: '[redacted-email] [redacted-secret]' })
})

it('still reports errors when activity is unavailable, with an explicit null', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('window', { location: { hash: '#test' } })
  await reportError({ message: 'Activity unavailable test' })
  const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
  expect(body.extra.recent_activity).toBeNull()
})
