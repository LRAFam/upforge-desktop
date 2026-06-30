import { describe, expect, it } from 'vitest'
import type { ClipRecord } from '../env.d.ts'
import { buildClipMatchGroups, formatTriggerBreakdown } from './clip-match-groups'

function clip(partial: Partial<ClipRecord> & Pick<ClipRecord, 'id' | 'savedAt'>): ClipRecord {
  return {
    path: '/clips/test.mp4',
    thumbPath: null,
    trigger: 'kill',
    map: 'Ascent',
    agent: 'Jett',
    durationSeconds: 12,
    round: 3,
    momentOffsetMs: null,
    killCount: null,
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

describe('buildClipMatchGroups', () => {
  it('groups clips by matchId', () => {
    const now = Date.now()
    const groups = buildClipMatchGroups([
      clip({ id: 'a', savedAt: now, matchId: 'm1', agent: 'Jett' }),
      clip({ id: 'b', savedAt: now - 1000, matchId: 'm1', agent: 'Jett', trigger: 'clutch' }),
      clip({ id: 'c', savedAt: now, matchId: 'm2', agent: 'Reyna', map: 'Bind' }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].clips.map(c => c.id).sort()).toEqual(['a', 'b'].sort())
    expect(groups[0].triggerCounts.kill).toBe(1)
    expect(groups[0].triggerCounts.clutch).toBe(1)
    expect(groups[0].topMoments[0].trigger).toBe('clutch')
  })

  it('buckets orphan clips by agent and day', () => {
    const now = Date.now()
    const groups = buildClipMatchGroups([
      clip({ id: 'a', savedAt: now, agent: 'Jett' }),
      clip({ id: 'b', savedAt: now - 1000, agent: 'Jett' }),
      clip({ id: 'c', savedAt: now - 3 * 86_400_000, agent: 'Jett' }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].clips).toHaveLength(2)
    expect(groups[0].matchId).toBeNull()
  })
})

describe('formatTriggerBreakdown', () => {
  it('formats trigger counts', () => {
    expect(formatTriggerBreakdown({ kill: 4, clutch: 1, hotkey: 1 })).toBe(
      '4 kills · 1 clutch · 1 bookmark',
    )
  })
})
