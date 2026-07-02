/**
 * Build a compact round-by-round minimap replay from Riot MatchDetails keyframes.
 * Positions come from kill playerLocations + plant/defuse snapshots (not continuous telemetry).
 */
import type { MatchData } from './riot-types'
import { resolveAgentName, resolveFinishingDamage } from './riot-lookup-tables'
import { worldToNorm } from './spatial/map-transforms'
import { totalRecordingOffsetMs } from './riot-local-api'

export interface ReplayPlayer {
  puuid: string
  name: string
  agent: string | null
  team: string
}

export interface ReplayPlayerPos {
  /** Index into `players` */
  i: number
  x: number
  y: number
  /** View direction in radians (when Riot provides it). */
  v?: number
  alive: boolean
}

export interface ReplayKeyframe {
  /** Ms since match gameplay start */
  t: number
  /** Ms since round start */
  rt: number
  /** VOD seek offset ms */
  v?: number
  k: 'kill' | 'plant' | 'defuse'
  label?: string
  abilitySlot?: string
  p: ReplayPlayerPos[]
  spike?: { x: number; y: number }
}

export interface ReplayRound {
  r: number
  winner?: string | null
  frames: ReplayKeyframe[]
  /** Estimated round duration for scrubber (ms). */
  endMs: number
}

export interface MatchRoundReplay {
  map: string
  players: ReplayPlayer[]
  rounds: ReplayRound[]
  ownPlayerIndex?: number
}

interface RiotLocationRow {
  subject?: string
  location?: { x: number; y: number }
  viewRadians?: number
}

function estimateRoundStarts(
  kills: Array<Record<string, unknown>>,
  roundCount?: number,
): Map<number, number> {
  const map = new Map<number, number>()
  for (const k of kills) {
    const r = (k.round as number) ?? 0
    const gameTime = (k.timeSinceGameStartMillis as number) ?? (k.gameTime as number) ?? 0
    const roundTime = (k.roundTime as number) ?? (k.timeSinceRoundStartMillis as number) ?? -1
    if (gameTime <= 0 || roundTime < 0) continue
    const start = gameTime - roundTime
    const prev = map.get(r)
    if (prev == null || start < prev) map.set(r, start)
  }
  if (map.size === 0) return map

  const knownRounds = [...map.keys()].sort((a, b) => a - b)
  const maxRound = roundCount != null && roundCount > 0
    ? roundCount - 1
    : knownRounds[knownRounds.length - 1]!

  const durations: number[] = []
  for (let i = 1; i < knownRounds.length; i++) {
    const prevRound = knownRounds[i - 1]!
    const currRound = knownRounds[i]!
    const duration = map.get(currRound)! - map.get(prevRound)!
    if (duration >= 30_000 && duration <= 180_000) durations.push(duration)
  }
  const avgRoundMs = durations.length > 0
    ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
    : 100_000

  for (let round = 0; round <= maxRound; round++) {
    if (map.has(round)) continue
    let lowerRound = -1
    for (const known of knownRounds) {
      if (known < round) lowerRound = known
      else break
    }
    if (lowerRound >= 0) {
      map.set(round, map.get(lowerRound)! + (round - lowerRound) * avgRoundMs)
      continue
    }
    const firstRound = knownRounds[0]!
    map.set(round, Math.max(0, map.get(firstRound)! - (firstRound - round) * avgRoundMs))
  }

  return map
}

function buildPlayerRoster(
  match: MatchData,
  playersRaw: Array<Record<string, unknown>> | undefined,
  puuidToName: Map<string, string>,
): ReplayPlayer[] {
  const seen = new Map<string, ReplayPlayer>()

  const add = (
    puuid: string,
    name: string,
    agent: string | null,
    team: string,
  ) => {
    const key = puuid.toLowerCase()
    if (seen.has(key)) return
    seen.set(key, { puuid, name, agent, team })
  }

  for (const row of match.teamSnapshot ?? []) {
    const puuid = row.puuid
    if (!puuid) continue
    add(
      puuid,
      row.summonerName || puuidToName.get(puuid) || row.agent || 'Player',
      row.agent,
      row.team,
    )
  }

  for (const p of playersRaw ?? []) {
    const sub = p.subject as string | undefined
    if (!sub) continue
    const agent = resolveAgentName(p.characterId as string)
    const gameName = (p.gameName as string) || null
    add(
      sub,
      gameName ?? puuidToName.get(sub) ?? agent ?? 'Player',
      agent,
      (p.teamId as string) ?? 'Unknown',
    )
  }

  return [...seen.values()]
}

