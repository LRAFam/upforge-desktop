import { describe, expect, it } from 'vitest'
import type { ClipRecord } from '../env.d.ts'
import { filterSessionClips } from './session-clips'

function clip(partial: Partial<ClipRecord> & Pick<ClipRecord, 'id' | 'savedAt'>): ClipRecord {
  return {
    path: '/clips/test.mp4',
    thumbPath: null,
    trigger: 'kill',
    map: 'Bind',
    agent: 'Jett',
    durationSeconds: 12,
    round: 3,
    killCount: 1,
    title: null,
    analysisJobId: null,
    matchId: null,
    game: 'valorant',
    gameMode: null,
    weapon: null,
    abilitySlot: null,
    uploadStatus: 'local',
    apiClipId: null,
    shareToken: null,
    analysisStatus: 'none',
    verdict: null,
    suggestion: null,
    coachingTags: [],
    overallScore: null,
    published: false,
    favorited: false,
    ...partial,
  }
}

describe('filterSessionClips', () => {
  const now = Date.now()
  const sessionStart = now - 30 * 60 * 1000

  it('matches clips by matchId regardless of age', () => {
    const clips = [
      clip({ id: 'a', savedAt: now - 7 * 24 * 60 * 60 * 1000, matchId: 'match-1', agent: 'Jett' }),
      clip({ id: 'b', savedAt: now, matchId: 'match-2', agent: 'Jett' }),
    ]
    expect(filterSessionClips(clips, { matchId: 'match-1', agent: 'Jett', sessionStart }).map(c => c.id))
      .toEqual(['a'])
  })

  it('falls back to agent + session window when matchId is missing', () => {
    const clips = [
      clip({ id: 'recent', savedAt: sessionStart + 1000, agent: 'Jett' }),
      clip({ id: 'old', savedAt: sessionStart - 2 * 60 * 60 * 1000, agent: 'Jett' }),
      clip({ id: 'other-agent', savedAt: now, agent: 'Reyna' }),
    ]
    expect(filterSessionClips(clips, { matchId: null, agent: 'Jett', sessionStart }).map(c => c.id))
      .toEqual(['recent'])
  })

  it('does not return entire library when sessionStart is zero', () => {
    const clips = [
      clip({ id: 'ancient', savedAt: now - 30 * 24 * 60 * 60 * 1000, agent: 'Jett' }),
      clip({ id: 'recent', savedAt: now - 2 * 60 * 1000, agent: 'Jett' }),
    ]
    const filtered = filterSessionClips(clips, { matchId: null, agent: 'Jett', sessionStart: 0 })
    expect(filtered.map(c => c.id)).toEqual(['recent'])
  })
})
