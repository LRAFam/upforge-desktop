/**
 * CS2 events from Game State Integration, for matches without a demo (Wingman, Casual, or before
 * Steam lists the GOTV demo). GSI only describes the LOCAL player while they are alive and not
 * spectating, so this records what we actually saw: your kills, your deaths, round results and the
 * score. No victims, weapons or positions (those need the demo).
 *
 * Stored on `MatchData.cs2Live`, never in `killEvents` / `playerKills` / `finalStats`, so it cannot
 * unlock Analyse (the API requires rich demo stats for CS2 — desktop-api-match-data-contract).
 * Timestamps come from GSI delivery (buffer 0.1 s, throttle 0.5 s), so they are about ±1 s.
 */
import type { KillEvent } from './riot-types'

export interface Cs2GsiPlayer {
  steamid?: string
  team?: string
  activity?: string
  state?: { health?: number; round_kills?: number }
  match_stats?: { kills?: number; assists?: number; deaths?: number; mvps?: number; score?: number }
}

export interface Cs2GsiPayload {
  provider?: { steamid?: string }
  map?: {
    name?: string
    mode?: string
    phase?: string
    round?: number
    team_ct?: { score?: number }
    team_t?: { score?: number }
    round_wins?: Record<string, string>
  }
  round?: { phase?: string; win_team?: string; bomb?: string }
  player?: Cs2GsiPlayer
}

export interface Cs2LiveEvent {
  type: 'kill' | 'death'
  /** 0-indexed round, like demo KillEvent.round. */
  round: number
  videoOffsetMs: number
}

export interface Cs2LiveRound {
  roundNumber: number
  won: boolean | null
  /** e.g. "ct_win_elimination" from GSI map.round_wins */
  reason: string | null
}

export interface Cs2LiveSummary {
  source: 'gsi'
  events: Cs2LiveEvent[]
  rounds: Cs2LiveRound[]
  /** Your final K/D/A from GSI match_stats, when GSI sent it. */
  stats: { kills: number; deaths: number; assists: number } | null
  allyScore: number | null
  enemyScore: number | null
}

function side(team: string | undefined): 'CT' | 'T' | null {
  const t = team?.toUpperCase()
  return t === 'CT' || t === 'T' ? t : null
}

export class Cs2GsiTracker {
  private recordingStartMs: number | null = null
  private events: Cs2LiveEvent[] = []
  private sideByRound = new Map<number, 'CT' | 'T'>()
  private lastStats: { kills: number; deaths: number; assists: number } | null = null
  private lastRound = 0
  private lastLocalAlive = false
  private deathLoggedForRound = -1
  private deathsLogged = 0
  private lastSide: 'CT' | 'T' | null = null
  private roundWins: Record<string, string> = {}
  private ctScore: number | null = null
  private tScore: number | null = null

  /** Start a fresh match. `recordingStartMs` is when OBS started writing the file. */
  start(recordingStartMs: number | null): void {
    this.recordingStartMs = recordingStartMs
    this.events = []
    this.sideByRound.clear()
    this.lastStats = null
    this.lastRound = 0
    this.lastLocalAlive = false
    this.deathLoggedForRound = -1
    this.deathsLogged = 0
    this.lastSide = null
    this.roundWins = {}
    this.ctScore = null
    this.tScore = null
  }

  setRecordingStart(ms: number | null): void {
    if (ms != null) this.recordingStartMs = ms
  }

  get active(): boolean {
    return this.recordingStartMs != null
  }

