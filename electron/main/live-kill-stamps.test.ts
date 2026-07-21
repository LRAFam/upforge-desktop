import { describe, expect, it } from 'vitest'
import {
  applyLiveKillStampsToTimeline,
  buildClipEventsFromKills,
  LIVE_STAMP_MATCH_SEC,
} from './live-kill-stamps'
import type { MatchData } from './riot-types'

function bareTimeline(overrides: Partial<MatchData> = {}): MatchData {
  return {
    game: 'valorant',
    matchId: null,
    puuid: null,
    region: null,
    queueId: null,
    map: null,
    agent: null,
    gameMode: null,
    playerName: null,
    playerTag: null,
    matchStartTime: null,
    gameplayStartTime: null,
    recordingStartTime: 1_000,
    roundScores: [],
    events: [],
    killEvents: [],
    playerKills: [],
    playerDeaths: [],
    spikePlants: [],
    spikeDefuses: [],
    spikeDetonations: [],
    firstBloods: [],
    roundSummaries: [],
    finalStats: null,
    teamSnapshot: [],
    matchDetails: null,
    startTime: 1_000,
    endTime: null,
    ...overrides,
  }
}

describe('applyLiveKillStampsToTimeline', () => {
  it('replaces heuristic videoOffsetMs with live recording stamps', () => {
    const tl = bareTimeline({
      playerKills: [
        {
          EventID: 1,
          EventName: 'ChampionKill',
          EventTime: 90,
          killerName: 'You',
          victimName: 'Enemy',
          assistants: [],
          timeSinceGameStartMillis: 90_000,
          videoOffsetMs: 120_000, // wrong heuristic
        },
      ],
    })

    const applied = applyLiveKillStampsToTimeline(tl, [
      { eventTimeSec: 90.2, recordingOffsetMs: 82_000, stampedAt: Date.now() },
    ])

    expect(applied).toBe(1)
    expect(tl.playerKills[0]?.videoOffsetMs).toBe(82_000)
  })

  it('ignores stamps outside the match window', () => {
    const tl = bareTimeline({
      playerKills: [
        {
          EventID: 1,
          EventName: 'ChampionKill',
          EventTime: 10,
          killerName: 'You',
          victimName: 'Enemy',
          assistants: [],
          timeSinceGameStartMillis: 10_000,
          videoOffsetMs: 18_000,
        },
      ],
    })

    const applied = applyLiveKillStampsToTimeline(tl, [
      { eventTimeSec: 10 + LIVE_STAMP_MATCH_SEC + 1, recordingOffsetMs: 1, stampedAt: Date.now() },
    ])

    expect(applied).toBe(0)
    expect(tl.playerKills[0]?.videoOffsetMs).toBe(18_000)
  })
})

describe('buildClipEventsFromKills', () => {
  it('stores in-clip offsets from ffmpeg cut start', () => {
    const events = buildClipEventsFromKills(
      [{ videoOffsetMs: 50_000, victimAgent: 'Sage', round: 5 }],
      42_000,
      13_000,
    )
    expect(events).toHaveLength(1)
    expect(events[0]?.clip_offset_ms).toBe(8_000)
    expect(events[0]?.vod_offset_ms).toBe(50_000)
    expect(events[0]?.victim_agent).toBe('Sage')
  })
})
