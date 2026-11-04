/**
 * Per-round CS2 facts from demo rows, for the coach's round lines. Desktop port of the AI service's
 * services/cs2_round_facts.py (annotate_round, blind_at, flash_hits_from_samples, mark_pistol_rounds)
 * and the per-death trade rule in services/cs2_match_stats_v1.py — same thresholds, same field names,
 * so desktop-VOD and web-demo coaching say the same thing.
 *
 * Everything is measured; anything the demo didn't give stays absent (never 0, never guessed).
 * No buy intent ("eco", "force"): only money and equipment values.
 *
 * Not measured on the desktop: `firstShot` (needs every player's position at every shot tick).
 *
 * Pure: no parser, no electron.
 */
import { CS2_TRADE_AFTER_DEATH_MS } from './spatial/trade-flags'

type Row = Record<string, unknown>

export const OPENING_UTILITY_S = 5.0
/** Less flash than this left at death is not called "blinded". */
export const MIN_BLIND_S = 0.5
export const PISTOL_MAX_EQUIPMENT = 1000
/** Teammates within this many world units (~25 m, the Valorant trade radius) count as nearby. */
export const CS2_ALLY_NEARBY_UNITS = 1000
const GRENADES = new Set(['flashbang', 'smokegrenade', 'molotov', 'incgrenade', 'hegrenade', 'decoy'])

export type Cs2BlindFact = { seconds: number; by?: 'enemy' | 'teammate' | 'self' | 'unknown' }

/** Facts added to a local-player kill or death (KillEvent keys). */
export interface Cs2EventFacts {
  alive?: string
  afterPlant?: true
  roundTime?: number
  distance?: number
  thruSmoke?: true
  attackerBlind?: true
  assistedFlash?: true
  /** Deaths only. */
  blind?: Cs2BlindFact
  /** Deaths only: a teammate killed the killer within CS2_TRADE_AFTER_DEATH_MS. */
  traded?: boolean
  /** Deaths only: living teammates (excl. the player) just before the death. */
  alliesAlive?: number
  /** Deaths only: living teammates within CS2_ALLY_NEARBY_UNITS at the death tick. */
  alliesNearby?: number
}

/** Facts added to a roundSummaries entry. */
export interface Cs2RoundSummaryFacts {
  side?: 'CT' | 'T'
  pistolRound?: true
  equipment?: { you: number; team: number; enemy: number }
  money?: { you: number; team: number; enemy: number }
  lastAliveVs?: number
  lastAliveAfterPlant?: true
  openingUtility?: Record<string, number>
  /** Internal (not sent): the player's team number this round and the round winner's (2 T / 3 CT). */
  sideTeam?: 2 | 3
  winnerTeam?: 2 | 3
}

export interface Cs2FlashHit { tick: number; thrower_steamid: unknown; steamid: unknown; duration: number }

export interface Cs2RoundFactsInput {
  steamId: string
  tickRate: number
  /** round_freeze_end rows (with is_warmup_period). */
  starts: Row[]
  /** round_end rows (with is_warmup_period). */
  ends: Row[]
  /** player_death rows with *_team_num, distance, thrusmoke…; any order. */
  deaths: Row[]
  /** Freeze-end / round-end tick rows: steamid, team_num, is_alive, current_equip_value, balance. */
  snapshots: Row[]
  /** bomb_planted rows; [] when none. */
  plants: Row[]
  /** grenade_thrown rows, null when unreadable. */
  grenades: Row[] | null
  /** Flashes that hit players, null when unreadable. */
  flashHits: Cs2FlashHit[] | null
  /** X/Y/team_num/is_alive of every player at each death tick, null when unreadable. */
  deathPositions: Row[] | null
}

/** Flash seconds at or above this count as "flashed" (AI service FLASH_COUNT_MIN_S). */
export const FLASH_COUNT_MIN_S = 1.0

export interface Cs2PlayerFlashes {
  thrown: number
  enemies: number
  teammates: number
  min_seconds: number
  /** Mean flash seconds on enemies the player blinded (≥ min_seconds); absent with none. */
  enemy_seconds_avg?: number
}

