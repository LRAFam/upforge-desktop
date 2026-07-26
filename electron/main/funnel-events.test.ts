import { describe, expect, it, vi, beforeEach } from 'vitest'

const post = vi.fn().mockResolvedValue({})

vi.mock('./auth-manager', () => ({}))

vi.mock('electron-log', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  initFunnelEvents,
  sanitizeOpsProperties,
  trackOpsRecordingLap,
} from './funnel-events'

describe('sanitizeOpsProperties', () => {
  it('keeps path_fallback but drops path keys and absolute path strings', () => {
    const cleaned = sanitizeOpsProperties({
      path_fallback: true,
      save_path: '/Users/me/Videos',
      note: 'ok',
      nested: { file_path: 'C:\\Videos\\a.mp4', bitrate: 5 },
    })
    expect(cleaned.path_fallback).toBe(true)
    expect(cleaned.save_path).toBeUndefined()
    expect(cleaned.note).toBe('ok')
    expect((cleaned.nested as Record<string, unknown>).bitrate).toBe(5)
    expect((cleaned.nested as Record<string, unknown>).file_path).toBeUndefined()
  })
})

describe('trackOpsRecordingLap', () => {
  beforeEach(() => {
    post.mockClear()
    initFunnelEvents(
      { getToken: () => 'tok', getApi: () => ({ post }) } as never,
      '2.10.37',
    )
  })

  it('posts ops_recording_lap with sanitized properties', async () => {
    trackOpsRecordingLap({
      event: 'ops_recording_lap',
      match_correlation_id: 'abc',
      save_path: '/Users/secret',
      game: 'valorant',
    })
    await vi.waitFor(() => expect(post).toHaveBeenCalled())
    const body = post.mock.calls[0]![1]
    expect(body.event).toBe('ops_recording_lap')
    expect(body.properties.match_correlation_id).toBe('abc')
    expect(body.properties.game).toBe('valorant')
    expect(body.properties.save_path).toBeUndefined()
    expect(body.properties.event).toBeUndefined()
  })
})
