import { describe, expect, it } from 'vitest'
import { INBOX_LIMIT, inboxAge, inboxTarget, toInboxSnapshot } from './notification-inbox'

describe('toInboxSnapshot', () => {
  it('keeps valid rows, uses the API unread count and drops junk', () => {
    const snap = toInboxSnapshot({
      unread_count: 3,
      notifications: [
        { id: 1, type: 'review_completed', title: 'Coach review ready', message: 'Open it', read: false, created_at: '2026-11-02T10:00:00Z', data: { analysis_id: 9 } },
        { id: 2, type: 'x', title: '', message: 'Only a message', read: 1, data: null },
        { id: 'bad', title: 'no id' },
        { id: 3, title: '', message: '' },
        null,
      ],
    }, 5)
    expect(snap.unreadCount).toBe(3)
    expect(snap.fetchedAt).toBe(5)
    expect(snap.items.map(i => i.id)).toEqual([1, 2])
    expect(snap.items[1]).toMatchObject({ title: 'Only a message', message: '', read: true, data: {} })
  })

  it('counts unread itself when the API omits it, and caps the list', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, title: `n${i}`, message: '', read: false }))
    const snap = toInboxSnapshot({ notifications: rows }, 0)
    expect(snap.items).toHaveLength(INBOX_LIMIT)
    expect(snap.unreadCount).toBe(INBOX_LIMIT)
    expect(toInboxSnapshot(null, 0)).toEqual({ items: [], unreadCount: 0, fetchedAt: 0 })
  })
})

describe('inboxTarget', () => {
  it('opens coach reviews in the app and roster replies in Coaches', () => {
    expect(inboxTarget({ type: 'review_completed', data: { analysis_id: 42 } }))
      .toEqual({ kind: 'app', path: '/vod-review', query: { timelineId: '42', coachNotes: '1' } })
    expect(inboxTarget({ type: 'review_in_progress', data: { analysis_id: 42 } }))
      .toEqual({ kind: 'app', path: '/vod-review', query: { timelineId: '42' } })
    expect(inboxTarget({ type: 'review_completed', data: { source: 'roster', review_id: 3 } })).toEqual({ kind: 'app', path: '/rosters' })
  })

  it('sends web-only items to upforge.gg paths', () => {
    expect(inboxTarget({ type: 'analysis_complete', data: { analysis_log_id: 7, game_type: 'cs2' } })).toEqual({ kind: 'analysis', analysisId: 7 })
    expect(inboxTarget({ type: 'analysis_complete', data: { analysis_log_id: '7', game_type: '../evil' } })).toEqual({ kind: 'analysis', analysisId: 7 })
    expect(inboxTarget({ type: 'analysis_complete', data: { analysis_log_id: '07x' } })).toEqual({ kind: 'app', path: '/recordings' })
    expect(inboxTarget({ type: 'review_requested', data: { review_id: 5 } })).toEqual({ kind: 'web', path: '/coach-dashboard/reviews/feed?review=5' })
    expect(inboxTarget({ type: 'review_received', data: {} })).toEqual({ kind: 'web', path: '/my-coaches' })
    expect(inboxTarget({ type: 'other', data: { guide_id: 4, action: 'view_guide' } })).toEqual({ kind: 'web', path: '/guides/4' })
    expect(inboxTarget({ type: 'other', data: { session_id: 'abc' } })).toEqual({ kind: 'web', path: '/coaching/session/abc' })
    expect(inboxTarget({ type: 'other', data: { action: 'leave_review' } })).toEqual({ kind: 'web', path: '/profile?tab=coaching' })
  })

  it('rejects unsafe ids and has no target for unknown types', () => {
    expect(inboxTarget({ type: 'other', data: { session_id: '../x' } })).toBeNull()
    expect(inboxTarget({ type: 'analysis_failed', data: {} })).toEqual({ kind: 'app', path: '/recordings' })
    expect(inboxTarget({ type: 'welcome', data: {} })).toBeNull()
  })
})

describe('inboxAge', () => {
  const now = Date.parse('2026-11-02T12:00:00Z')
  it('formats short relative ages', () => {
    expect(inboxAge('2026-11-02T11:59:40Z', now)).toBe('now')
    expect(inboxAge('2026-11-02T11:55:00Z', now)).toBe('5m')
    expect(inboxAge('2026-11-02T09:00:00Z', now)).toBe('3h')
    expect(inboxAge('2026-10-31T12:00:00Z', now)).toBe('2d')
    expect(inboxAge(null, now)).toBe('')
    expect(inboxAge('nope', now)).toBe('')
  })
})

describe('inboxTarget · cloud retention', () => {
  it('opens Cloud storage for expiring-video warnings', () => {
    expect(inboxTarget({ type: 'cloud_video_expiring', data: { kind: 'recording', id: 'a', expires_at: '2026-11-20T03:00:00Z', deep_link: 'upforge://cloud-storage' } }))
      .toEqual({ kind: 'app', path: '/cloud-storage' })
    expect(inboxTarget({ type: 'cloud_video_expiring', data: {} })).toEqual({ kind: 'app', path: '/cloud-storage' })
  })
})