export interface Cs2RoundFactsResult {
  /** The player's flashes over live rounds: needs flash hits (counts) and grenade_thrown (thrown). */
  flashCounts: { enemies: number; teammates: number } | null
  playerFlashes: Cs2PlayerFlashes | null
  /** Index = live round number (0-based). */
  rounds: Cs2RoundSummaryFacts[]
  /** Facts per player_death row (by identity) for the local player's kills and deaths. */
  events: Map<Row, Cs2EventFacts>
}

const num = (r: Row | undefined, key: string): number | null => {
  const v = r?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
const round1 = (v: number) => Math.round(v * 10) / 10
const weaponKey = (name: unknown): string => {
  const s = String(name ?? '').trim().toLowerCase()
  return s.startsWith('weapon_') ? s.slice('weapon_'.length) : s
}

const PLACE_ALIASES: Record<string, string> = { bombsitea: 'A site', bombsiteb: 'B site', ctspawn: 'CT spawn', tspawn: 'T spawn' }

/** Valve's navmesh place name (`last_place_name`) as a readable callout ("LongA" → "Long A"), or null. */
export function humanizeCs2Place(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const s = raw.trim()
  return PLACE_ALIASES[s.toLowerCase()] ?? s.replace(/(?<=[a-z0-9])(?=[A-Z])/g, ' ')
}

/** Who each flash blinded: flash_duration changed between the tick before and after detonation. */
export function flashHitsFromSamples(detonations: Row[], samples: Row[]): Cs2FlashHit[] {
  const byTick = new Map<unknown, Map<unknown, unknown>>()
  for (const r of samples) {
    if (!byTick.has(r.tick)) byTick.set(r.tick, new Map())
    byTick.get(r.tick)!.set(r.steamid, r.flash_duration)
  }
  const hits: Cs2FlashHit[] = []
  for (const d of detonations) {
    const t = num(d, 'tick')
    if (t == null) continue
    const tick = Math.trunc(t)
    const before = byTick.get(tick - 1) ?? new Map()
    const after = byTick.get(tick + 1) ?? new Map()
    for (const [sid, dur] of after) {
      const prev = before.get(sid)
      const prevNum = typeof prev === 'number' && Number.isFinite(prev) ? prev : 0
      if (typeof dur === 'number' && Number.isFinite(dur) && dur > 0 && Math.abs(dur - prevNum) > 0.01) {
        hits.push({ tick, thrower_steamid: d.user_steamid, steamid: sid, duration: Math.round(dur * 100) / 100 })
      }
    }
  }
  return hits
}

/** Flash left on a player at `tick`, from the latest flash that hit them, or null. */
export function blindAt(
  hits: Cs2FlashHit[], steamId: unknown, tick: number, tickRate: number, teamOf: Map<unknown, unknown>,
): Cs2BlindFact | null {
  let latest: Cs2FlashHit | null = null
  for (const h of hits) {
    if (h.steamid !== steamId || !(h.tick <= tick)) continue
    if (!latest || h.tick > latest.tick) latest = h
  }
  if (!latest) return null
  const left = (latest.duration || 0) - (tick - latest.tick) / tickRate
  if (left < MIN_BLIND_S) return null
  const thrower = latest.thrower_steamid
  const throwerTeam = teamOf.get(thrower)
  const by: Cs2BlindFact['by'] = thrower === steamId
    ? 'self'
    : throwerTeam != null && throwerTeam === teamOf.get(steamId)
      ? 'teammate'
      : throwerTeam != null ? 'enemy' : 'unknown'
  return { seconds: round1(left), by }
}

/** Pistol rounds: first round and first round after the side switch, only when own equipment ≤ $1,000. */
export function markPistolRounds(summaries: Cs2RoundSummaryFacts[]): void {
  const pistolMoney = (s: Cs2RoundSummaryFacts) => typeof s.equipment?.you === 'number' && s.equipment.you <= PISTOL_MAX_EQUIPMENT
  if (!summaries.length) return
  const first = summaries[0]!.side
  if (first && pistolMoney(summaries[0]!)) summaries[0]!.pistolRound = true
  for (const s of summaries.slice(1)) {
    if (first && s.side && s.side !== first) {
      if (pistolMoney(s)) s.pistolRound = true
      break
    }
  }
}

function teamTotals(roster: Row[], steamId: string, side: number, key: string): { you: number; team: number; enemy: number } | undefined {
  const own = roster.find(r => r.steamid === steamId)
  const ownValue = num(own, key)
  if (!roster.length || ownValue == null) return undefined
  if (!roster.every(r => num(r, key) != null)) return undefined
  const sum = (pred: (t: unknown) => boolean) => roster.filter(r => pred(r.team_num)).reduce((a, r) => a + num(r, key)!, 0)
  return {
    you: Math.trunc(ownValue),
    team: Math.trunc(sum(t => t === side)),
    enemy: Math.trunc(sum(t => (t === 2 || t === 3) && t !== side)),
  }
}

/** Measured round facts for the local player (steamId). */
export function buildCs2RoundFacts(input: Cs2RoundFactsInput): Cs2RoundFactsResult {
  const { steamId, tickRate } = input
  const events = new Map<Row, Cs2EventFacts>()
  const rounds: Cs2RoundSummaryFacts[] = []
  const live = input.starts.filter(s => s.is_warmup_period === false && num(s, 'tick') != null)
  const tradeWindow = (CS2_TRADE_AFTER_DEATH_MS / 1000) * tickRate
  let thrown = 0, enemies = 0, teammates = 0
  const enemySeconds: number[] = []

  const positionsAt = new Map<unknown, Row[]>()
  for (const r of input.deathPositions ?? []) {
    if (!positionsAt.has(r.tick)) positionsAt.set(r.tick, [])
    positionsAt.get(r.tick)!.push(r)
  }

  live.forEach((start, index) => {
    const tick = num(start, 'tick')!
    const next = index + 1 < live.length ? num(live[index + 1], 'tick')! : Infinity
    const end = input.ends.find(e => e.is_warmup_period === false && num(e, 'tick') != null && num(e, 'tick')! > tick && num(e, 'tick')! < next)
    if (!end) return
    const endTick = num(end, 'tick')!
    const inRound = (e: Row) => {
      const t = num(e, 'tick')
      return t != null && t >= tick && t <= endTick && e.is_warmup_period !== true
    }
    const roster = input.snapshots.filter(s => s.tick === tick)
    const teamOf = new Map<unknown, unknown>()
    for (const r of roster) if (r.steamid) teamOf.set(r.steamid, r.team_num)
    const side = teamOf.get(steamId)
    const summary: Cs2RoundSummaryFacts = {}
    rounds.push(summary)
    if (side !== 2 && side !== 3) return
    summary.side = side === 2 ? 'T' : 'CT'
    summary.sideTeam = side
    const winner = end.winner === 'CT' || end.winner === 3 ? 3 : end.winner === 'T' || end.winner === 2 ? 2 : null
    if (winner) summary.winnerTeam = winner
    const equipment = teamTotals(roster, steamId, side, 'current_equip_value')
    if (equipment) summary.equipment = equipment
    const money = teamTotals(roster.filter(r => r.team_num === 2 || r.team_num === 3), steamId, side, 'balance')
    if (money) summary.money = money

    if (input.flashHits) {
      for (const h of input.flashHits) {
        if (h.tick < tick || h.tick > endTick || h.thrower_steamid !== steamId || h.steamid === steamId) continue
        if (!(h.duration >= FLASH_COUNT_MIN_S)) continue
        if (teamOf.get(h.steamid) === side) teammates++
        else {
          enemies++
          enemySeconds.push(h.duration)
        }
      }
    }
    if (input.grenades) {
      thrown += input.grenades.filter(g => inRound(g) && g.user_steamid === steamId && weaponKey(g.weapon) === 'flashbang').length
    }

    const plant = input.plants.filter(inRound).sort((a, b) => num(a, 'tick')! - num(b, 'tick')!)[0]
    const plantTick = plant ? num(plant, 'tick') : null
    const roundEvents = input.deaths.filter(inRound).sort((a, b) => num(a, 'tick')! - num(b, 'tick')!)

    const aliveFlags = new Map<unknown, unknown>()
    for (const r of roster) aliveFlags.set(r.steamid, r.is_alive)
    const alive = new Set<unknown>(
      [...teamOf.entries()].filter(([sid, t]) => (t === 2 || t === 3) && aliveFlags.get(sid) !== false).map(([sid]) => sid),
    )
    const counts = () => {
      let us = 0, them = 0
      for (const sid of alive) {
        const t = teamOf.get(sid)
        if (t === side) us++
        else if (t != null) them++
      }
      return { us, them }
    }

    for (const e of roundEvents) {
      const t = num(e, 'tick')!
      const victim = e.user_steamid
      const attacker = e.attacker_steamid
      const { us, them } = counts()
      const isKill = attacker === steamId && victim !== steamId && e.attacker_team_num !== e.user_team_num
      const isDeath = victim === steamId
      if (isKill || isDeath) {
        const fact: Cs2EventFacts = { alive: `${us}v${them}` }
        if (plantTick != null && t > plantTick) fact.afterPlant = true
        fact.roundTime = round1((t - tick) / tickRate)
        const distance = num(e, 'distance')
        if (distance != null && distance >= 0) fact.distance = round1(distance)
        if (e.thrusmoke === true) fact.thruSmoke = true
        if (e.attackerblind === true) fact.attackerBlind = true
        if (e.assistedflash === true) fact.assistedFlash = true
        if (isDeath) {
          if (input.flashHits) fact.blind = blindAt(input.flashHits, steamId, t, tickRate, teamOf) ?? { seconds: 0 }
          if (attacker) {
            fact.traded = roundEvents.some(x =>
              x.user_steamid === attacker
              && x.attacker_steamid != null && x.attacker_steamid !== steamId
              && x.attacker_team_num === side
              && num(x, 'tick')! - t > 0 && num(x, 'tick')! - t <= tradeWindow)
          }
          fact.alliesAlive = Math.max(0, us - 1)
          const vx = num(e, 'user_X'), vy = num(e, 'user_Y')
          const around = positionsAt.get(e.tick)
          if (input.deathPositions && around?.length && vx != null && vy != null) {
            fact.alliesNearby = around.filter(p =>
              p.steamid !== steamId && p.team_num === side && p.is_alive === true
              && num(p, 'X') != null && num(p, 'Y') != null
              && Math.hypot(num(p, 'X')! - vx, num(p, 'Y')! - vy) <= CS2_ALLY_NEARBY_UNITS).length
          }
        }
        events.set(e, fact)
      }
      alive.delete(victim)
      const after = counts()
      if (summary.lastAliveVs == null && alive.has(steamId) && after.us === 1 && after.them > 0) {
        summary.lastAliveVs = after.them
        if (plantTick != null && t > plantTick) summary.lastAliveAfterPlant = true
      }
    }

    const opening = roundEvents.find(e => e.attacker_steamid && e.attacker_steamid !== e.user_steamid && e.attacker_team_num !== e.user_team_num)
    if (opening && (opening.attacker_steamid === steamId || opening.user_steamid === steamId) && input.grenades) {
      const t = num(opening, 'tick')!
      const lo = t - OPENING_UTILITY_S * tickRate
      const thrown: Record<string, number> = {}
      for (const g of input.grenades) {
        const gt = num(g, 'tick')
        let name = weaponKey(g.weapon)
        if (gt == null || gt < lo || gt > t || teamOf.get(g.user_steamid) !== side || !GRENADES.has(name)) continue
        if (name === 'incgrenade') name = 'molotov'
        thrown[name] = (thrown[name] ?? 0) + 1
      }
      summary.openingUtility = thrown
    }
  })
  markPistolRounds(rounds)
  const flashCounts = input.flashHits ? { enemies, teammates } : null
  let playerFlashes: Cs2PlayerFlashes | null = null
  if (flashCounts && input.grenades) {
    playerFlashes = { thrown, enemies, teammates, min_seconds: FLASH_COUNT_MIN_S }
    if (enemySeconds.length) playerFlashes.enemy_seconds_avg = round1(enemySeconds.reduce((a, b) => a + b, 0) / enemySeconds.length)
  }
  return { rounds, events, flashCounts, playerFlashes }
}
