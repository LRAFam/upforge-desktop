/**
 * Derived ground-truth facts for AI coaching — prevents video-only hallucinations
 * (e.g. claiming an ult was used when Riot reports ultimateCasts=0).
 */
import type { KillEvent, MatchData } from './riot-types'

export interface MatchAbilityCastTotals {
  grenade: number
  ability1: number
  ability2: number
  ultimate: number
}

export interface CoachingAbilityKillEvent {
  round: number
  videoOffsetMs: number | null
  weapon: string | null
  abilitySlot: string | null
  victimName: string
}

export interface CoachingRoundFact {
  round: number
  damageDealt: number | null
  playerKills: number
  playerDeaths: number
  abilityKills: string[]
}

export interface CoachingFacts {
  matchAbilityCasts: MatchAbilityCastTotals | null
  abilityKillEvents: CoachingAbilityKillEvent[]
  perRound: CoachingRoundFact[]
}

function ownAbilityCasts(timeline: MatchData): MatchAbilityCastTotals | null {
  const puuid = timeline.puuid?.toLowerCase()
  if (puuid && timeline.teamSnapshot?.length) {
    const row = timeline.teamSnapshot.find((p) => p.puuid?.toLowerCase() === puuid)
    if (row?.abilityCasts) return { ...row.abilityCasts }
  }

  const players = timeline.matchDetails?.players as Array<Record<string, unknown>> | undefined
  const own = players?.find((p) => (p.subject as string)?.toLowerCase() === puuid)
  const casts = own?.stats as Record<string, unknown> | undefined
  const ac = casts?.abilityCasts as Record<string, number> | undefined
  if (!ac) return null

  return {
    grenade: ac.grenadeCasts ?? 0,
    ability1: ac.ability1Casts ?? 0,
    ability2: ac.ability2Casts ?? 0,
    ultimate: ac.ultimateCasts ?? 0,
  }
}

function isOwnKill(k: KillEvent, timeline: MatchData): boolean {
  const puuid = timeline.puuid?.toLowerCase()
  if (puuid && k.killerPuuid?.toLowerCase() === puuid) return true
  const name = timeline.playerName?.toLowerCase()
  return !!name && k.killerName.toLowerCase() === name
}

/** Build authoritative coaching facts from enriched MatchData. */
export function buildCoachingFacts(timeline: MatchData): CoachingFacts {
  const matchAbilityCasts = ownAbilityCasts(timeline)

  const abilityKillEvents: CoachingAbilityKillEvent[] = []
  for (const k of timeline.killEvents ?? []) {
    if (!isOwnKill(k, timeline)) continue
    if (!k.abilitySlot && k.weapon !== 'Ultimate' && k.weapon !== 'Ability') continue
    abilityKillEvents.push({
      round: k.round ?? 0,
      videoOffsetMs: k.videoOffsetMs ?? null,
      weapon: k.weapon ?? null,
      abilitySlot: k.abilitySlot ?? null,
      victimName: k.victimName,
    })
  }

  const perRound: CoachingRoundFact[] = (timeline.roundSummaries ?? []).map((rs) => {
    const round = rs.roundNumber
    const abilityKills = abilityKillEvents
      .filter((e) => e.round === round)
      .map((e) => e.abilitySlot ?? e.weapon ?? 'ability')
      .filter(Boolean) as string[]

    return {
      round,
      damageDealt: rs.playerDamageDealt ?? null,
      playerKills: rs.playerStats?.kills ?? 0,
      playerDeaths: rs.playerStats?.deaths ?? 0,
      abilityKills,
    }
  })

  return { matchAbilityCasts, abilityKillEvents, perRound }
}
