/**
 * CS2 demo parsing via @laihoe/demoparser2 (LaihoE/demoparser).
 * demofile is CS:GO-only and does not decode CS2 game events reliably.
 */
import fs from 'fs'
import log from 'electron-log'
import { parseEvent, parseHeader, parsePlayerInfo } from '@laihoe/demoparser2'
import type { DemoTimelineOptions } from './demo-timeline'
import { inferLocalPlayerFromDemoKills, type RoundKillMeta } from './demo-local-player'
import { emptyMatchData, gameTimeToVideoOffsetMs } from './recording-sync'
import { cs2WorldToNorm, getCs2MapTransform, normalizeCs2MapKey } from './spatial/cs2-transforms'
import { applyDemoSpatialEnrichment, resolveCs2Callout } from './spatial/demo-enrich'
import { sanitizeDemoClientName, sanitizeDemoMapName } from './demo-text-sanitize'
import type { KillEvent, MatchData, RoundSummary } from './riot-types'
import type { DemoHeaderPeek } from './demo-header-peek'

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

function steamIdKey(raw: unknown): string | null {
  if (raw == null) return null
  const text = String(raw).trim()
  return text && text !== '0' ? text : null
}

function tickToMs(tick: number, tickRate: number): number {
  return Math.round((tick / tickRate) * 1000)
}

/** CS2 demo header via demoparser2 — replaces demofile header peek for CS2. */
export function peekCs2DemoHeader(demoPath: string): DemoHeaderPeek | null {
  if (!fs.existsSync(demoPath)) return null
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

export function buildCs2TimelineFromDemo(opts: DemoTimelineOptions): MatchData | null {
  if (!fs.existsSync(opts.demoPath)) {
    log.warn('[CS2DemoParser] Demo not found:', opts.demoPath)
    return null
  }

  try {
    const header = parseHeader(opts.demoPath) as JsonRow
    const tickRate = resolveTickRate(header)
    const deaths = asRows(parseEvent(
      opts.demoPath,
      'player_death',
      ['user_X', 'user_Y'],
      ['total_rounds_played'],
    ))
    const roundEnds = asRows(parseEvent(opts.demoPath, 'round_end'))
    const players = asRows(parsePlayerInfo(opts.demoPath))

    if (!deaths.length && !roundEnds.length) {
      log.warn('[CS2DemoParser] No player_death or round_end events — wrong file or unsupported demo')
      return null
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

    const headerClient = sanitizeDemoClientName(
      rowString(header, 'client_name', 'clientName'),
    )

    const roundKills: RoundKillMeta[] = []
    const killEvents: KillEvent[] = []
    const playerKills: KillEvent[] = []
    const playerDeaths: KillEvent[] = []
    let eventId = 1

    for (const death of deaths) {
      const tick = rowNumber(death, 'tick') ?? 0
      const gameTimeMs = tickToMs(tick, tickRate)
      const videoOffsetMs = gameTimeToVideoOffsetMs(gameTimeMs, timeline)
      const round = Math.max(0, rowNumber(death, 'total_rounds_played') ?? 0)

      const victimName = rowString(death, 'user_name', 'victim_name') ?? 'Unknown'
      const killerNameRaw = rowString(death, 'attacker_name') ?? 'World'
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
        } else if (attackerUserId != null && (
          matchLocalByName(killerNameRaw) || matchLocalByName(headerClient)
        )) {
          localUserId = attackerUserId
          localTeam = resolveTeam(attackerUserId)
          localName = killerNameRaw
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

      const ev: KillEvent = {
        EventID: eventId++,
        EventName: 'ChampionKill',
        EventTime: gameTimeMs / 1000,
        killerName: isLocalKill ? 'You' : killerNameRaw,
        victimName: isLocalDeath ? 'You' : victimName,
        assistants: [],
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
            const { callout, site } = resolveCs2Callout(mapName, norm)
            ev.spatial = {
              norm,
              callout,
              site,
              killerDistance: null,
              isolated: false,
              alliesNearby: 0,
            }
          }
        }
      }

      if (rowBool(death, 'headshot')) {
        // preserved on weapon string in some demos; no dedicated field on KillEvent
      }

      killEvents.push(ev)
      if (isLocalKill) playerKills.push(ev)
      if (isLocalDeath) playerDeaths.push(ev)
    }

    if (localUserId == null && roundKills.length > 0) {
      const inferred = inferLocalPlayerFromDemoKills(roundKills, resolveName)
      if (inferred) {
        localUserId = inferred.userId
        localTeam = inferred.team
        localName = inferred.name
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
    roundEnds.forEach((row, index) => {
      const winner = normalizeTeamId(row.winner)
      if (winner != null) roundWinners.set(index + 1, winner)
    })

    const roundsPlayed = Math.max(roundWinners.size, ...killEvents.map((k) => (k.round ?? 0) + 1), 0)
    const roundSummaries: RoundSummary[] = []
    let allyWins = 0
    let enemyWins = 0

    for (let r = 0; r < roundsPlayed; r++) {
      const winnerTeam = roundWinners.get(r + 1)
      const won = localTeam != null && winnerTeam === localTeam
      if (won) allyWins++
      else if (winnerTeam != null) enemyWins++
      roundSummaries.push({
        roundNumber: r,
        winningTeam: won ? 'ALLY' : winnerTeam != null ? 'ENEMY' : null,
        ceremony: null,
        endTime: 0,
        playerStats: null,
        spikePlanted: false,
        spikeSite: null,
        spikePlanter: null,
        spikeDefused: false,
        spikeDefuser: null,
        spikeDetonated: false,
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
    timeline.finalStats = localUserId != null ? {
      kills: playerKills.length,
      deaths: playerDeaths.length,
      assists: 0,
      score: 0,
      summonerName: localName,
      agent: null,
      team: localTeam != null ? String(localTeam) : null,
      level: 0,
      headshotPct: null,
      adr: null,
      accountLevel: null,
    } : null

    timeline.finalScore = roundsPlayed > 0 ? {
      allyScore: allyWins,
      enemyScore: enemyWins,
    } : undefined

    timeline.matchDetails = {
      roundKills,
      roundWinners,
      localUserId: localUserId ?? undefined,
      localTeam: localTeam ?? undefined,
      playbackTicks: rowNumber(header, 'playback_ticks', 'playbackTicks') ?? undefined,
      playbackTime: rowNumber(header, 'playback_time', 'playbackTime') ?? undefined,
      parser: 'demoparser2',
    }

    log.info(
      `[CS2DemoParser] Parsed demo — map=${timeline.map} rounds=${roundSummaries.length} ` +
      `kills=${playerKills.length}/${playerDeaths.length} events=${killEvents.length} local=${localName ?? 'unknown'}`,
    )

    if (!opts.skipSpatial) {
      applyDemoSpatialEnrichment(timeline)
    }

    return timeline
  } catch (err) {
    log.warn('[CS2DemoParser] Parse failed:', (err as Error).message)
    return null
  }
}