  ingest(payload: Cs2GsiPayload, nowMs: number): void {
    if (this.recordingStartMs == null) return
    const map = payload.map
    if (!map?.name || map.name.toLowerCase() === 'menu') return
    if ((map.phase ?? '').toLowerCase() === 'warmup') return
    const round = typeof map.round === 'number' && map.round >= 0 ? map.round : this.lastRound
    this.lastRound = round
    if (map.round_wins && typeof map.round_wins === 'object') this.roundWins = { ...map.round_wins }
    if (typeof map.team_ct?.score === 'number') this.ctScore = map.team_ct.score
    if (typeof map.team_t?.score === 'number') this.tScore = map.team_t.score

    const player = payload.player
    const local = !!player?.steamid && player.steamid === payload.provider?.steamid
    const offset = Math.max(0, nowMs - this.recordingStartMs)
    if (!local) {
      // Spectating someone else mid-round means you died (GSI stops describing you).
      if (this.lastLocalAlive && (payload.round?.phase ?? '').toLowerCase() === 'live') this.logDeath(round, offset)
      this.lastLocalAlive = false
      return
    }
    const s = side(player.team)
    if (s) { this.lastSide = s; this.sideByRound.set(round, s) }
    const health = player.state?.health
    if (typeof health === 'number') {
      if (health <= 0 && this.lastLocalAlive) this.logDeath(round, offset)
      this.lastLocalAlive = health > 0
    }
    const ms = player.match_stats
    if (ms && typeof ms.kills === 'number' && typeof ms.deaths === 'number') {
      const next = { kills: ms.kills, deaths: ms.deaths, assists: ms.assists ?? 0 }
      if (this.lastStats) {
        const gained = next.kills - this.lastStats.kills
        // Negative deltas (team kills) and huge jumps (reconnect) are not shown as kills.
        if (gained > 0 && gained <= 5) {
          for (let i = 0; i < gained; i++) this.events.push({ type: 'kill', round, videoOffsetMs: offset })
        }
      }
      // match_stats.deaths often lands after the next round starts, so it cannot time a death. A death
      // the health / spectate signals missed stays in the K/D total but gets no (wrongly timed) marker.
      if (next.deaths > this.deathsLogged) this.deathsLogged = next.deaths
      this.lastStats = next
    }
  }

  private logDeath(round: number, offset: number): void {
    if (this.deathLoggedForRound === round) return
    this.deathLoggedForRound = round
    this.deathsLogged++
    this.events.push({ type: 'death', round, videoOffsetMs: offset })
  }

  /** What GSI saw, or null when it saw nothing usable (e.g. GSI cfg not loaded yet). */
  summary(): Cs2LiveSummary | null {
    const rounds: Cs2LiveRound[] = Object.entries(this.roundWins)
      .map(([k, reason]) => ({ n: Number(k), reason }))
      .filter((r) => Number.isInteger(r.n) && r.n >= 1)
      .sort((a, b) => a.n - b.n)
      .map(({ n, reason }) => {
        const winner = reason.toLowerCase().startsWith('ct_') ? 'CT' : reason.toLowerCase().startsWith('t_') ? 'T' : null
        const mine = this.sideByRound.get(n - 1) ?? null
        return { roundNumber: n - 1, won: winner && mine ? winner === mine : null, reason }
      })
    const finalSide = this.lastSide
    const allyScore = finalSide === 'CT' ? this.ctScore : finalSide === 'T' ? this.tScore : null
    const enemyScore = finalSide === 'CT' ? this.tScore : finalSide === 'T' ? this.ctScore : null
    if (!this.events.length && !rounds.length && !this.lastStats) return null
    return {
      source: 'gsi',
      events: [...this.events],
      rounds,
      stats: this.lastStats ? { ...this.lastStats } : null,
      allyScore,
      enemyScore,
    }
  }

  stop(): void {
    this.recordingStartMs = null
  }
}

/** GSI events as review-timeline rows (killer/victim "You"; the other side is unknown without a demo). */
export function cs2LiveKillsForVod(summary: Cs2LiveSummary | null | undefined): KillEvent[] {
  return (summary?.events ?? []).filter((e) => e.type === 'kill').map((e, i) => liveRow(e, i, 'You', 'Enemy'))
}

export function cs2LiveDeathsForVod(summary: Cs2LiveSummary | null | undefined): KillEvent[] {
  return (summary?.events ?? []).filter((e) => e.type === 'death').map((e, i) => liveRow(e, i, 'Enemy', 'You'))
}

function liveRow(e: Cs2LiveEvent, i: number, killerName: string, victimName: string): KillEvent {
  return {
    EventID: 900_000 + i,
    EventName: 'ChampionKill',
    EventTime: e.videoOffsetMs / 1000,
    killerName,
    victimName,
    assistants: [],
    videoOffsetMs: e.videoOffsetMs,
    round: e.round,
  }
}

/** GSI round results in the review-timeline shape (no plant/defuse info without a demo). */
export function cs2LiveRoundSummariesForVod(summary: Cs2LiveSummary | null | undefined): Array<{ roundNumber: number; winningTeam: 'ALLY' | 'ENEMY' | null; spikePlanted: boolean; spikeDefused: boolean }> {
  return (summary?.rounds ?? []).map((r) => ({
    roundNumber: r.roundNumber,
    winningTeam: r.won == null ? null : r.won ? 'ALLY' : 'ENEMY',
    spikePlanted: false,
    spikeDefused: false,
  }))
}
