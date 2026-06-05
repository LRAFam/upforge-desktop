/**
 * Shapes MatchData for API upload / analysis — drops redundant blobs and
 * fills fields the backend and AI service expect.
 */
import type { MatchData } from './riot-types'
import { recomputeTimelineVideoOffsets } from './riot-local-api'

/** Slim Riot MatchDetails subset for coaching prompts (avoids multi‑MB raw JSON). */
export interface MatchDetailsLite {
  matchInfo?: {
    gameLengthMillis?: number
    mapId?: string
    queueID?: string
    gameMode?: string
  }
  players?: Array<{
    subject?: string | null
    gameName?: string | null
    tagLine?: string | null
    teamId?: string | null
    characterId?: string | null
    competitiveTier?: number | null
    accountLevel?: number | null
    stats?: {
      kills?: number
      deaths?: number
      assists?: number
      score?: number
    }
  }>
}

export type UploadMatchData = Omit<MatchData, 'events' | 'matchDetails'> & {
  /** Legacy duplicate of killEvents — omitted on upload. */
  events?: never
  matchDetails?: never
  matchDetailsLite?: MatchDetailsLite | null
}

function slimMatchDetails(raw: Record<string, unknown> | null | undefined): MatchDetailsLite | null {
  if (!raw) return null
  const matchInfo = raw.matchInfo as Record<string, unknown> | undefined
  const players = raw.players as Array<Record<string, unknown>> | undefined
  if (!matchInfo && !players?.length) return null

  return {
    matchInfo: matchInfo
      ? {
          gameLengthMillis: matchInfo.gameLengthMillis as number | undefined,
          mapId: matchInfo.mapId as string | undefined,
          queueID: matchInfo.queueID as string | undefined,
          gameMode: matchInfo.gameMode as string | undefined,
        }
      : undefined,
    players: players?.map((p) => {
      const stats = p.stats as Record<string, number> | undefined
      return {
        subject: (p.subject as string) ?? null,
        gameName: (p.gameName as string) ?? null,
        tagLine: (p.tagLine as string) ?? null,
        teamId: (p.teamId as string) ?? null,
        characterId: (p.characterId as string) ?? null,
        competitiveTier: (p.competitiveTier as number) ?? null,
        accountLevel: (p.accountLevel as number) ?? null,
        stats: stats
          ? {
              kills: stats.kills,
              deaths: stats.deaths,
              assists: stats.assists,
              score: stats.score,
            }
          : undefined,
      }
    }),
  }
}

/** Normalise queue/mode for Laravel + AI (lowercase snake). */
export function gameModeForApi(gameMode: string | null | undefined): string | null {
  if (!gameMode) return null
  return gameMode
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

/**
 * Build the match_data object sent to presign/complete and the AI service.
 * - Omits duplicate `events` (same rows as killEvents)
 * - Replaces raw `matchDetails` with `matchDetailsLite`
 * - Fills finalStats.summonerName from playerName when Riot omits gameName
 */
export function prepareMatchDataForUpload(timeline: MatchData | null): UploadMatchData | undefined {
  if (!timeline) return undefined
  recomputeTimelineVideoOffsets(timeline)

  const finalStats = timeline.finalStats
    ? {
        ...timeline.finalStats,
        summonerName:
          timeline.finalStats.summonerName
          ?? timeline.playerName
          ?? null,
        agent: timeline.finalStats.agent ?? timeline.agent ?? null,
      }
    : null

  const upload: UploadMatchData = {
    game: timeline.game,
    matchId: timeline.matchId,
    puuid: timeline.puuid,
    region: timeline.region,
    queueId: timeline.queueId,
    map: timeline.map,
    agent: timeline.agent,
    gameMode: timeline.gameMode,
    playerName: timeline.playerName,
    playerTag: timeline.playerTag,
    matchStartTime: timeline.matchStartTime,
    gameplayStartTime: timeline.gameplayStartTime,
    recordingStartTime: timeline.recordingStartTime,
    videoSyncOffsetMs: timeline.videoSyncOffsetMs ?? 0,
    roundScores: timeline.roundScores,
    killEvents: timeline.killEvents,
    playerKills: timeline.playerKills,
    playerDeaths: timeline.playerDeaths,
    spikePlants: timeline.spikePlants,
    spikeDefuses: timeline.spikeDefuses,
    spikeDetonations: timeline.spikeDetonations,
    firstBloods: timeline.firstBloods,
    roundSummaries: timeline.roundSummaries,
    finalStats,
    teamSnapshot: timeline.teamSnapshot,
    matchDetailsLite: slimMatchDetails(timeline.matchDetails),
    spatialSummary: timeline.spatialSummary,
    startTime: timeline.startTime,
    endTime: timeline.endTime,
  }

  return upload
}

/** Top-level job fields derived from timeline (avoids null game_mode on params). */
export function submissionContextFromTimeline(timeline: MatchData | null): {
  map?: string
  agent?: string
  game_mode?: string
  match_data?: UploadMatchData
} {
  if (!timeline) return {}
  const match_data = prepareMatchDataForUpload(timeline)
  const game_mode = gameModeForApi(timeline.gameMode ?? undefined)
  return {
    map: timeline.map ?? undefined,
    agent: timeline.agent ?? undefined,
    game_mode: game_mode ?? undefined,
    match_data,
  }
}
