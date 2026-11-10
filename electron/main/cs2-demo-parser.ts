/**
 * CS2 demo parsing via @laihoe/demoparser2 (LaihoE/demoparser).
 * demofile is CS:GO-only and does not decode CS2 game events reliably.
 */
import fs from 'fs'
import { hasSource2DemoPreamble } from './source2-demo-preamble'
import { calculateCs2MatchStats, readCs2StatsInput } from './cs2-match-stats'
import { buildCs2RoundFacts, flashHitsFromSamples, humanizeCs2Place, type Cs2FlashHit, type Cs2RoundFactsResult } from './cs2-round-facts'
import log from 'electron-log'
import { parseHeader } from '@laihoe/demoparser2'
import {
  CS2_DEATH_TICK_PROPS,
  CS2_FLASH_TICK_PROPS,
  CS2_STATS_EVENT_FIELDS,
  CS2_TIMELINE_DEATH_FIELDS,
  cs2DeathTicks,
  cs2FlashSampleTicks,
  nativeCs2DemoSource,
  type Cs2DemoSource,
} from './cs2-demo-source'
import type { DemoTimelineOptions } from './demo-timeline'
import { inferLocalPlayerFromDemoKills, type RoundKillMeta } from './demo-local-player'
import { estimateCs2DemoVideoShift } from './cs2-demo-video-sync'
import { cs2AlignedGameTimeMs, emptyMatchData, gameTimeToVideoOffsetMs, tickToMsFromTick } from './recording-sync'
import { cs2WorldToNorm, getCs2MapTransform, normalizeCs2MapKey } from './spatial/cs2-transforms'
import { applyDemoSpatialEnrichment, resolveCs2Callout } from './spatial/demo-enrich'
import { sanitizeDemoClientName, sanitizeDemoMapName } from './demo-text-sanitize'
import { getKnownCs2SteamId, rememberParsedCs2SteamId, type Cs2LocalMatch } from './cs2-identity-state'
import type { FirstBloodEvent, KillEvent, MatchData, RoundSummary, SpikeDefusedEvent, SpikeDetonatedEvent, SpikePlantedEvent } from './riot-types'
import type { DemoHeaderPeek } from './demo-header-peek'
import { validCapturedCs2SteamId } from './cs2-upload-identity'

const DEFAULT_TICK_RATE = 64

type JsonRow = Record<string, unknown>

function rowString(row: JsonRow, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function rowNumber(row: JsonRow, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function rowBool(row: JsonRow, ...keys: string[]): boolean {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'boolean') return value
  }
  return false
}

function asRows(value: unknown): JsonRow[] {
  return Array.isArray(value) ? value as JsonRow[] : []
}

function resolveTickRate(header: JsonRow): number {
  const ticks = rowNumber(header, 'playback_ticks', 'playbackTicks')
  const seconds = rowNumber(header, 'playback_time', 'playbackTime')
  if (ticks != null && seconds != null && seconds > 0) {
    const rate = ticks / seconds
    if (rate >= 32 && rate <= 256) return rate
  }
  return DEFAULT_TICK_RATE
}

function normalizeTeamId(raw: unknown): number | null {
  if (raw === 2 || raw === '2' || raw === 'T' || raw === 'TERRORIST') return 2
  if (raw === 3 || raw === '3' || raw === 'CT') return 3
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  return null
}

/** CS2 round_end reason → ceremony label for timeline icons (demoinfocs RoundEndReason). */
function ceremonyFromRoundEndReason(reason: number | null): string | null {
  if (reason == null) return null
  switch (reason) {
    case 1:
      return 'detonation'
    case 7:
      return 'bombdefused'
    case 8:
    case 12:
      return 'timer'
    case 9:
      return 'elimination'
    default:
      return 'elimination'
  }
}

function steamIdKey(raw: unknown): string | null {
  if (raw == null) return null
  const text = String(raw).trim()
  return text && text !== '0' ? text : null
}

/** Bombsite letter from the event's site label or the planter's Valve place name ("BombsiteB"). */
function plantSiteLetter(row: JsonRow): 'A' | 'B' | null {
  for (const key of ['site', 'bombsite', 'user_last_place_name']) {
    const v = row[key]
    if (typeof v !== 'string') continue
    const t = v.trim().toUpperCase().replace(/^BOMBSITE[\s_]*/, '')
    if (t === 'A' || t === 'B') return t
  }
  return null
}

function safeTicks(source: Cs2DemoSource, props: string[], ticks: number[]): JsonRow[] | null {
  if (!ticks.length) return []
  try {
    const rows = source.ticks(props, ticks)
    return Array.isArray(rows) ? rows as JsonRow[] : null
  } catch {
    return null
  }
}

