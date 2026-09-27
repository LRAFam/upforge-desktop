import { describe, expect, it } from 'vitest'
import { buildReviewEvents } from './review-timeline'
import { reviewVideoUrl } from './review-media'
import type { RecordingTimeline } from '../composables/useVodReview'

const source = (): RecordingTimeline => ({ id: 'recording-a', videoPath: '/video.mp4', map: 'Ascent', agent: 'Fade', game: 'valorant', gameMode: 'competitive', recordedAt: 1, kills: [], deaths: [], roundSummaries: [], teamSnapshot: [], finalStats: null })
describe('shared review event construction', () => {
  it('classifies each participant and preserves event coordinates without mutating the source', () => {
    const data = source()
    data.kills = [
      { killerName: 'You', victimName: 'Clove', killerPuuid: 'me', videoOffsetMs: 12000, round: 1 },
      { killerName: 'Fade', victimName: 'You', victimPuuid: 'me', videoOffsetMs: 14000, round: 1 },
      { killerName: 'Jett', victimName: 'Sage', videoOffsetMs: 11000, round: 1 },
    ]
    const before = JSON.stringify(data)
    expect(buildReviewEvents(data, 'me').map(e => [e.type, e.videoOffsetMs])).toEqual([['neutral', 11000], ['kill', 12000], ['death', 14000]])
    expect(JSON.stringify(data)).toBe(before)
  })
  it('keeps different recordings events isolated and retains objective context', () => {
    const a = source(), b = source()
    a.spikePlants = [{ planter: 'You', site: 'B', videoOffsetMs: 5000, round: 2 }]
    b.deaths = [{ killerName: 'Clove', victimName: 'You', videoOffsetMs: 8000, round: 4 }]
    expect(buildReviewEvents(a, null)).toMatchObject([{ type: 'plant', site: 'B', round: 2 }])
    expect(buildReviewEvents(b, null)).toMatchObject([{ type: 'death', round: 4 }])
    expect(buildReviewEvents(source(), null)).toEqual([])
  })
  it('does not duplicate the separate death feed or invent a time for missing events', () => {
    const data = source()
    data.kills = [{ killerName: 'Clove', victimName: 'You', videoOffsetMs: 8000 }]
    data.deaths = [...data.kills, { killerName: 'Fade', victimName: 'You' }]
    expect(buildReviewEvents(data, null)).toHaveLength(1)
  })
})
describe('shared recording URL conversion', () => {
  it('preserves cloud URLs and handles local paths on both supported platforms', () => {
    expect(reviewVideoUrl(null)).toBe('')
    expect(reviewVideoUrl('https://example.test/video?signature=abc')).toBe('https://example.test/video?signature=abc')
    expect(reviewVideoUrl('/my footage/video.mp4')).toBe('file:///my%20footage/video.mp4')
    expect(reviewVideoUrl('C:\\Videos\\match.mp4')).toBe('file:///C:/Videos/match.mp4')
  })
})
