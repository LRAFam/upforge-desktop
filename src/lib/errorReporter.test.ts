import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const desktop = vi.hoisted(() => ({ available: true }))
vi.mock('./desktop-api', () => ({ hasDesktopApi: () => desktop.available }))
import { reportError, setupRendererErrorReporter } from './errorReporter'

beforeEach(() => { desktop.available = true; vi.stubGlobal('__APP_VERSION__', '2.14.3') })
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
  expect(body.app_version).toBe('2.14.3')
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

it('uses an API-supported platform when running without the desktop bridge', async () => {
  desktop.available = false
  const fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('window', { location: { hash: '#preview' } })
  await reportError({ message: 'Browser preview error' })
  expect(JSON.parse(fetchMock.mock.calls[0]![1].body).platform).toBe('web')
})

it.each([
  ['plain', 'Bad gateway', 'Bad gateway'],
  ['json', '{"message":"Service unavailable"}', 'Service unavailable'],
  ['structured', '{"message":{"detail":"Unavailable"}}', '{"message":{"detail":"Unavailable"}}'],
])('captures a %s error response without consuming the caller’s body', async (kind, text, expected) => {
  const report = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', report)
  const request = vi.fn().mockResolvedValue(new Response(text, { status: 502 }))
  vi.stubGlobal('window', { location: { hash: '#test' }, addEventListener: vi.fn(), fetch: request })
  setupRendererErrorReporter({ config: {} } as any)
  const response = await window.fetch(`https://api.upforge.gg/api/test-${kind}`)
  expect(await response.text()).toBe(text)
  await vi.waitFor(() => expect(report).toHaveBeenCalledOnce())
  expect(JSON.parse(report.mock.calls[0]![1].body).extra.response_body).toBe(expected)
})