function safeEventOrNull(source: Cs2DemoSource, eventName: string, playerExtra: string[], otherExtra: string[]): JsonRow[] | null {
  try {
    const rows = source.event(eventName, playerExtra, otherExtra)
    return Array.isArray(rows) ? rows as JsonRow[] : null
  } catch {
    return null
  }
}

function tickToMs(tick: number, tickRate: number): number {
  return tickToMsFromTick(tick, tickRate)
}

function safeParseEvent(
  source: Cs2DemoSource,
  eventName: string,
  extraFields: string[] = [],
  playerExtra: string[] = [],
): JsonRow[] {
  try {
    return asRows(source.event(eventName, extraFields, playerExtra))
  } catch {
    return []
  }
}

/** Demo tick 0 includes connect/warmup — anchor to first gun round_start. */
function resolveCs2DemoAnchorTick(
  roundStarts: JsonRow[],
  roundFreezeEnds: JsonRow[],
  deaths: JsonRow[],
  tickRate: number,
): number {
  const sortedStarts = roundStarts
    .map((row) => ({
      tick: rowNumber(row, 'tick') ?? 0,
      round: rowNumber(row, 'total_rounds_played') ?? -1,
    }))
    .filter((row) => row.tick > 0)
    .sort((a, b) => a.tick - b.tick)

  if (sortedStarts.length > 0) {
    // total_rounds_played counts completed rounds: 0 is round one, 1 is round two.
    // Choosing 1 first erased the first round and shifted every later clip early.
    const gunRound = sortedStarts.find((row) => row.round === 0)
      ?? sortedStarts.find((row) => row.round === 1)
      ?? sortedStarts[0]
    return gunRound.tick
  }

  const freezeTick = roundFreezeEnds
    .map((row) => rowNumber(row, 'tick') ?? 0)
    .filter((tick) => tick > 0)
    .sort((a, b) => a - b)[0]
  if (freezeTick != null) return freezeTick

  const firstDeathTick = deaths
    .map((row) => rowNumber(row, 'tick') ?? 0)
    .filter((tick) => tick > 0)
    .sort((a, b) => a - b)[0]
  if (firstDeathTick != null) return Math.max(0, firstDeathTick - tickRate * 10)

  return 0
}

function alignedGameTimeForTick(tick: number, anchorTick: number, tickRate: number): number {
  return cs2AlignedGameTimeMs(tick, anchorTick, tickRate)
}

/** CS2 demo header via demoparser2, after checking the required file preamble. */
export function peekCs2DemoHeader(demoPath: string): DemoHeaderPeek | null {
  if (!hasSource2DemoPreamble(demoPath)) return null
  try {
    const header = parseHeader(demoPath) as JsonRow
    const mapName = sanitizeDemoMapName(
      rowString(header, 'map_name', 'mapName'),
    )
    const clientName = sanitizeDemoClientName(
      rowString(header, 'client_name', 'clientName'),
    )
    const playbackTime = rowNumber(header, 'playback_time', 'playbackTime')
    if (!mapName && !clientName && playbackTime == null) return null
    return { mapName, clientName, playbackTime }
  } catch (err) {
    log.debug('[CS2DemoParser] Header peek failed:', (err as Error).message)
    return null
  }
}

/**
 * Build the CS2 timeline from demo data. `source` defaults to direct native calls (main thread);
 * demo-timeline.ts passes the cached worker bundle so the native parse runs off the main thread.
 */
