/**
 * Dev-only: turn the anonymised real Bind match (src/dev/fixtures/valorant-bind-match.json,
 * copied from upforge-frontend/tests/fixtures/valorant-match-report-bind.json) into a
 * RecordingTimeline so the v3 match page can be checked with real match data.
 * There is no recording, so events are placed by game time (timeSinceGameStartMillis)
 * and the player area shows a "no recording" placeholder.
 */
import type { RecordingTimeline } from '../env.d.ts'

export const DEV_BIND_FIXTURE_ID = 'dev-bind-fixture'

type RawKill = {
  killerName?: string; victimName?: string; weapon?: string; round?: number
  killerPuuid?: string; victimPuuid?: string; timeSinceGameStartMillis?: number
}
type RawMatch = Record<string, unknown> & {
  map?: string; agent?: string; game?: string; gameMode?: string; matchId?: string
  playerKills?: RawKill[]; playerDeaths?: RawKill[]; killEvents?: RawKill[]
  roundSummaries?: RecordingTimeline['roundSummaries']
  teamSnapshot?: RecordingTimeline['teamSnapshot']
  finalStats?: { kills?: number; deaths?: number; assists?: number } | null
  finalScore?: { allyScore?: number; enemyScore?: number } | null
}

function event(k: RawKill) {
  return {
    killerName: k.killerName ?? 'Unknown',
    victimName: k.victimName ?? 'Unknown',
    weapon: k.weapon,
    round: k.round,
    killerPuuid: k.killerPuuid,
    victimPuuid: k.victimPuuid,
    videoOffsetMs: typeof k.timeSinceGameStartMillis === 'number' ? k.timeSinceGameStartMillis : undefined,
  }
}

export function bindFixtureTimeline(md: RawMatch, recordedAt = Date.UTC(2026, 9, 22, 20, 0)): RecordingTimeline & { devFixture: true } {
  const fs = md.finalStats ?? null
  const score = md.finalScore ?? null
  const won = score && typeof score.allyScore === 'number' && typeof score.enemyScore === 'number'
    ? score.allyScore > score.enemyScore
    : undefined
  return {
    ...(md as object),
    id: DEV_BIND_FIXTURE_ID,
    devFixture: true,
    matchId: md.matchId ?? null,
    videoPath: null,
    hasLocalFile: false,
    map: md.map ?? null,
    agent: md.agent ?? null,
    game: md.game ?? 'valorant',
    gameMode: md.gameMode ?? 'COMPETITIVE',
    recordedAt,
    kills: (md.playerKills ?? []).map(event),
    deaths: (md.playerDeaths ?? []).map(event),
    roundSummaries: md.roundSummaries ?? [],
    teamSnapshot: md.teamSnapshot ?? [],
    finalStats: fs ? { kills: fs.kills ?? 0, deaths: fs.deaths ?? 0, assists: fs.assists ?? 0, won } : null,
    videoSyncOffsetMs: 0,
  } as RecordingTimeline & { devFixture: true }
}
