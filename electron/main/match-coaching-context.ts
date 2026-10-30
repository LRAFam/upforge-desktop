/**
 * Extra coaching context attached to uploads, debriefs, and clip analysis.
 */
import type { MatchData, RoundSummary } from './riot-types'
import type { SkillProfileSnapshot } from '../../src/lib/skill-profile'
import type { AppSettings } from './settings-manager'
import { resolveScoreboardPlayer } from '../../src/lib/vod-scoreboard'

export interface RankSnapshot {
  competitiveTier: number
  competitiveTierName: string
  rr: number | null
  elo: number | null
}

export interface CoachingSubmissionExtras {
  skillProfile?: SkillProfileSnapshot | null
  rankSnapshot?: RankSnapshot | null
  gameClientVersion?: string | null
}

export interface TeamComp {
  allyAgents: string[]
  enemyAgents: string[]
}

export function buildTeamComp(timeline: MatchData): TeamComp {
  const ownPuuid = timeline.puuid?.toLowerCase()
  const ownRow = timeline.game === 'lol'
    ? resolveScoreboardPlayer(timeline.teamSnapshot ?? [], 'lol', timeline.puuid, timeline.finalStats?.summonerName ?? null)
    : ownPuuid ? timeline.teamSnapshot?.find((p) => p.puuid?.toLowerCase() === ownPuuid) : null
  const ownTeam = (timeline.finalStats?.team ?? ownRow?.team ?? '').trim().toUpperCase()

  const allyAgents: string[] = []
  const enemyAgents: string[] = []
  if (!ownTeam || ownTeam === 'UNKNOWN') return { allyAgents, enemyAgents }

  for (const p of timeline.teamSnapshot ?? []) {
    if (!p.agent) continue
    const team = p.team?.trim().toUpperCase()
    if (!team || team === 'UNKNOWN') continue
    if (team === ownTeam) allyAgents.push(p.agent)
    else enemyAgents.push(p.agent)
  }

  return { allyAgents, enemyAgents }
}

export function buildRankSnapshot(
  timeline: MatchData,
  rrHistory?: Array<{ rank: string | null; rr: number; elo: number }>,
): RankSnapshot | null {
  // RR history and competitive tiers belong to Valorant, not League's rank system.
  if (timeline.game === 'lol') return null
  const ownPuuid = timeline.puuid?.toLowerCase()
  const own = ownPuuid ? timeline.teamSnapshot?.find((p) => p.puuid?.toLowerCase() === ownPuuid) : null
  // `/api/stats/rr-history` is oldest-first: the newest snapshot is the last entry.
  const latest = rrHistory?.length ? rrHistory[rrHistory.length - 1] : undefined

  if (!own && !latest) return null

  return {
    competitiveTier: own?.competitiveTier ?? 0,
    competitiveTierName: own?.competitiveTierName ?? latest?.rank ?? 'Unranked',
    rr: latest?.rr ?? null,
    elo: latest?.elo ?? null,
  }
}

export function topSkillFocus(settings: Pick<AppSettings, 'skillProfile'>): string | null {
  const profile = settings.skillProfile
  if (!profile?.issueCounts) return null
  let bestTag: string | null = null
  let bestCount = 0
  for (const [tag, count] of Object.entries(profile.issueCounts)) {
    if (count > bestCount) {
      bestCount = count
      bestTag = tag
    }
  }
  return bestTag
}

export function buildCoachingSubmissionExtras(
  timeline: MatchData,
  settings: Pick<AppSettings, 'skillProfile'>,
  rrHistory?: Array<{ rank: string | null; rr: number; elo: number }>,
  gameClientVersion?: string | null,
): CoachingSubmissionExtras {
  return {
    skillProfile: settings.skillProfile ?? null,
    rankSnapshot: buildRankSnapshot(timeline, rrHistory),
    gameClientVersion: gameClientVersion ?? null,
  }
}

/** Slim round slice for clip-level coaching when full match_data is too heavy. */
export function roundSummaryForClip(
  timeline: MatchData | null,
  round: number | null,
): Partial<RoundSummary> | null {
  if (!timeline || round == null) return null
  const rs = timeline.roundSummaries?.find((r) => r.roundNumber === round)
  if (!rs) return null
  return {
    roundNumber: rs.roundNumber,
    winningTeam: rs.winningTeam,
    ceremony: rs.ceremony,
    playerStats: rs.playerStats,
    spikePlanted: rs.spikePlanted,
    spikeSite: rs.spikeSite,
    playerWeapon: rs.playerWeapon,
    playerArmor: rs.playerArmor,
    playerSpent: rs.playerSpent,
    playerLoadoutValue: rs.playerLoadoutValue,
    playerDamageDealt: rs.playerDamageDealt,
    playerGotFirstBlood: rs.playerGotFirstBlood,
    playerWasFirstBlood: rs.playerWasFirstBlood,
    playerAbilities: rs.playerAbilities,
  }
}
