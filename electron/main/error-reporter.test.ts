import { expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: { getVersion: () => 'test' } }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn(), debug: vi.fn() } }))
vi.mock('./app-notifications', () => ({ showAppNotification: vi.fn() }))
import { reportError } from './error-reporter'
import { recordErrorActivity, clearErrorActivity } from './error-activity'

it('posts redacted activity and failure details alongside the error', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
  try {
    recordErrorActivity('Preparing duel clips user@example.com', 123)
    await reportError({ message: 'Extraction failed', extra: { failure_details: ['ffmpeg: token=secret'] } })
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
    expect(body.extra.recent_activity).toEqual([{ time: 123, message: 'Preparing duel clips [redacted-email]' }])
    expect(body.extra.failure_details).toEqual(['ffmpeg: [redacted-secret]'])
  } finally {
    clearErrorActivity()
    vi.unstubAllGlobals()
  }
})
