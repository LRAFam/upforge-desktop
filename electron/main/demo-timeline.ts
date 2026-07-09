import fs from 'fs'
import { DemoFile } from 'demofile'
import log from 'electron-log'
import type { KillEvent, MatchData, RoundSummary } from './riot-types'
import { emptyMatchData, gameTimeToVideoOffsetMs } from './recording-sync'
import { cs2WorldToNorm, getCs2MapTransform } from './spatial/cs2-transforms'
import { applyDemoSpatialEnrichment, resolveCs2Callout } from './spatial/demo-enrich'
import { inferLocalPlayerFromDemoKills } from './demo-local-player'

export interface DemoTimelineOptions {
  game: 'cs2' | 'deadlock'
  demoPath: string
  map?: string | null
  gameMode?: string | null
  matchStartTime: number | null
  recordingStartTime: number
  /** Optional hint — FACEIT nickname or Steam display name */
  localPlayerName?: string | null
  /** Skip spatial enrichment (faster demo preview). */
  skipSpatial?: boolean
}

interface RoundKillMeta {
  round: number
  attackerUserId: number
  victimUserId: number
  attackerTeam: number
  victimTeam: number
}

/**
 * Parse a Source-engine .dem replay into MatchData for clip extraction and VOD review.
 * Works for CS2 and Deadlock (same demo format).
 */
