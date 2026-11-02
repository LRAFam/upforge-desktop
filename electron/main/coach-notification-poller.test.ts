import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp') },
  BrowserWindow: class {},
  shell: { openExternal: vi.fn() },
}))
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))
vi.mock('./api-base', () => ({ getFrontendBaseUrl: vi.fn(() => 'https://example.test') }))
vi.mock('./app-notifications', () => ({ showAppNotification: vi.fn() }))

import {
  coachNotificationTarget,
  parseShownIds,
  selectNewCoachNotifications,
  trimShownIds,
  type ApiNotification,
} from './coach-notification-poller'

function n(overrides: Partial<ApiNotification> = {}): ApiNotification {
  return {
    id: 1,
    type: 'review_completed',
    title: 'Title',
    message: 'Message',
    read: false,
    ...overrides,
  }
}

describe('selectNewCoachNotifications', () => {
  it('returns unread, unseen coach notifications in order', () => {
    const list = [
      n({ id: 1, type: 'review_completed' }),
      n({ id: 2, type: 'review_requested' }),
      n({ id: 3, type: 'review_in_progress' }),
    ]
    expect(selectNewCoachNotifications(list, new Set()).map(x => x.id)).toEqual([1, 2, 3])
  })

  it('skips read notifications', () => {
    const list = [n({ id: 1, read: true }), n({ id: 2 })]
    expect(selectNewCoachNotifications(list, new Set()).map(x => x.id)).toEqual([2])
  })

  it('skips notifications already shown', () => {
    const list = [n({ id: 1 }), n({ id: 2 })]
    expect(selectNewCoachNotifications(list, new Set([1])).map(x => x.id)).toEqual([2])
  })

  it('ignores non-coach notification types', () => {
    const list = [n({ id: 1, type: 'friend_request' }), n({ id: 2, type: 'match_ready' }), n({ id: 3 })]
    expect(selectNewCoachNotifications(list, new Set()).map(x => x.id)).toEqual([3])
  })

  it('returns an empty list for no input', () => {
    expect(selectNewCoachNotifications([], new Set([1]))).toEqual([])
  })
})

describe('coachNotificationTarget', () => {
  it('routes review_requested to the browser reviews feed with the review id', () => {
    expect(coachNotificationTarget(n({ type: 'review_requested', data: { review_id: 7, analysis_id: 9 } })))
      .toEqual({ kind: 'browser-reviews', reviewId: 7 })
  })

  it('routes review_requested without a review id to the feed', () => {
    expect(coachNotificationTarget(n({ type: 'review_requested' })))
      .toEqual({ kind: 'browser-reviews', reviewId: undefined })
  })

  it('routes review_completed with an analysis to vod-review with coach notes and seek', () => {
    expect(coachNotificationTarget(n({ type: 'review_completed', data: { analysis_id: 42 } })))
      .toEqual({ kind: 'vod-review', analysisId: 42, coachNotes: true, needsSeek: true })
  })

  it('routes review_in_progress with an analysis to vod-review without coach notes', () => {
    expect(coachNotificationTarget(n({ type: 'review_in_progress', data: { analysis_id: 42 } })))
      .toEqual({ kind: 'vod-review', analysisId: 42, coachNotes: false, needsSeek: false })
  })

  it('routes other types with an analysis to a plain vod-review', () => {
    expect(coachNotificationTarget(n({ type: 'something_else', data: { analysis_id: 5 } })))
      .toEqual({ kind: 'vod-review', analysisId: 5, coachNotes: false, needsSeek: false })
  })

  it('falls back to my-coaches when there is no analysis id', () => {
    expect(coachNotificationTarget(n({ type: 'review_completed' }))).toEqual({ kind: 'my-coaches' })
    expect(coachNotificationTarget(n({ type: 'review_in_progress', data: {} }))).toEqual({ kind: 'my-coaches' })
    expect(coachNotificationTarget(n({ type: 'other', data: { source: 'x' } }))).toEqual({ kind: 'my-coaches' })
  })

  it('treats analysis_id 0 as missing', () => {
    expect(coachNotificationTarget(n({ type: 'review_completed', data: { analysis_id: 0 } })))
      .toEqual({ kind: 'my-coaches' })
  })
})

describe('parseShownIds', () => {
  it('parses a valid id array', () => {
    expect([...parseShownIds('[1,2,3]')]).toEqual([1, 2, 3])
  })

  it('returns an empty set for corrupted JSON', () => {
    expect(parseShownIds('{not json').size).toBe(0)
    expect(parseShownIds('').size).toBe(0)
  })

  it('returns an empty set for non-array JSON', () => {
    expect(parseShownIds('{"a":1}').size).toBe(0)
    expect(parseShownIds('42').size).toBe(0)
    expect(parseShownIds('null').size).toBe(0)
  })

  it('keeps only finite integers from mixed-type arrays', () => {
    const ids = parseShownIds('[1, "2", 3.5, null, true, {"id":4}, [5], 6, -7, 1e400]')
    expect([...ids]).toEqual([1, 6, -7])
  })
})

describe('trimShownIds', () => {
  it('keeps the 500 most recent ids', () => {
    const ids = new Set(Array.from({ length: 600 }, (_, i) => i))
    const trimmed = trimShownIds(ids)
    expect(trimmed).toHaveLength(500)
    expect(trimmed[0]).toBe(100)
    expect(trimmed[499]).toBe(599)
  })

  it('keeps everything under the limit', () => {
    expect(trimShownIds(new Set([3, 1, 2]))).toEqual([3, 1, 2])
  })
})
