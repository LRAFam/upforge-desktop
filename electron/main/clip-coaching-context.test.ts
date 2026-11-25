import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd() },
}))

import { buildClipUploadPayload, resolveClipTimeline } from './clip-coaching-context'
import type { ClipRecord } from './clip-store'
import type { MatchData } from './riot-types'

function timeline(matchId: string | null): MatchData {
  return { matchId } as MatchData
}

describe('resolveClipTimeline', () => {
  const recordings = [
    { jobId: 'job-1', timeline: timeline('match-A') },
    { jobId: 'job-2', timeline: timeline('match-B') },
  ]

  it('resolves by analysisJobId when present', () => {
    const t = resolveClipTimeline({ analysisJobId: 'job-2', matchId: null }, recordings)
    expect(t?.matchId).toBe('match-B')
  })

  it('falls back to matchId for non-analysis (live) clips', () => {
    const t = resolveClipTimeline({ analysisJobId: null, matchId: 'match-A' }, recordings)
    expect(t?.matchId).toBe('match-A')
  })

  it('returns null when neither matches', () => {
    expect(resolveClipTimeline({ analysisJobId: null, matchId: 'nope' }, recordings)).toBeNull()
    expect(resolveClipTimeline({ analysisJobId: null, matchId: null }, recordings)).toBeNull()
  })

  it('prefers the analysis-linked recording over matchId', () => {
    const t = resolveClipTimeline({ analysisJobId: 'job-1', matchId: 'match-B' }, recordings)
    expect(t?.matchId).toBe('match-A')
  })
})

describe('buildClipUploadPayload game', () => {
  it('sends the clip game so a published clip reaches the right game channel', () => {
    expect(buildClipUploadPayload({ game: 'cs2' } as ClipRecord, null).game).toBe('cs2')
    expect(buildClipUploadPayload({} as ClipRecord, { game: 'deadlock' } as MatchData).game).toBe('deadlock')
    expect(buildClipUploadPayload({} as ClipRecord, null).game).toBeUndefined()
  })
})