function positionsFromLocations(
  mapName: string,
  rows: RiotLocationRow[] | null | undefined,
  playerIndex: Map<string, number>,
  dead: Set<number>,
): ReplayPlayerPos[] {
  const out: ReplayPlayerPos[] = []
  for (const row of rows ?? []) {
    const sub = row.subject?.toLowerCase()
    const loc = row.location
    if (!sub || !loc || typeof loc.x !== 'number' || typeof loc.y !== 'number') continue
    const idx = playerIndex.get(sub)
    if (idx == null) continue
    const norm = worldToNorm(mapName, loc.x, loc.y)
    if (!norm) continue
    out.push({
      i: idx,
      x: Math.round(norm.x * 1000) / 1000,
      y: Math.round(norm.y * 1000) / 1000,
      v: typeof row.viewRadians === 'number' ? row.viewRadians : undefined,
      alive: !dead.has(idx),
    })
  }
  return out
}

/** Build uploadable round replay from in-memory matchDetails. */
export function buildMatchRoundReplay(match: MatchData): MatchRoundReplay | null {
  const mapName = match.map
  const raw = match.matchDetails as Record<string, unknown> | null | undefined
  const allKills = raw?.kills as Array<Record<string, unknown>> | undefined
  const roundResults = raw?.roundResults as Array<Record<string, unknown>> | undefined
  if (!mapName || !allKills?.length) return null

  const playersRaw = raw?.players as Array<Record<string, unknown>> | undefined
  const puuidToName = new Map<string, string>()
  for (const p of playersRaw ?? []) {
    const sub = p.subject as string | undefined
    if (!sub) continue
    const agent = resolveAgentName(p.characterId as string)
    const gameName = (p.gameName as string) || null
    if (gameName) puuidToName.set(sub, gameName)
    else if (agent) puuidToName.set(sub, agent)
  }

  const players = buildPlayerRoster(match, playersRaw, puuidToName)
  if (!players.length) return null

  const playerIndex = new Map<string, number>()
  players.forEach((p, i) => playerIndex.set(p.puuid.toLowerCase(), i))

  const ownIdx = match.puuid
    ? playerIndex.get(match.puuid.toLowerCase())
    : undefined

  const recordingOffset = totalRecordingOffsetMs(match)
  const roundStarts = estimateRoundStarts(allKills, roundResults?.length)

  const roundsMap = new Map<number, ReplayKeyframe[]>()
  const deadByRound = new Map<number, Set<number>>()

  const getDead = (round: number) => {
    let set = deadByRound.get(round)
    if (!set) {
      set = new Set<number>()
      deadByRound.set(round, set)
    }
    return set
  }

  const sortedKills = [...allKills].sort((a, b) => {
    const ta = (a.timeSinceGameStartMillis as number) ?? (a.gameTime as number) ?? 0
    const tb = (b.timeSinceGameStartMillis as number) ?? (b.gameTime as number) ?? 0
    return ta - tb
  })

  for (const k of sortedKills) {
    const round = (k.round as number) ?? 0
    const gameTime = (k.timeSinceGameStartMillis as number) ?? (k.gameTime as number) ?? 0
    const roundTime = (k.roundTime as number) ?? 0
    const roundStart = roundStarts.get(round) ?? 0
    const rt = roundTime > 0 ? roundTime : Math.max(0, gameTime - roundStart)
    const victimPuuid = (k.victim as string)?.toLowerCase()
    const killerPuuid = (k.killer as string)?.toLowerCase()
    const dead = getDead(round)

    const positions = positionsFromLocations(
      mapName,
      k.playerLocations as RiotLocationRow[] | undefined,
      playerIndex,
      dead,
    )
    if (!positions.length) continue

    const finishing = resolveFinishingDamage(
      (k.finishingDamage as Record<string, unknown>)?.damageType as string | undefined,
      (k.finishingDamage as Record<string, unknown>)?.damageItem as string | undefined,
    )

    const killerIdx = killerPuuid ? playerIndex.get(killerPuuid) : undefined
    const victimIdx = victimPuuid ? playerIndex.get(victimPuuid) : undefined
    const killerName = killerIdx != null ? players[killerIdx]?.name : 'Enemy'
    const victimName = victimIdx != null ? players[victimIdx]?.name : 'Player'
    const label = finishing.weapon
      ? `${killerName} → ${victimName} (${finishing.weapon})`
      : `${killerName} → ${victimName}`

    const frames = roundsMap.get(round) ?? []
    frames.push({
      t: gameTime,
      rt,
      v: Math.max(0, recordingOffset + gameTime),
      k: 'kill',
      label,
      abilitySlot: finishing.abilitySlot,
      p: positions,
    })
    roundsMap.set(round, frames)

    if (victimIdx != null) dead.add(victimIdx)
  }

  for (const round of roundResults ?? []) {
    const roundNum = (round.roundNum as number) ?? 0
    const roundStart = roundStarts.get(roundNum) ?? 0
    const dead = getDead(roundNum)
    const frames = roundsMap.get(roundNum) ?? []

    const plantLocal = (round.plantRoundTime as number) ?? (round.plantRoundMsec as number) ?? 0
    const plantLocs = round.plantPlayerLocations as RiotLocationRow[] | undefined
    const plantLoc = round.plantLocation as { x?: number; y?: number } | undefined
    if (plantLocal > 0 && (plantLocs?.length || plantLoc)) {
      const gameTime = roundStart + plantLocal
      const positions = positionsFromLocations(mapName, plantLocs, playerIndex, dead)
      const spikeNorm = plantLoc?.x != null && plantLoc?.y != null
        ? worldToNorm(mapName, plantLoc.x, plantLoc.y)
        : null
      frames.push({
        t: gameTime,
        rt: plantLocal,
        v: Math.max(0, recordingOffset + gameTime),
        k: 'plant',
        label: `Spike planted ${(round.plantSite as string) || ''}`.trim(),
        p: positions,
        spike: spikeNorm
          ? { x: Math.round(spikeNorm.x * 1000) / 1000, y: Math.round(spikeNorm.y * 1000) / 1000 }
          : undefined,
      })
    }

    const defuseLocal = (round.defuseRoundTime as number) ?? (round.defuseRoundMsec as number) ?? 0
    const defuseLocs = round.defusePlayerLocations as RiotLocationRow[] | undefined
    const defuseLoc = round.defuseLocation as { x?: number; y?: number } | undefined
    if (defuseLocal > 0 && (defuseLocs?.length || defuseLoc)) {
      const gameTime = roundStart + defuseLocal
      const positions = positionsFromLocations(mapName, defuseLocs, playerIndex, dead)
      const spikeNorm = defuseLoc?.x != null && defuseLoc?.y != null
        ? worldToNorm(mapName, defuseLoc.x, defuseLoc.y)
        : undefined
      frames.push({
        t: gameTime,
        rt: defuseLocal,
        v: Math.max(0, recordingOffset + gameTime),
        k: 'defuse',
        label: 'Spike defused',
        p: positions,
        spike: spikeNorm
          ? { x: Math.round(spikeNorm.x * 1000) / 1000, y: Math.round(spikeNorm.y * 1000) / 1000 }
          : undefined,
      })
    }

    if (frames.length) {
      frames.sort((a, b) => a.rt - b.rt)
      roundsMap.set(roundNum, frames)
    }
  }

  const rounds: ReplayRound[] = []
  for (const [roundNum, frames] of [...roundsMap.entries()].sort((a, b) => a[0] - b[0])) {
    const roundMeta = roundResults?.find((r) => (r.roundNum as number) === roundNum)
    const endFromRiot = Math.max(
      (roundMeta?.defuseRoundTime as number) ?? 0,
      (roundMeta?.defuseRoundMsec as number) ?? 0,
      (roundMeta?.plantRoundTime as number) ?? 0,
      (roundMeta?.plantRoundMsec as number) ?? 0,
    )
    const lastRt = frames[frames.length - 1]?.rt ?? 0
    const endMs = Math.max(endFromRiot, lastRt) + 5_000

    rounds.push({
      r: roundNum,
      winner: (roundMeta?.winningTeam as string) ?? null,
      frames,
      endMs,
    })
  }

  if (!rounds.length) return null

  return {
    map: mapName,
    players,
    rounds,
    ownPlayerIndex: ownIdx,
  }
}
