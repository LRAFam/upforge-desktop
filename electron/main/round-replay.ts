/**
 * Build a compact round-by-round minimap replay from Riot MatchDetails keyframes.
 * Positions come from kill playerLocations + plant/defuse snapshots (not continuous telemetry).
 */
import type { MatchData } from './riot-types'
import { resolveAgentName, resolveFinishingDamage } from './riot-lookup-tables'
import { worldToNorm } from './spatial/map-transforms'
import { totalRecordingOffsetMs } from './riot-local-api'
import { observedRoundStarts, riotGameTime, riotRoundTime } from './riot-event-time'

export interface ReplayPlayer {
  puuid: string
  name: string
  agent: string | null
  team: string
  nameSource: 'match_record' | 'local_identity' | 'agent_label'
}

export interface ReplayPlayerPos {
  /** Index into `players` */
  i: number
  x: number
  y: number
  world: { x: number; y: number }
  /** View direction in radians (when Riot provides it). */
  v?: number
  /** State immediately after this event. Null means the source cannot establish it. */
  alive: boolean | null
  aliveSource: 'event_actor' | 'event_victim' | 'unknown'
}

export interface ReplayKeyframe {
  /** Ms since match gameplay start */
  t: number | null
  /** Ms since round start */
  rt: number
  /** VOD seek offset ms */
  v?: number
  k: 'kill' | 'plant' | 'defuse'
  label?: string
  abilitySlot?: string
  p: ReplayPlayerPos[]
  actorIndex?: number
  victimIndex?: number
  spike?: { x: number; y: number }
}

export interface ReplayRound {
  r: number
  winner?: string | null
  frames: ReplayKeyframe[]
  /** Reported objective-ending timestamp, or null. Never a guessed duration. */
  endMs: number | null
}

