import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('./desktop-api', () => ({ hasDesktopApi: () => true }))
import type { App } from 'vue'
import { isBenignRendererWarning, reportError, setupRendererErrorReporter } from './errorReporter'

beforeEach(() => vi.stubGlobal('__APP_VERSION__', '2.14.3'))
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

it('groups the same renderer warning across installation paths and VOD IDs without hiding other errors', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('window', { location: { hash: '#/vod-review?id=private-recording-id' } })
  const message = 'ResizeObserver loop completed with undelivered notifications.'
  await reportError({ message, component: 'file:///C:/Users/Alice/AppData/Local/Programs/upforge/resources/app.asar/out/renderer/index.html#/vod-review?id=first:0:0' })
  await reportError({ message, component: 'file:///C:/Users/Bob/AppData/Local/Programs/upforge/resources/app.asar/out/renderer/index.html#/vod-review?id=second:0:0' })
  expect(fetchMock).toHaveBeenCalledOnce()
  const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
  expect(body.component).toBe('renderer:index.html#/vod-review:0:0')
  expect(body.url).toBe('#/vod-review')
  expect(JSON.stringify(body)).not.toMatch(/Alice|Bob|private-recording-id|first|second/)

  await reportError({ message: 'A different renderer failure', component: 'VodReview' })
  await reportError({ message, component: 'file:///C:/Users/Alice/upforge/resources/app.asar/out/renderer/index.html#/settings:0:0' })
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

it('does not report the benign ResizeObserver loop warning from window errors, but still reports real errors', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
  const listeners: Record<string, (event: unknown) => void> = {}
  vi.stubGlobal('window', {
    location: { hash: '#/vod-review' },
    fetch: fetchMock,
    addEventListener: (type: string, handler: (event: unknown) => void) => { listeners[type] = handler },
  })
  setupRendererErrorReporter({ config: {} } as unknown as App)

  listeners['error']!({ message: 'ResizeObserver loop completed with undelivered notifications.', filename: 'file:///a/index.html', lineno: 0, colno: 0 })
  listeners['error']!({ message: 'ResizeObserver loop limit exceeded', filename: 'file:///a/index.html', lineno: 0, colno: 0 })
  await Promise.resolve()
  expect(fetchMock).not.toHaveBeenCalled()

  listeners['error']!({ message: 'Cannot read properties of undefined (vod review)', filename: 'file:///a/index.html', lineno: 1, colno: 2 })
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
})

it('only treats the ResizeObserver loop warning as benign', () => {
  expect(isBenignRendererWarning('ResizeObserver loop completed with undelivered notifications.')).toBe(true)
  expect(isBenignRendererWarning('ResizeObserver loop limit exceeded')).toBe(true)
  expect(isBenignRendererWarning('Uncaught TypeError: ResizeObserver is not a constructor')).toBe(false)
  expect(isBenignRendererWarning(undefined)).toBe(false)
})
