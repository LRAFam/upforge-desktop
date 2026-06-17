/**
 * Shapes MatchData for API upload / analysis — drops redundant blobs and
 * fills fields the backend and AI service expect.
 */
import type { MatchData, RoundPlantSnapshot } from './riot-types'
import { recomputeTimelineVideoOffsets, effectiveVideoSyncOffsetMs } from './riot-local-api'
import { deriveMatchScore } from './match-score'
import { riotStatsToAcs } from './combat-score'
import { logPlantCoordStats } from './match-plant-telemetry'
import { resolvePlantLocationFromRound } from './plant-location'
import { buildCoachingFacts, type CoachingFacts } from './coaching-facts'
import {
  buildTeamComp,
  type CoachingSubmissionExtras,
  type RankSnapshot,
} from './match-coaching-context'
import type { SkillProfileSnapshot } from '../../src/lib/skill-profile'

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
      abilityCasts?: {
        grenadeCasts?: number
        ability1Casts?: number
        ability2Casts?: number
        ultimateCasts?: number
      }
    }
    roundDamage?: Array<{
      round: number
      receiver: string
      damage: number
    }>
  }>
}

export type UploadMatchData = Omit<MatchData, 'events' | 'matchDetails'> & {
  /** Legacy duplicate of killEvents — omitted on upload. */
  events?: never
  matchDetails?: never
  matchDetailsLite?: MatchDetailsLite | null
  roundPlants?: RoundPlantSnapshot[]
  /** Authoritative facts for AI coaching (ability casts, per-round damage, ability kills). */
  coachingFacts?: CoachingFacts
  /** Explicit team comps for KB routing and comp-aware coaching. */
  allyAgents?: string[]
  enemyAgents?: string[]
  /** Rolling weakness profile from prior analyses (desktop-local, sent for continuity). */
  skillProfile?: SkillProfileSnapshot | null
  /** Player rank snapshot at upload time. */
  rankSnapshot?: RankSnapshot | null
  /** Valorant client build when captured. */
  gameClientVersion?: string | null
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
      const stats = p.stats as Record<string, unknown> | undefined
      const abilityCasts = stats?.abilityCasts as Record<string, number> | undefined
      const roundDamageRaw = p.roundDamage as Array<Record<string, unknown>> | undefined
      const roundDamage = roundDamageRaw?.map((row) => ({
        round: (row.round as number) ?? 0,
        receiver: (row.receiver as string) ?? '',
        damage: (row.damage as number) ?? 0,
      }))

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
              kills: stats.kills as number | undefined,
              deaths: stats.deaths as number | undefined,
              assists: stats.assists as number | undefined,
              score: riotStatsToAcs(stats as Record<string, number>, (stats.roundsPlayed as number) || 1),
              abilityCasts: abilityCasts
                ? {
                    grenadeCasts: abilityCasts.grenadeCasts,
                    ability1Casts: abilityCasts.ability1Casts,
                    ability2Casts: abilityCasts.ability2Casts,
                    ultimateCasts: abilityCasts.ultimateCasts,
                  }
                : undefined,
            }
          : undefined,
        roundDamage: roundDamage?.length ? roundDamage : undefined,
      }
    }),
  }
}

function buildRoundPlants(timeline: MatchData): RoundPlantSnapshot[] {
  const byRound = new Map<number, RoundPlantSnapshot>()

  for (const plant of timeline.spikePlants ?? []) {
    const round = plant.round ?? 0
    byRound.set(round, {
      round,
      site: plant.site ?? null,
      plantLocation: plant.plantLocation,
      planterPuuid: plant.planterPuuid,
    })
  }

  const roundResults = timeline.matchDetails?.roundResults as Array<Record<string, unknown>> | undefined
  if (roundResults?.length) {
    for (const round of roundResults) {
      const roundNum = (round.roundNum as number) ?? 0
      const existing = byRound.get(roundNum)
      if (existing?.plantLocation) continue
      const bombPlanter = (round.bombPlanter as string) ?? null
      const plantLocation = resolvePlantLocationFromRound(round, bombPlanter)
      if (!plantLocation && !bombPlanter) continue
      byRound.set(roundNum, {
        round: roundNum,
        site: (round.plantSite as string) ?? existing?.site ?? null,
        plantLocation: plantLocation ?? existing?.plantLocation,
        planterPuuid: bombPlanter ?? existing?.planterPuuid,
      })
    }
  }

  return [...byRound.values()].sort((a, b) => a.round - b.round)
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
export function prepareMatchDataForUpload(
  timeline: MatchData | null,
  extras?: CoachingSubmissionExtras,
): UploadMatchData | undefined {
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

  const roundPlants = buildRoundPlants(timeline)
  timeline.roundPlants = roundPlants
  const { allyAgents, enemyAgents } = buildTeamComp(timeline)

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
    videoSyncOffsetMs: effectiveVideoSyncOffsetMs(timeline),
    roundScores: timeline.roundScores,
    finalScore: timeline.finalScore ?? deriveMatchScore(timeline) ?? null,
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
    roundPlants,
    coachingFacts: buildCoachingFacts(timeline),
    allyAgents: allyAgents.length ? allyAgents : undefined,
    enemyAgents: enemyAgents.length ? enemyAgents : undefined,
    skillProfile: extras?.skillProfile ?? undefined,
    rankSnapshot: extras?.rankSnapshot ?? undefined,
    gameClientVersion: extras?.gameClientVersion ?? undefined,
    startTime: timeline.startTime,
    endTime: timeline.endTime,
  }

  logPlantCoordStats(timeline, 'upload')
  return upload
}

/** Top-level job fields derived from timeline (avoids null game_mode on params). */
export function submissionContextFromTimeline(
  timeline: MatchData | null,
  extras?: CoachingSubmissionExtras,
): {
  map?: string
  agent?: string
  game_mode?: string
  match_data?: UploadMatchData
  ally_agents?: string[]
  enemy_agents?: string[]
  skill_profile?: SkillProfileSnapshot | null
  rank_snapshot?: RankSnapshot | null
} {
  if (!timeline) return {}
  const match_data = prepareMatchDataForUpload(timeline, extras)
  const { allyAgents, enemyAgents } = buildTeamComp(timeline)
  const game_mode = gameModeForApi(timeline.gameMode ?? undefined)
  return {
    map: timeline.map ?? undefined,
    agent: timeline.agent ?? undefined,
    game_mode: game_mode ?? undefined,
    match_data,
    ally_agents: allyAgents.length ? allyAgents : undefined,
    enemy_agents: enemyAgents.length ? enemyAgents : undefined,
    skill_profile: extras?.skillProfile ?? undefined,
    rank_snapshot: extras?.rankSnapshot ?? undefined,
  }
}