export interface MatchRoundReplay {
  schemaVersion: 2
  positionSource: 'riot_event_snapshots'
  stateSemantics: 'after_event; null alive means unknown; no inferred respawns or resurrections'
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
    const raw = playersRaw?.find((p) => (p.subject as string)?.toLowerCase() === key)
    const nameSource = (raw?.gameName as string)?.trim() ? 'match_record'
      : key === match.puuid?.toLowerCase() ? 'local_identity' : 'agent_label'
    seen.set(key, { puuid, name, agent, team, nameSource })
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
  evidence: Map<number, { alive: boolean; source: 'event_actor' | 'event_victim' }>,
): ReplayPlayerPos[] {
  const out: ReplayPlayerPos[] = []
  for (const row of rows ?? []) {
    const sub = row.subject?.toLowerCase()
    const loc = row.location
    if (!sub || !loc || !Number.isFinite(loc.x) || !Number.isFinite(loc.y)) continue
    const idx = playerIndex.get(sub)
    if (idx == null) continue
    const norm = worldToNorm(mapName, loc.x, loc.y)
    if (!norm) continue
    out.push({
      i: idx,
      x: Math.round(norm.x * 1000) / 1000,
      y: Math.round(norm.y * 1000) / 1000,
      world: { x: loc.x, y: loc.y },
      v: typeof row.viewRadians === 'number' ? row.viewRadians : undefined,
      alive: evidence.get(idx)?.alive ?? null,
      aliveSource: evidence.get(idx)?.source ?? 'unknown',
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
  const roundStarts = observedRoundStarts(allKills)

  const roundsMap = new Map<number, ReplayKeyframe[]>()
  const sortedKills = [...allKills].sort((a, b) => {
    const ta = riotGameTime(a) ?? 0
    const tb = riotGameTime(b) ?? 0
    return ta - tb
  })

  for (const k of sortedKills) {
    const round = (k.round as number) ?? 0
    const gameTime = riotGameTime(k)
    const roundStart = roundStarts.get(round)
    const rt = riotRoundTime(k) ?? (gameTime != null && roundStart != null ? gameTime - roundStart : null)
    if (rt == null) continue
    const victimPuuid = (k.victim as string)?.toLowerCase()
    const killerPuuid = (k.killer as string)?.toLowerCase()
    const killerIdx = killerPuuid ? playerIndex.get(killerPuuid) : undefined
    const victimIdx = victimPuuid ? playerIndex.get(victimPuuid) : undefined
    const evidence = new Map<number, { alive: boolean; source: 'event_actor' | 'event_victim' }>()
    // Ability kills can happen after death. Other players' life states are not reported.
    const damageType = (k.finishingDamage as Record<string, unknown>)?.damageType
    if (killerIdx != null && damageType === 'Weapon') evidence.set(killerIdx, { alive: true, source: 'event_actor' })
    if (victimIdx != null) evidence.set(victimIdx, { alive: false, source: 'event_victim' })
    const locations = [...((k.playerLocations as RiotLocationRow[] | undefined) ?? [])]
    if (victimPuuid && k.victimLocation && !locations.some(p => p.subject?.toLowerCase() === victimPuuid)) {
      locations.push({ subject: victimPuuid, location: k.victimLocation as { x: number; y: number } })
    }

    const positions = positionsFromLocations(
      mapName,
      locations,
      playerIndex,
      evidence,
    )
    if (!positions.length) continue

    const finishing = resolveFinishingDamage(
      (k.finishingDamage as Record<string, unknown>)?.damageType as string | undefined,
      (k.finishingDamage as Record<string, unknown>)?.damageItem as string | undefined,
    )

    const killerName = killerIdx != null ? players[killerIdx]?.name : 'Enemy'
    const victimName = victimIdx != null ? players[victimIdx]?.name : 'Player'
    const label = finishing.weapon
      ? `${killerName} → ${victimName} (${finishing.weapon})`
      : `${killerName} → ${victimName}`

    const frames = roundsMap.get(round) ?? []
    frames.push({
      t: gameTime,
      rt,
      v: gameTime != null ? Math.max(0, recordingOffset + gameTime) : undefined,
      k: 'kill',
      label,
      abilitySlot: finishing.abilitySlot ?? undefined,
      p: positions,
      actorIndex: killerIdx,
      victimIndex: victimIdx,
    })
    roundsMap.set(round, frames)

  }

  for (const round of roundResults ?? []) {
    const roundNum = (round.roundNum as number) ?? 0
    const roundStart = roundStarts.get(roundNum)
    const frames = roundsMap.get(roundNum) ?? []

    const plantLocal = (round.plantRoundTime as number) ?? (round.plantRoundMsec as number) ?? 0
    const plantLocs = round.plantPlayerLocations as RiotLocationRow[] | undefined
    const plantLoc = round.plantLocation as { x?: number; y?: number } | undefined
    if (round.bombPlanter && plantLocal > 0 && (plantLocs?.length || plantLoc)) {
      const gameTime = roundStart != null ? roundStart + plantLocal : null
      const actorIndex = playerIndex.get((round.bombPlanter as string).toLowerCase())
      const evidence = new Map<number, { alive: boolean; source: 'event_actor' | 'event_victim' }>()
      if (actorIndex != null) evidence.set(actorIndex, { alive: true, source: 'event_actor' })
      const positions = positionsFromLocations(mapName, plantLocs, playerIndex, evidence)
      const spikeNorm = plantLoc?.x != null && plantLoc?.y != null
        ? worldToNorm(mapName, plantLoc.x, plantLoc.y)
        : null
      frames.push({
        t: gameTime,
        rt: plantLocal,
        v: gameTime != null ? Math.max(0, recordingOffset + gameTime) : undefined,
        k: 'plant',
        label: `Spike planted ${(round.plantSite as string) || ''}`.trim(),
        p: positions,
        actorIndex,
        spike: spikeNorm
          ? { x: Math.round(spikeNorm.x * 1000) / 1000, y: Math.round(spikeNorm.y * 1000) / 1000 }
          : undefined,
      })
    }

    const defuseLocal = (round.defuseRoundTime as number) ?? (round.defuseRoundMsec as number) ?? 0
    const defuseLocs = round.defusePlayerLocations as RiotLocationRow[] | undefined
    const defuseLoc = round.defuseLocation as { x?: number; y?: number } | undefined
    if (round.bombDefuser && defuseLocal > 0 && (defuseLocs?.length || defuseLoc)) {
      const gameTime = roundStart != null ? roundStart + defuseLocal : null
      const actorIndex = playerIndex.get((round.bombDefuser as string).toLowerCase())
      const evidence = new Map<number, { alive: boolean; source: 'event_actor' | 'event_victim' }>()
      if (actorIndex != null) evidence.set(actorIndex, { alive: true, source: 'event_actor' })
      const positions = positionsFromLocations(mapName, defuseLocs, playerIndex, evidence)
      const spikeNorm = defuseLoc?.x != null && defuseLoc?.y != null
        ? worldToNorm(mapName, defuseLoc.x, defuseLoc.y)
        : undefined
      frames.push({
        t: gameTime,
        rt: defuseLocal,
        v: gameTime != null ? Math.max(0, recordingOffset + gameTime) : undefined,
        k: 'defuse',
        label: 'Spike defused',
        p: positions,
        actorIndex,
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
    const endReported = roundMeta?.bombDefuser
      ? (roundMeta.defuseRoundTime ?? roundMeta.defuseRoundMsec)
      : (roundMeta?.detonateRoundTime ?? roundMeta?.detonateRoundMsec)
    const endMs = typeof endReported === 'number' && Number.isFinite(endReported) && endReported > 0 ? endReported : null

    rounds.push({
      r: roundNum,
      winner: (roundMeta?.winningTeam as string) ?? null,
      frames,
      endMs,
    })
  }

  if (!rounds.length) return null

  return {
    schemaVersion: 2,
    positionSource: 'riot_event_snapshots',
    stateSemantics: 'after_event; null alive means unknown; no inferred respawns or resurrections',
    map: mapName,
    players,
    rounds,
    ownPlayerIndex: ownIdx,
  }
}