export function buildCs2TimelineFromDemo(
  opts: DemoTimelineOptions,
  source: Cs2DemoSource = nativeCs2DemoSource(opts.demoPath),
): MatchData | null {
  if (!fs.existsSync(opts.demoPath)) {
    log.warn('[CS2DemoParser] Demo not found:', opts.demoPath)
    return null
  }

  try {
    const header = source.header() as JsonRow
    const tickRate = resolveTickRate(header)
    // Warmup kills are not match kills (pro / CSTV demos record warmup as "round 0").
    const deaths = safeParseEvent(source,
      'player_death',
      [...CS2_TIMELINE_DEATH_FIELDS.playerExtra],
      [...CS2_TIMELINE_DEATH_FIELDS.otherExtra],
    ).filter((row) => row.is_warmup_period !== true)
    const roundEnds = safeParseEvent(source,
      'round_end',
      ['reason', 'round_win_reason'],
      ['total_rounds_played', 'is_warmup_period'],
    ).filter((row) => row.is_warmup_period !== true)
    const roundStarts = safeParseEvent(source, 'round_start', [], ['total_rounds_played'])
    const roundFreezeEnds = safeParseEvent(source, 'round_freeze_end', [], ['total_rounds_played'])
    const liveOnly = (row: JsonRow) => row.is_warmup_period !== true
    const bombPlants = safeParseEvent(source, 'bomb_planted', ['last_place_name'], ['total_rounds_played', 'is_warmup_period']).filter(liveOnly)
    const bombDefuses = safeParseEvent(source, 'bomb_defused', [], ['total_rounds_played', 'is_warmup_period']).filter(liveOnly)
    const bombExplodes = safeParseEvent(source, 'bomb_exploded', [], ['total_rounds_played', 'is_warmup_period']).filter(liveOnly)
    const players = asRows(source.playerInfo())

    if (!deaths.length && !roundEnds.length) {
      log.warn('[CS2DemoParser] No player_death or round_end events — wrong file or unsupported demo')
      return null
    }

    const demoAnchorTick = resolveCs2DemoAnchorTick(roundStarts, roundFreezeEnds, deaths, tickRate)
    const anchorMs = tickToMs(demoAnchorTick, tickRate)
    if (demoAnchorTick > 0) {
      log.info(`[CS2DemoParser] Demo anchor tick=${demoAnchorTick} (~${Math.round(anchorMs / 1000)}s pre-round trim)`)
    }

    const steamToUserId = new Map<string, number>()
    const userIdToName = new Map<number, string>()
    const userIdToTeam = new Map<number, number>()
    let nextUserId = 1

    const userIdForSteam = (steamRaw: unknown, nameHint?: string | null): number | null => {
      const steam = steamIdKey(steamRaw)
      if (!steam) return null
      let id = steamToUserId.get(steam)
      if (id == null) {
        id = nextUserId++
        steamToUserId.set(steam, id)
      }
      if (nameHint) userIdToName.set(id, nameHint)
      return id
    }

    for (const row of players) {
      const steam = steamIdKey(row.steamid ?? row.steam_id ?? row.player_steamid)
      if (!steam) continue
      const name = rowString(row, 'name', 'player_name')
      const team = normalizeTeamId(row.team_number ?? row.team_num ?? row.team)
      const userId = userIdForSteam(steam, name)
      if (userId == null) continue
      if (name) userIdToName.set(userId, name)
      if (team != null) userIdToTeam.set(userId, team)
    }

    const resolveName = (userId: number): string =>
      userIdToName.get(userId) ?? `Player ${userId}`

    const resolveTeam = (userId: number): number =>
      userIdToTeam.get(userId) ?? 0

    const timeline = emptyMatchData('cs2', opts.recordingStartTime)
    timeline.matchStartTime = opts.matchStartTime
    timeline.gameplayStartTime = opts.matchStartTime
    timeline.gameMode = opts.gameMode ?? 'COMPETITIVE'
    timeline.map = opts.map ?? normalizeCs2MapKey(
      rowString(header, 'map_name', 'mapName'),
    ) ?? null

    let localName: string | null = opts.localPlayerName?.trim() || null
    let localUserId: number | null = null
    let localTeam: number | null = null

    const matchLocalByName = (name: string | null): boolean => {
      if (!name || !localName) return false
      return name.toLowerCase() === localName.toLowerCase()
    }

    // A captured recording owner takes priority over today's linked account or display name.
    let localMatchedBy: Cs2LocalMatch = null
    const capturedSteamId = validCapturedCs2SteamId(opts.cs2Live?.playerSteamId) ? opts.cs2Live.playerSteamId : null
    const knownSteamId = capturedSteamId ?? getKnownCs2SteamId()
    const bySteam = knownSteamId ? steamToUserId.get(knownSteamId) : undefined
    if (bySteam != null) {
      localUserId = bySteam
      localTeam = resolveTeam(bySteam)
      localName = resolveName(bySteam)
      localMatchedBy = 'steam'
    }

    const headerClient = sanitizeDemoClientName(
      rowString(header, 'client_name', 'clientName'),
    )

    const roundKills: RoundKillMeta[] = []
    const killEvents: KillEvent[] = []
    /** The player_death row behind each kill event (round facts are keyed by row). */
    const eventRows = new Map<KillEvent, JsonRow>()
    const playerKills: KillEvent[] = []
    const playerDeaths: KillEvent[] = []
    const firstBloods: FirstBloodEvent[] = []
    const firstBloodRound = new Set<number>()
    let localAssists = 0
    let eventId = 1
    let spikeEventId = 1

    for (const death of deaths) {
      const tick = rowNumber(death, 'tick') ?? 0
      const gameTimeMs = alignedGameTimeForTick(tick, demoAnchorTick, tickRate)
      const videoOffsetMs = gameTimeToVideoOffsetMs(gameTimeMs, timeline)
      const round = Math.max(0, rowNumber(death, 'total_rounds_played') ?? 0)

      const victimName = rowString(death, 'user_name', 'victim_name') ?? 'Unknown'
      const killerNameRaw = rowString(death, 'attacker_name') ?? 'World'
      const assisterName = rowString(death, 'assister_name', 'assistername')
      const victimUserId = userIdForSteam(death.user_steamid ?? death.user_steam_id, victimName)
      const attackerUserId = userIdForSteam(death.attacker_steamid ?? death.attacker_steam_id, killerNameRaw)

      const victimId = victimUserId ?? nextUserId++
      const attackerId = attackerUserId ?? 0
      if (victimUserId == null) userIdToName.set(victimId, victimName)
      if (attackerUserId != null && killerNameRaw !== 'World') {
        userIdToName.set(attackerUserId, killerNameRaw)
      }

      if (localUserId == null) {
        if (matchLocalByName(victimName) || matchLocalByName(headerClient)) {
          localUserId = victimId
          localTeam = resolveTeam(victimId)
          localName = victimName
          localMatchedBy = 'name'
        } else if (attackerUserId != null && (
          matchLocalByName(killerNameRaw) || matchLocalByName(headerClient)
        )) {
          localUserId = attackerUserId
          localTeam = resolveTeam(attackerUserId)
          localName = killerNameRaw
          localMatchedBy = 'name'
        }
      }

      const victimTeam = resolveTeam(victimId)
      const attackerTeam = attackerUserId != null ? resolveTeam(attackerUserId) : 0

      roundKills.push({
        round,
        attackerUserId: attackerId,
        victimUserId: victimId,
        attackerTeam,
        victimTeam,
      })

      const isLocalKill = localUserId != null && attackerUserId === localUserId
      const isLocalDeath = localUserId != null && victimId === localUserId
      const weapon = rowString(death, 'weapon') ?? undefined
      const assistants: string[] = []
      if (assisterName) {
        const assisterUserId = userIdForSteam(death.assister_steamid ?? death.assister_steam_id, assisterName)
        const label = assisterUserId != null && assisterUserId === localUserId ? 'You' : assisterName
        assistants.push(label)
        if (label === 'You') localAssists++
      }
      if (rowBool(death, 'headshot') && weapon && !weapon.includes('headshot')) {
        // demoparser2 exposes headshot as a bool — keep weapon string clean
      }

      const ev: KillEvent = {
        EventID: eventId++,
        EventName: 'ChampionKill',
        EventTime: gameTimeMs / 1000,
        killerName: isLocalKill ? 'You' : killerNameRaw,
        victimName: isLocalDeath ? 'You' : victimName,
        assistants,
        timeSinceGameStartMillis: gameTimeMs,
        videoOffsetMs,
        weapon,
        round,
        attackerUserId: attackerUserId ?? undefined,
        victimUserId: victimId,
      }

      const mapName = timeline.map
      if (!opts.skipSpatial) {
        const posX = rowNumber(death, 'user_X', 'user_x')
        const posY = rowNumber(death, 'user_Y', 'user_y')
        if (posX != null && posY != null && getCs2MapTransform(mapName)) {
          const norm = cs2WorldToNorm(mapName, posX, posY)
          if (norm) {
            const zone = resolveCs2Callout(mapName, norm)
            // Valve's place name where the victim fell (same callout the AI's demo build uses); map zone as fallback.
            const callout = humanizeCs2Place(death.user_last_place_name) ?? zone.callout
            const site = zone.site
            const killerCallout = humanizeCs2Place(death.attacker_last_place_name)
            const distance = rowNumber(death, 'distance')
            // isolated / alliesNearby are set from measured positions for the player's deaths only.
            ev.spatial = {
              norm,
              callout,
              site,
              killerDistance: distance != null ? Math.round(distance * 10) / 10 : null,
              ...(killerCallout ? { killerCallout } : {}),
            }
          }
        }
      }

      killEvents.push(ev)
      eventRows.set(ev, death)
      if (isLocalKill) playerKills.push(ev)
      if (isLocalDeath) playerDeaths.push(ev)

      if (!firstBloodRound.has(round)) {
        firstBloodRound.add(round)
        firstBloods.push({
          EventID: eventId++,
          EventName: 'FirstBlood',
          EventTime: gameTimeMs / 1000,
          killerName: isLocalKill ? 'You' : killerNameRaw,
          victimName: isLocalDeath ? 'You' : victimName,
          round,
          timeSinceGameStartMillis: gameTimeMs,
          videoOffsetMs,
        })
      }
    }

    if (localUserId == null && roundKills.length > 0) {
      const inferred = inferLocalPlayerFromDemoKills(roundKills, resolveName)
      if (inferred) {
        localUserId = inferred.userId
        localTeam = inferred.team
        localName = inferred.name
        localMatchedBy = 'inferred'
        playerKills.length = 0
        playerDeaths.length = 0
        for (const ev of killEvents) {
          const isKill = ev.attackerUserId === localUserId
          const isDeath = ev.victimUserId === localUserId
          if (isKill) {
            ev.killerName = 'You'
            playerKills.push(ev)
          }
          if (isDeath) {
            ev.victimName = 'You'
            playerDeaths.push(ev)
          }
        }
        log.info('[CS2DemoParser] Inferred local player from demo kills:', localName)
      }
    }

    const roundWinners = new Map<number, number>()
    const roundEndTimes = new Map<number, number>()
    const roundCeremonies = new Map<number, string>()
    // Key each round_end by the round number of the round_start before it (same 0-based
    // total_rounds_played the kills carry), so an mp_restartgame doesn't shift every round by one.
    const startRounds = roundStarts
      .map((row) => ({ tick: rowNumber(row, 'tick'), round: rowNumber(row, 'total_rounds_played') }))
      .filter((s): s is { tick: number; round: number } => s.tick != null && s.round != null)
      .sort((a, b) => a.tick - b.tick)
    // Start row before each end; only trusted when every round_end has its own round_start.
    const startIndexForEnd = roundEnds.map((row) => {
      const tick = rowNumber(row, 'tick')
      if (tick == null) return -1
      let found = -1
      startRounds.forEach((start, i) => { if (start.tick <= tick) found = i })
      return found
    })
    const startsTrusted = startIndexForEnd.every((i) => i >= 0)
      && new Set(startIndexForEnd).size === startIndexForEnd.length
    const roundNumberForEnd = (index: number): number => (
      startsTrusted ? Math.max(0, startRounds[startIndexForEnd[index]!]!.round) : index
    )
    let endRoundCount = 0
    roundEnds.forEach((row, index) => {
      const winner = normalizeTeamId(row.winner)
      const roundNum = roundNumberForEnd(index)
      endRoundCount = Math.max(endRoundCount, roundNum + 1)
      if (winner != null) roundWinners.set(roundNum, winner)
      const reason = rowNumber(row, 'reason', 'round_win_reason')
      const ceremony = ceremonyFromRoundEndReason(reason)
      if (ceremony) roundCeremonies.set(roundNum, ceremony)
      const tick = rowNumber(row, 'tick')
      if (tick != null) {
        roundEndTimes.set(roundNum, alignedGameTimeForTick(tick, demoAnchorTick, tickRate) / 1000)
      }
    })

    const spikePlants: SpikePlantedEvent[] = bombPlants.map((row) => {
      const tick = rowNumber(row, 'tick') ?? 0
      const gameTimeMs = alignedGameTimeForTick(tick, demoAnchorTick, tickRate)
      const round = Math.max(0, rowNumber(row, 'total_rounds_played') ?? 0)
      const site = plantSiteLetter(row) ?? 'Unknown'
      const planter = rowString(row, 'user_name', 'player_name') ?? 'Unknown'
      return {
        EventID: spikeEventId++,
        EventName: 'SpikePlanted',
        EventTime: gameTimeMs / 1000,
        planter: localName && planter.toLowerCase() === localName.toLowerCase() ? 'You' : planter,
        site,
        round,
        gameTimeMs,
        videoOffsetMs: gameTimeToVideoOffsetMs(gameTimeMs, timeline),
      }
    })

    const spikeDefuses: SpikeDefusedEvent[] = bombDefuses.map((row) => {
      const tick = rowNumber(row, 'tick') ?? 0
      const gameTimeMs = alignedGameTimeForTick(tick, demoAnchorTick, tickRate)
      const round = Math.max(0, rowNumber(row, 'total_rounds_played') ?? 0)
      const defuser = rowString(row, 'user_name', 'player_name') ?? 'Unknown'
      return {
        EventID: spikeEventId++,
        EventName: 'SpikeDefused',
        EventTime: gameTimeMs / 1000,
        defuser: localName && defuser.toLowerCase() === localName.toLowerCase() ? 'You' : defuser,
        round,
        gameTimeMs,
        videoOffsetMs: gameTimeToVideoOffsetMs(gameTimeMs, timeline),
      }
    })

    const spikeDetonations: SpikeDetonatedEvent[] = bombExplodes.map((row) => {
      const tick = rowNumber(row, 'tick') ?? 0
      const gameTimeMs = alignedGameTimeForTick(tick, demoAnchorTick, tickRate)
      const round = Math.max(0, rowNumber(row, 'total_rounds_played') ?? 0)
      return {
        EventID: spikeEventId++,
        EventName: 'SpikeDetonated',
        EventTime: gameTimeMs / 1000,
        round,
        gameTimeMs,
        videoOffsetMs: gameTimeToVideoOffsetMs(gameTimeMs, timeline),
      }
    })

    const roundsPlayed = roundEnds.length > 0
      ? endRoundCount
      : Math.max(0, ...killEvents.map((k) => (k.round ?? 0) + 1), 0)
    const roundSummaries: RoundSummary[] = []
    let allyWins = 0
    let enemyWins = 0

    // Sides swap at half time (and in overtime): playerInfo only holds the final side.
    const localSteamForSides = [...steamToUserId.entries()].find(([, id]) => id === localUserId)?.[0] ?? null
    const localSideByRound = localSteamForSides ? cs2LocalSideByRound(deaths, localSteamForSides) : new Map<number, number>()
    let lastKnownSide: number | null = null

    for (let r = 0; r < roundsPlayed; r++) {
      const winnerTeam = roundWinners.get(r)
      const roundSide: number | null = localSideByRound.get(r) ?? lastKnownSide ?? localTeam
      if (localSideByRound.has(r)) lastKnownSide = localSideByRound.get(r)!
      const won = roundSide != null && winnerTeam === roundSide
      if (won) allyWins++
      else if (winnerTeam != null) enemyWins++
      const planted = spikePlants.some((p) => p.round === r)
      const defused = spikeDefuses.some((d) => d.round === r)
      const detonated = spikeDetonations.some((d) => d.round === r)
      let ceremony = roundCeremonies.get(r) ?? null
      if (!ceremony) {
        if (defused) ceremony = 'bombdefused'
        else if (detonated) ceremony = 'detonation'
        else if (planted && !defused) ceremony = 'detonation'
        else ceremony = 'elimination'
      }
      roundSummaries.push({
        roundNumber: r,
        winningTeam: won ? 'ALLY' : winnerTeam != null ? 'ENEMY' : null,
        ceremony,
        endTime: roundEndTimes.get(r) ?? 0,
        playerStats: null,
        spikePlanted: spikePlants.some((p) => p.round === r),
        spikeSite: (() => {
          const site = spikePlants.find((p) => p.round === r)?.site
          return site === 'A' || site === 'B' ? site : null
        })(),
        spikePlanter: spikePlants.find((p) => p.round === r)?.planter ?? null,
        spikeDefused: spikeDefuses.some((d) => d.round === r),
        spikeDefuser: spikeDefuses.find((d) => d.round === r)?.defuser ?? null,
        spikeDetonated: spikeDetonations.some((d) => d.round === r),
        playerGold: null,
        playerAbilities: null,
        playerGotFirstBlood: false,
        playerWasFirstBlood: false,
        playerSpent: null,
        playerLoadoutValue: null,
        playerWeapon: null,
        playerArmor: null,
        playerDamageDealt: null,
      })
    }

    timeline.playerName = localName ?? headerClient ?? null
    timeline.endTime = Date.now()
    timeline.roundSummaries = roundSummaries
    timeline.killEvents = killEvents
    timeline.playerKills = playerKills
    timeline.playerDeaths = playerDeaths
    timeline.spikePlants = spikePlants
    timeline.spikeDefuses = spikeDefuses
    timeline.spikeDetonations = spikeDetonations
    timeline.firstBloods = firstBloods
    timeline.finalStats = localUserId != null ? {
      kills: playerKills.length,
      deaths: playerDeaths.length,
      assists: localAssists,
      score: 0,
      summonerName: localName,
      agent: null,
      team: localTeam != null ? String(localTeam) : null,
      level: 0,
      headshotPct: null,
      adr: null,
      accountLevel: null,
    } : null

    const localSteamId = [...steamToUserId.entries()].find(([, id]) => id === localUserId)?.[0]
    if (capturedSteamId && localSteamId === capturedSteamId) timeline.playerSteamId = capturedSteamId
    if (localSteamId && localName) {
      const lower = localName.toLowerCase()
      const sameName = [...userIdToName.values()].filter(n => n.toLowerCase() === lower).length
      // Two different players with this name in the lobby: too ambiguous to save a Steam ID from.
      rememberParsedCs2SteamId(localSteamId, localMatchedBy, sameName <= 1)
    }
    if (localSteamId) {
      const statsInput = readCs2StatsInput(localSteamId, tickRate, source)
      timeline.match_stats = statsInput ? calculateCs2MatchStats(statsInput) : null
      if (statsInput) {
        const facts = applyCs2RoundFacts({
          source, localSteamId, tickRate, statsInput, deaths, bombPlants,
          killEvents: [...playerKills, ...playerDeaths], eventRows, roundSummaries,
        })
        if (facts.playerFlashes) timeline.playerFlashes = facts.playerFlashes
        // Many demos have no player_blind rows: count flashes from flash_duration around each
        // detonation instead of reporting a false 0 (same post-step as the AI service).
        const utility = timeline.match_stats?.utility_stats
        if (utility && (!statsInput.blinds || statsInput.blinds.length === 0)) {
          utility.enemies_flashed = facts.flashCounts?.enemies ?? null
          utility.teammates_flashed = facts.flashCounts?.teammates ?? null
        }
      }
      const measured = timeline.match_stats?.player_stats
      if (timeline.finalStats && measured) {
        // Keep the desktop scoreboard and uploaded statistics on the same live-round contract.
        for (const key of ['kills', 'deaths', 'assists'] as const) {
          if (typeof measured[key] === 'number') timeline.finalStats[key] = measured[key]
        }
        timeline.finalStats.adr = typeof measured.adr === 'number' ? measured.adr : null
        timeline.finalStats.headshotPct = typeof measured.headshot_pct === 'number' ? measured.headshot_pct : null
      }
    }

    timeline.finalScore = roundsPlayed > 0 ? {
      allyScore: allyWins,
      enemyScore: enemyWins,
    } : undefined

    if (timeline.match_stats) {
      const [allyScore, enemyScore] = timeline.match_stats.score.split('-').map(Number)
      timeline.finalScore = { allyScore: allyScore!, enemyScore: enemyScore! }
    }

    timeline.matchDetails = {
      roundKills,
      roundWinners,
      localUserId: localUserId ?? undefined,
      localTeam: localTeam ?? undefined,
      playbackTicks: rowNumber(header, 'playback_ticks', 'playbackTicks') ?? undefined,
      playbackTime: rowNumber(header, 'playback_time', 'playbackTime') ?? undefined,
      parser: 'demoparser2',
      demoAnchorTick,
      demoAnchorMs: anchorMs,
      roundStartCount: roundStarts.length,
      bombPlants: spikePlants.length,
      bombDefuses: spikeDefuses.length,
    }

    log.info(
      `[CS2DemoParser] Parsed demo — map=${timeline.map} rounds=${roundSummaries.length} ` +
      `kills=${playerKills.length}/${playerDeaths.length} events=${killEvents.length} local=${localName ?? 'unknown'}`,
    )

    if (opts.cs2Live) {
      // Keep the live record and measure where demo time zero sits in the video (warmup made the
      // match-start estimate 15–40 s early). recomputeTimelineVideoOffsets applies the shift.
      timeline.cs2Live = opts.cs2Live
      const sync = estimateCs2DemoVideoShift(timeline, opts.cs2Live)
      if (sync) {
        timeline.cs2DemoVideoShiftMs = sync.shiftMs
        timeline.cs2DemoSyncEvidence = { pairs: sync.pairs, livePoints: sync.livePoints }
        const estimate = -Math.max(0, opts.recordingStartTime - (opts.matchStartTime ?? opts.recordingStartTime))
        log.info(`[CS2DemoSync] demo→video shift ${sync.shiftMs} ms from ${sync.pairs}/${sync.livePoints} GSI points (match-start estimate ${estimate} ms, diff ${sync.shiftMs - estimate} ms)`)
      } else {
        log.info(`[CS2DemoSync] GSI points did not agree (${opts.cs2Live.events.length} events, ${opts.cs2Live.roundEnds?.length ?? 0} round ends) — keeping match-start estimate`)
      }
    }

    if (!opts.skipSpatial) {
      applyDemoSpatialEnrichment(timeline)
    }

    return timeline
  } catch (err) {
    log.warn('[CS2DemoParser] Parse failed:', (err as Error).message)
    return null
  }
}

