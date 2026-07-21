import { describe, expect, it, vi } from 'vitest'
import { applySyncNudgeToMatchClips, shiftClipTimingByDelta } from './clip-sync-nudge'
import type { ClipRecord, ClipStore } from './clip-store'

function bareClip(overrides: Partial<ClipRecord> = {}): ClipRecord {
  return {
    id: 'c1',
    path: '/tmp/c1.mp4',
    thumbPath: null,
    trigger: 'kill',
    map: 'Ascent',
    agent: 'Jett',
    durationSeconds: 13,
    round: 5,
    momentOffsetMs: 50_000,
    clipStartMs: 42_000,
    clipEvents: [{
      event_type: 'kill',
      clip_offset_ms: 8_000,
      vod_offset_ms: 50_000,
      victim_agent: 'Sage',
      weapon: null,
      round: 5,
    }],
    killCount: null,
    title: null,
    savedAt: Date.now(),
    analysisJobId: null,
    matchId: 'match-1',
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
    ...overrides,
  }
}

describe('shiftClipTimingByDelta', () => {
  it('shifts VOD anchors but keeps in-clip offsets', () => {
    const patch = shiftClipTimingByDelta(bareClip(), -2_000)
    expect(patch.momentOffsetMs).toBe(48_000)
    expect(patch.clipStartMs).toBe(40_000)
    expect(patch.clipEvents?.[0]?.vod_offset_ms).toBe(48_000)
    expect(patch.clipEvents?.[0]?.clip_offset_ms).toBe(8_000)
  })
})

describe('applySyncNudgeToMatchClips', () => {
  it('updates local clips for the match and skips uploaded ones', () => {
    const local = bareClip({ id: 'local' })
    const uploaded = bareClip({ id: 'up', uploadStatus: 'uploaded', momentOffsetMs: 50_000 })
    const store = {
      getAll: () => [local, uploaded],
      update: vi.fn((id: string, patch: Partial<ClipRecord>) => {
        if (id === 'local') Object.assign(local, patch)
      }),
    } as unknown as ClipStore

    const n = applySyncNudgeToMatchClips(store, { matchId: 'match-1', deltaMs: 1_000 })
    expect(n).toBe(1)
    expect(local.momentOffsetMs).toBe(51_000)
    expect(store.update).toHaveBeenCalledTimes(1)
  })
})
