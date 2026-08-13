import { describe, expect, it } from 'vitest'
import {
  formatLolClipsSkippedActivity,
  formatLolLinkActivity,
  formatLolMatchEndActivity,
} from './lol-enrich-activity'

describe('formatLolMatchEndActivity', () => {
  it('includes source, gameId, and queue', () => {
    expect(formatLolMatchEndActivity({
      source: 'live-client',
      gameId: '900000042',
      queueId: 420,
    })).toBe('Match ended (live-client) - gameId=900000042 queue=420')
  })

  it('shows gameId=none when missing', () => {
    expect(formatLolMatchEndActivity({
      source: 'process',
      gameId: null,
      queueId: null,
    })).toContain('gameId=none')
  })
})

describe('formatLolLinkActivity', () => {
  it('explains no_match_id without gameId', () => {
    const s = formatLolLinkActivity({
      status: 'no_match_id',
      hasGameId: false,
      queueId: 420,
    })
    expect(s).toContain('LoL link: no_match_id')
    expect(s).toMatch(/no gameId/i)
    expect(s).not.toContain('—')
  })

  it('reports fetched', () => {
    expect(formatLolLinkActivity({ status: 'fetched', hasGameId: true })).toContain('fetched')
  })
})

describe('formatLolClipsSkippedActivity', () => {
  it('includes kill count', () => {
    expect(formatLolClipsSkippedActivity(7)).toContain('7')
    expect(formatLolClipsSkippedActivity(7)).toMatch(/video timestamps/i)
  })
})