/**
 * The local player's side (2 = T, 3 = CT) per round, read from player_death `*_team_num`
 * (the side at kill time). Rounds without the local player in a kill use any known teammate.
 */
export function cs2LocalSideByRound(deaths: JsonRow[], localSteamId: string): Map<number, number> {
  const sides = new Map<number, number>()
  const rowsOf = (row: JsonRow): Array<[string | null, number | null]> => [
    [steamIdKey(row.user_steamid ?? row.user_steam_id), normalizeTeamId(row.user_team_num)],
    [steamIdKey(row.attacker_steamid ?? row.attacker_steam_id), normalizeTeamId(row.attacker_team_num)],
  ]
  const roundOf = (row: JsonRow) => Math.max(0, rowNumber(row, 'total_rounds_played') ?? 0)
  const isSide = (t: number | null): t is number => t === 2 || t === 3
  for (const row of deaths) {
    for (const [steam, team] of rowsOf(row)) {
      if (steam === localSteamId && isSide(team)) sides.set(roundOf(row), team)
    }
  }
  const teammates = new Set<string>()
  for (const row of deaths) {
    const side = sides.get(roundOf(row))
    if (side == null) continue
    for (const [steam, team] of rowsOf(row)) {
      if (steam && steam !== localSteamId && team === side) teammates.add(steam)
    }
  }
  for (const row of deaths) {
    const round = roundOf(row)
    if (sides.has(round)) continue
    for (const [steam, team] of rowsOf(row)) {
      if (steam && teammates.has(steam) && isSide(team)) { sides.set(round, team); break }
    }
  }
  return sides
}

