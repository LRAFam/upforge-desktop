import type { MatchData } from './riot-types'

interface DemoRoundKill {
  round: number
  attackerUserId: number
  victimUserId: number
  attackerTeam: number
  victimTeam: number
}

interface DemoMatchDetails {
  roundKills?: DemoRoundKill[]
  roundWinners?: Map<number, number>
  localUserId?: number
  localTeam?: number
}

/**
 * Detect clutch rounds for Valorant (Riot match details).
 * Returns the set of round numbers (0-indexed) where a clutch occurred.
 */
export function detectClutchRounds(timeline: MatchData): Set<number> {
  const clutchRounds = new Set<number>()
  if (!timeline.matchDetails || !timeline.puuid) return clutchRounds

  const details = timeline.matchDetails
  const players = details.players as Array<Record<string, unknown>> | undefined
  const roundResults = details.roundResults as Array<Record<string, unknown>> | undefined
  const allKills = details.kills as Array<Record<string, unknown>> | undefined

  if (!players || !roundResults || !allKills) return clutchRounds

  const ownPuuid = timeline.puuid
  const teamMap = new Map<string, string>()
  for (const p of players) {
    if (p.subject && p.teamId) teamMap.set(p.subject as string, p.teamId as string)
  }
  const ownTeam = teamMap.get(ownPuuid)
  if (!ownTeam) return clutchRounds

  const allyPuuids = new Set(
    [...teamMap.entries()].filter(([p, t]) => t === ownTeam && p !== ownPuuid).map(([p]) => p),
  )
  const enemyPuuids = new Set(
    [...teamMap.entries()].filter(([, t]) => t !== ownTeam).map(([p]) => p),
  )

  const allKillsByRound = new Map<number, Array<Record<string, unknown>>>()
  for (const kill of allKills) {
    const r = (kill.round as number) ?? 0
    if (!allKillsByRound.has(r)) allKillsByRound.set(r, [])
    allKillsByRound.get(r)!.push(kill)
  }

  for (const [roundNum, kills] of allKillsByRound.entries()) {
    const sorted = [...kills].sort((a, b) =>
      ((a.timeSinceGameStartMillis as number) ?? 0) - ((b.timeSinceGameStartMillis as number) ?? 0),
    )

    const liveAllies = new Set(allyPuuids)
    const liveEnemies = new Set(enemyPuuids)
    let playerAlive = true
    let clutchDetected = false

    for (const kill of sorted) {
      const victim = kill.victim as string
      if (victim === ownPuuid) { playerAlive = false; break }
      if (liveAllies.has(victim)) liveAllies.delete(victim)
      if (liveEnemies.has(victim)) liveEnemies.delete(victim)

      if (!clutchDetected && liveAllies.size === 0 && liveEnemies.size >= 1) {
        clutchDetected = true
      }
    }

    if (!clutchDetected || !playerAlive) continue

    const clutchKills = timeline.playerKills.filter((k) => (k.round ?? -1) === roundNum)
    if (clutchKills.length === 0) continue

    const roundResult = roundResults[roundNum] as Record<string, unknown> | undefined
    if ((roundResult?.winningTeam as string) === ownTeam) {
      clutchRounds.add(roundNum)
    }
  }

  return clutchRounds
}

/**
 * Detect clutch rounds for Source-engine demos (CS2 / Deadlock).
 */
export function detectClutchRoundsFromDemo(timeline: MatchData): Set<number> {
  const clutchRounds = new Set<number>()
  const details = timeline.matchDetails as DemoMatchDetails | null

  if (!details?.roundKills?.length || details.localUserId == null || details.localTeam == null) {
    return clutchRounds
  }

  const localUserId = details.localUserId
  const localTeam = details.localTeam
  const roundWinners = details.roundWinners ?? new Map<number, number>()

  const byRound = new Map<number, DemoRoundKill[]>()
  for (const kill of details.roundKills) {
    if (!byRound.has(kill.round)) byRound.set(kill.round, [])
    byRound.get(kill.round)!.push(kill)
  }

  for (const [round, kills] of byRound.entries()) {
    const winnerTeam = roundWinners.get(round + 1)
    if (winnerTeam !== localTeam) continue

    const allyIds = new Set<number>([localUserId])
    const enemyIds = new Set<number>()
    for (const k of kills) {
      if (k.attackerTeam === localTeam) allyIds.add(k.attackerUserId)
      if (k.victimTeam === localTeam) allyIds.add(k.victimUserId)
      if (k.attackerTeam !== localTeam) enemyIds.add(k.attackerUserId)
      if (k.victimTeam !== localTeam) enemyIds.add(k.victimUserId)
    }

    const liveAllies = new Set(allyIds)
    const liveEnemies = new Set(enemyIds)
    let clutchDetected = false
    let playerAlive = true

    for (const k of kills) {
      if (k.victimUserId === localUserId) playerAlive = false
      if (k.victimTeam === localTeam) liveAllies.delete(k.victimUserId)
      if (k.victimTeam !== localTeam) liveEnemies.delete(k.victimUserId)

      if (
        playerAlive
        && liveAllies.size === 1
        && liveAllies.has(localUserId)
        && liveEnemies.size >= 1
      ) {
        clutchDetected = true
      }
    }

    const gotKill = timeline.playerKills.some((k) => (k.round ?? -1) === round)
    if (clutchDetected && playerAlive && gotKill) {
      clutchRounds.add(round)
    }
  }

  return clutchRounds
}

/** Game-aware clutch detection. */
export function detectClutchRoundsForGame(timeline: MatchData): Set<number> {
  if (timeline.game === 'valorant') return detectClutchRounds(timeline)
  if (timeline.game === 'cs2' || timeline.game === 'deadlock') {
    return detectClutchRoundsFromDemo(timeline)
  }
  return new Set()
}