export async function buildTimelineFromDemo(opts: DemoTimelineOptions): Promise<MatchData | null> {
  if (!fs.existsSync(opts.demoPath)) {
    log.warn('[DemoTimeline] Demo not found:', opts.demoPath)
    return null
  }

  return new Promise((resolve) => {
    const demo = new DemoFile()
    const timeline = emptyMatchData(opts.game, opts.recordingStartTime)
    timeline.matchStartTime = opts.matchStartTime
    timeline.gameplayStartTime = opts.matchStartTime
    timeline.gameMode = opts.gameMode ?? 'COMPETITIVE'

    let currentRound = 0
    let localUserId: number | null = null
    let localTeam: number | null = null
    let localName: string | null = opts.localPlayerName?.trim() || null
    const roundKills: RoundKillMeta[] = []
    const roundWinners = new Map<number, number>()
    const playerKills: KillEvent[] = []
    const playerDeaths: KillEvent[] = []
    const killEvents: KillEvent[] = []
    let eventId = 1
    let parseFailed = false

    const tickToMs = (tick: number): number => {
      const rate = demo.tickRate > 0 ? demo.tickRate : 64
      return Math.round((tick / rate) * 1000)
    }

    const resolveName = (userId: number): string => {
      const ent = demo.entities.getByUserId(userId)
      return ent?.name?.trim() || `Player ${userId}`
    }

    const resolveTeam = (userId: number): number => {
      const ent = demo.entities.getByUserId(userId)
      return ent?.teamNumber ?? 0
    }

    demo.gameEvents.on('round_start', () => {
      currentRound++
    })

    demo.gameEvents.on('round_end', (e: { winner?: number }) => {
      if (typeof e.winner === 'number') {
        roundWinners.set(currentRound, e.winner)
      }
    })

    demo.gameEvents.on('player_death', (e: {
      userid: number
      attacker: number
      weapon?: string
      headshot?: boolean
      tick?: number
      player?: { position?: { x: number; y: number; z: number } }
    }) => {
      const tick = e.tick ?? demo.currentTick
      const gameTimeMs = tickToMs(tick)
      const videoOffsetMs = gameTimeToVideoOffsetMs(gameTimeMs, timeline)

      const victimUserId = e.userid
      const attackerUserId = e.attacker
      const victimTeam = resolveTeam(victimUserId)
      const attackerTeam = resolveTeam(attackerUserId)

      if (localUserId == null) {
        const victimName = resolveName(victimUserId)
        const headerName = demo.header?.clientName?.trim()
        if (localName && victimName.toLowerCase() === localName.toLowerCase()) {
          localUserId = victimUserId
          localTeam = victimTeam
        } else if (headerName && victimName.toLowerCase() === headerName.toLowerCase()) {
          localUserId = victimUserId
          localTeam = victimTeam
          localName = headerName
        }
      }

      if (localUserId == null && attackerUserId > 0) {
        const attackerName = resolveName(attackerUserId)
        const headerName = demo.header?.clientName?.trim()
        if (localName && attackerName.toLowerCase() === localName.toLowerCase()) {
          localUserId = attackerUserId
          localTeam = attackerTeam
        } else if (headerName && attackerName.toLowerCase() === headerName.toLowerCase()) {
          localUserId = attackerUserId
          localTeam = attackerTeam
          localName = headerName
        }
      }

      const round = Math.max(0, currentRound - 1)
      roundKills.push({
        round,
        attackerUserId,
        victimUserId,
        attackerTeam,
        victimTeam,
      })

      const killerName = attackerUserId > 0 ? resolveName(attackerUserId) : 'World'
      const victimName = resolveName(victimUserId)
      const isLocalKill = localUserId != null && attackerUserId === localUserId
      const isLocalDeath = localUserId != null && victimUserId === localUserId

      const ev: KillEvent = {
        EventID: eventId++,
        EventName: 'ChampionKill',
        EventTime: gameTimeMs / 1000,
        killerName: isLocalKill ? 'You' : killerName,
        victimName: isLocalDeath ? 'You' : victimName,
        assistants: [],
        timeSinceGameStartMillis: gameTimeMs,
        videoOffsetMs,
        weapon: e.weapon,
        round,
        attackerUserId: attackerUserId > 0 ? attackerUserId : undefined,
        victimUserId,
      }

      if (opts.game === 'cs2') {
        const mapName = opts.map ?? demo.header?.mapName ?? null
        const victimEnt = e.player ?? demo.entities.getByUserId(victimUserId)
        const pos = victimEnt?.position
        if (pos && getCs2MapTransform(mapName)) {
          const norm = cs2WorldToNorm(mapName, pos.x, pos.y)
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

      killEvents.push(ev)
      if (isLocalKill) playerKills.push(ev)
      if (isLocalDeath) playerDeaths.push(ev)
    })

    demo.on('end', () => {
      if (parseFailed) {
        resolve(null)
        return
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
          log.info('[DemoTimeline] Inferred local player from demo kills:', localName)
        }
      }

      const header = demo.header
      timeline.map = opts.map ?? header?.mapName ?? null
      timeline.playerName = localName ?? header?.clientName ?? null
      timeline.endTime = Date.now()

      const roundsPlayed = Math.max(currentRound, roundWinners.size)
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

      timeline.matchDetails = {
        roundKills,
        roundWinners,
        localUserId: localUserId ?? undefined,
        localTeam: localTeam ?? undefined,
        playbackTicks: header?.playbackTicks,
        playbackTime: header?.playbackTime,
      }

      log.info(
        `[DemoTimeline] Parsed ${opts.game} demo — map=${timeline.map} rounds=${roundSummaries.length} ` +
        `kills=${playerKills.length} deaths=${playerDeaths.length} local=${localName ?? 'unknown'}`,
      )
      if (!opts.skipSpatial) {
        applyDemoSpatialEnrichment(timeline)
        if (timeline.spatialSummary) {
          log.info(
            `[DemoTimeline] Spatial — ${timeline.spatialSummary.events.length} radar events ` +
            `(${timeline.spatialSummary.deathHotspots.length} death hotspots)`,
          )
        }
      }
      resolve(timeline)
    })

    demo.on('error', (err: Error) => {
      log.warn('[DemoTimeline] Parse error:', err.message)
      parseFailed = true
    })

    try {
      demo.parseStream(fs.createReadStream(opts.demoPath))
    } catch (err) {
      log.warn('[DemoTimeline] Failed to open demo:', (err as Error).message)
      resolve(null)
    }
  })
}