/**
 * Add the measured per-round facts (cs2-round-facts.ts) to the player's kill/death events and the
 * round summaries. Reads stay inside the worker plan (cs2-demo-source.ts collectCs2DemoBundle).
 */
function applyCs2RoundFacts(args: {
  source: Cs2DemoSource
  localSteamId: string
  tickRate: number
  statsInput: { starts: JsonRow[]; ends: JsonRow[]; snapshots: JsonRow[] }
  deaths: JsonRow[]
  bombPlants: JsonRow[]
  killEvents: KillEvent[]
  eventRows: Map<KillEvent, JsonRow>
  roundSummaries: RoundSummary[]
}): Cs2RoundFactsResult {
  const { source, localSteamId, tickRate, statsInput } = args
  const { playerExtra, otherExtra } = CS2_STATS_EVENT_FIELDS
  const grenades = safeEventOrNull(source, 'grenade_thrown', [...playerExtra], [...otherExtra])
  const detonations = safeEventOrNull(source, 'flashbang_detonate', [...playerExtra], [...otherExtra])
  let flashHits: Cs2FlashHit[] | null = null
  if (detonations) {
    const samples = safeTicks(source, CS2_FLASH_TICK_PROPS, cs2FlashSampleTicks(detonations))
    flashHits = samples ? flashHitsFromSamples(detonations, samples) : null
  }
  const facts = buildCs2RoundFacts({
    steamId: localSteamId,
    tickRate,
    starts: statsInput.starts,
    ends: statsInput.ends,
    deaths: args.deaths,
    snapshots: statsInput.snapshots,
    plants: args.bombPlants,
    grenades,
    flashHits,
    deathPositions: safeTicks(source, CS2_DEATH_TICK_PROPS, cs2DeathTicks(args.deaths)),
  })

  for (const ev of args.killEvents) {
    const row = args.eventRows.get(ev)
    const fact = row ? facts.events.get(row) : undefined
    if (!fact) continue
    const { alliesAlive, alliesNearby, ...eventFacts } = fact
    Object.assign(ev, eventFacts)
    if (ev.spatial && ev.victimName === 'You') {
      if (typeof fact.traded === 'boolean') ev.spatial.traded = fact.traded
      if (alliesAlive != null) ev.spatial.alliesAlive = alliesAlive
      if (alliesNearby != null) {
        ev.spatial.alliesNearby = alliesNearby
        ev.spatial.isolated = alliesNearby === 0
      }
    }
  }

  facts.rounds.forEach((roundFacts, index) => {
    const summary = args.roundSummaries[index]
    if (!summary) return
    const { sideTeam, winnerTeam, ...rest } = roundFacts
    Object.assign(summary, rest)
    // Sides swap at half time: judge the winner against this round's side, not the final team.
    if (sideTeam && winnerTeam) summary.winningTeam = winnerTeam === sideTeam ? 'ALLY' : 'ENEMY'
  })
  return facts
}
