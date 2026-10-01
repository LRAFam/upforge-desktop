/** Deterministic CS2 statistics. Never derive measured stats from coaching prose. */
import { parseEvent, parseTicks } from '@laihoe/demoparser2'
import log from 'electron-log'

type Row = Record<string, unknown>
type Metrics = Record<string, number | null>
export interface Cs2MatchStats {
  schema_version: 1
  rounds: number
  score: string
  player_stats: Record<string, number | null | Record<string, number>>
  round_stats: Metrics
  utility_stats: Metrics
  economy_stats: Metrics
}
export interface Cs2StatsInput {
  steamId: string
  tickRate: number
  starts: Row[]
  ends: Row[]
  deaths: Row[]
  hurts: Row[] | null
  fires: Row[] | null
  blinds: Row[] | null
  snapshots: Row[]
}
const num = (r: Row, key: string): number | null =>
  typeof r[key] === 'number' && Number.isFinite(r[key])
    ? (r[key] as number)
    : null
const rounded = (v: number) => Math.round(v * 100) / 100
const mean = (xs: number[]) =>
  xs.length ? rounded(xs.reduce((a, b) => a + b, 0) / xs.length) : null
const ratio = (k: number, d: number) => rounded(k / Math.max(d, 1))
const team = (v: unknown) => (v === 'CT' ? 3 : v === 'T' ? 2 : v)

export function calculateCs2MatchStats(
  input: Cs2StatsInput,
): Cs2MatchStats | null {
  const { steamId, starts, ends, snapshots, tickRate } = input
  // Freeze-end snapshots establish participation and side per round, including side swaps.
  const candidates = starts
    .filter((s) => s.is_warmup_period === false && num(s, 'tick') !== null)
    .map((start, index, all) => {
      const tick = num(start, 'tick')!
      const next =
        index + 1 < all.length ? num(all[index + 1]!, 'tick')! : Infinity
      const end = ends.find(
        (e) =>
          e.is_warmup_period === false &&
          num(e, 'tick')! > tick &&
          num(e, 'tick')! < next,
      )
      const roster = snapshots.filter(
        (s) => s.tick === tick && (s.team_num === 2 || s.team_num === 3),
      )
      const own = roster.find((s) => s.steamid === steamId)
      return { tick, end, roster, own }
    })
    .filter((r) => r.end)
  if (
    candidates.some(
      (r) =>
        r.own?.is_alive !== true ||
        ![2, 3].includes(team(r.end!.winner) as number),
    )
  )
    return null
  const rounds = candidates
  if (!rounds.length) return null
  let kills = 0,
    deaths = 0,
    assists = 0,
    headshots = 0,
    hsKnown = true,
    kast = 0,
    openingKills = 0,
    openingDeaths = 0,
    killRounds = 0,
    zeroImpact = 0,
    won = 0,
    lost = 0,
    clutches = 0,
    clutchWins = 0
  let damage = 0,
    utilityDamage = 0,
    damageKnown = input.hurts !== null,
    flashKnown = input.blinds !== null,
    throwsKnown = input.fires !== null,
    enemyFlashes = 0,
    teamFlashes = 0
  const sideStats: Record<number, { k: number; d: number; rounds: number }> = {
    2: { k: 0, d: 0, rounds: 0 },
    3: { k: 0, d: 0, rounds: 0 },
  }
  const multi: Record<string, number> = {}
  const thrown: Record<string, number> = {
    weapon_smokegrenade: 0,
    weapon_flashbang: 0,
    weapon_molotov: 0,
    weapon_incgrenade: 0,
    weapon_hegrenade: 0,
    weapon_decoy: 0,
  }
  const equipment: Record<number, number[]> = { 2: [], 3: [] }
  let equipmentKnown = true,
    survivalKnown = true,
    sideKnown = true,
    savedKnown = true
  const savedEquipment: number[] = []
  for (const round of rounds) {
    const endTick = num(round.end!, 'tick')!,
      side = round.own!.team_num as number
    sideStats[side]!.rounds++
    const inRound = (e: Row) =>
      e.is_warmup_period === false &&
      num(e, 'tick') !== null &&
      num(e, 'tick')! >= round.tick &&
      num(e, 'tick')! <= endTick
    const events = input.deaths
      .filter(inRound)
      .sort((a, b) => num(a, 'tick')! - num(b, 'tick')!)
    const ownKills = events.filter(
      (e) =>
        e.attacker_steamid === steamId &&
        e.user_steamid !== steamId &&
        e.attacker_team_num !== e.user_team_num,
    )
    const ownDeaths = events.filter((e) => e.user_steamid === steamId)
    const ownAssists = events.filter(
      (e) =>
        e.assister_steamid === steamId &&
        e.attacker_team_num !== e.user_team_num,
    )
    if (
      events.some(
        (e) =>
          ![2, 3].includes(e.user_team_num as number) ||
          (e.attacker_steamid &&
            ![2, 3].includes(e.attacker_team_num as number)),
      )
    )
      sideKnown = false
    kills += ownKills.length
    deaths += ownDeaths.length
    assists += ownAssists.length
    sideStats[side]!.k += ownKills.length
    sideStats[side]!.d += ownDeaths.length
    if (ownKills.length) killRounds++
    if (ownKills.length >= 2)
      multi[String(ownKills.length)] = (multi[String(ownKills.length)] ?? 0) + 1
    for (const e of ownKills) {
      if (typeof e.headshot !== 'boolean') hsKnown = false
      else if (e.headshot) headshots++
    }
    const opening = events.find(
      (e) =>
        e.attacker_steamid &&
        e.attacker_steamid !== e.user_steamid &&
        e.attacker_team_num !== e.user_team_num,
    )
    if (opening?.attacker_steamid === steamId) openingKills++
    if (opening?.user_steamid === steamId) openingDeaths++
    const endOwn = snapshots.find(
      (s) => s.tick === endTick && s.steamid === steamId,
    )
    if (typeof endOwn?.is_alive !== 'boolean') survivalKnown = false
    const survived = endOwn?.is_alive === true
    const carried = endOwn ? num(endOwn, 'current_equip_value') : null
    if (
      typeof endOwn?.is_alive !== 'boolean' ||
      (survived && (carried === null || carried < 0 || carried > 25000))
    )
      savedKnown = false
    else savedEquipment.push(survived ? carried! : 0)
    // A trade means a teammate kills our killer within five seconds in the same round.
    const traded = ownDeaths.some((d) =>
      events.some(
        (e) =>
          e.user_steamid === d.attacker_steamid &&
          e.attacker_steamid !== steamId &&
          e.attacker_team_num === side &&
          num(e, 'tick')! > num(d, 'tick')! &&
          num(e, 'tick')! - num(d, 'tick')! <= 5 * tickRate,
      ),
    )
    if (ownKills.length || ownAssists.length || survived || traded) kast++
    if (!ownKills.length && !ownAssists.length) zeroImpact++
    const winner = team(round.end!.winner)
    if (winner === side) won++
    else if (winner === 2 || winner === 3) lost++
    const alive = new Map(
      round.roster
        .filter((s) => s.is_alive === true)
        .map((s) => [s.steamid, s.team_num]),
    )
    let clutch = false
    for (const e of events) {
      alive.delete(e.user_steamid)
      if (
        alive.has(steamId) &&
        [...alive.values()].filter((t) => t === side).length === 1 &&
        [...alive.values()].some((t) => t !== side)
      )
        clutch = true
    }
    if (clutch) {
      clutches++
      if (winner === side) clutchWins++
    }
    const health = new Map(
      round.roster.map((r) => [r.steamid, num(r, 'health')]),
    )
    for (const e of (input.hurts ?? [])
      .filter(inRound)
      .sort((a, b) => num(a, 'tick')! - num(b, 'tick')!)) {
      const before = health.get(e.user_steamid),
        after = num(e, 'health')
      health.set(e.user_steamid, after)
      if (e.attacker_steamid !== steamId || e.user_steamid === steamId) continue
      if (
        ![2, 3].includes(e.attacker_team_num as number) ||
        ![2, 3].includes(e.user_team_num as number)
      ) {
        damageKnown = false
        continue
      }
      if (e.attacker_team_num === e.user_team_num) continue
      const dmg = num(e, 'dmg_health')
      if (
        dmg === null ||
        dmg < 0 ||
        before == null ||
        after === null ||
        after > before
      ) {
        damageKnown = false
        continue
      }
      // player_hurt includes overkill (e.g. a 160-damage hit on a 30-HP player).
      const dealt = Math.min(dmg, before - after)
      damage += dealt
      if (['hegrenade', 'inferno'].includes(e.weapon as string))
        utilityDamage += dealt
    }
    for (const e of (input.fires ?? []).filter(inRound)) {
      if (e.user_steamid !== steamId) continue
      if (typeof e.weapon !== 'string') throwsKnown = false
      else if (e.weapon in thrown) thrown[e.weapon]++
    }
    for (const e of (input.blinds ?? []).filter(inRound))
      if (e.attacker_steamid === steamId && e.user_steamid !== steamId) {
        const duration = num(e, 'blind_duration')
        if (duration === null) {
          flashKnown = false
          continue
        }
        if (duration <= 0) continue
        if (
          ![2, 3].includes(e.user_team_num as number) ||
          ![2, 3].includes(e.attacker_team_num as number)
        ) {
          flashKnown = false
          continue
        }
        if (e.user_team_num === e.attacker_team_num) teamFlashes++
        else enemyFlashes++
      }
    const value = num(round.own!, 'current_equip_value')
    if (value === null || value < 0 || value > 25000) equipmentKnown = false
    else equipment[side]!.push(value)
  }
  const count = rounds.length
  const values = [...equipment[2]!, ...equipment[3]!]

  return {
    schema_version: 1,
    rounds: count,
    score: `${won}-${lost}`,
    player_stats: {
      multi_kills: multi,
      kills: sideKnown ? kills : null,
      deaths,
      assists: sideKnown ? assists : null,
      kd_ratio: sideKnown ? ratio(kills, deaths) : null,
      adr: damageKnown ? rounded(damage / count) : null,
      headshot_pct:
        hsKnown && sideKnown
          ? kills
            ? rounded((headshots / kills) * 100)
            : 0
          : null,
      kast_pct:
        survivalKnown && sideKnown ? rounded((kast / count) * 100) : null,
      opening_kills: sideKnown ? openingKills : null,
      opening_deaths: sideKnown ? openingDeaths : null,
      clutches_won: sideKnown ? clutchWins : null,
      clutches_attempted: sideKnown ? clutches : null,
    },
    round_stats: {
      rounds_with_kills: sideKnown ? killRounds : null,
      zero_impact_rounds: sideKnown ? zeroImpact : null,
      ct_kd:
        sideKnown && sideStats[3]!.rounds
          ? ratio(sideStats[3]!.k, sideStats[3]!.d)
          : null,
      t_kd:
        sideKnown && sideStats[2]!.rounds
          ? ratio(sideStats[2]!.k, sideStats[2]!.d)
          : null,
    },
    utility_stats: {
      grenades_thrown: throwsKnown
        ? Object.values(thrown).reduce((a, b) => a + b, 0)
        : null,
      smokes_thrown: throwsKnown ? thrown.weapon_smokegrenade! : null,
      flashes_thrown: throwsKnown ? thrown.weapon_flashbang! : null,
      molotovs_thrown: throwsKnown
        ? thrown.weapon_molotov! + thrown.weapon_incgrenade!
        : null,
      he_thrown: throwsKnown ? thrown.weapon_hegrenade! : null,
      enemies_flashed: flashKnown ? enemyFlashes : null,
      teammates_flashed: flashKnown ? teamFlashes : null,
      utility_damage: damageKnown ? utilityDamage : null,
    },
    // These are equipment bands, matching the native demo report thresholds, not inferred buy intent.
    economy_stats: {
      full_buys: equipmentKnown ? values.filter((v) => v >= 4000).length : null,
      force_buys: equipmentKnown
        ? values.filter((v) => v >= 1500 && v < 4000).length
        : null,
      eco_rounds: equipmentKnown ? values.filter((v) => v < 1500).length : null,
      avg_eq_ct: equipmentKnown ? mean(equipment[3]!) : null,
      avg_eq_t: equipmentKnown ? mean(equipment[2]!) : null,
      avg_saved: savedKnown ? mean(savedEquipment) : null,
    },
  }
}

export function extractCs2MatchStats(
  path: string,
  steamId: string,
  tickRate: number,
): Cs2MatchStats | null {
  const read = (event: string): Row[] | null => {
    try {
      const rows = parseEvent(
        path,
        event,
        ['team_num'],
        ['total_rounds_played', 'is_warmup_period'],
      )
      return Array.isArray(rows) ? rows : null
    } catch (error) {
      log.warn(`[CS2Stats] ${event} unavailable`, String(error))
      return null
    }
  }
  const starts = read('round_freeze_end'),
    ends = read('round_end'),
    deaths = read('player_death')
  if (!starts || !ends || !deaths) return null
  const ticks = [
    ...new Set(
      [...starts, ...ends]
        .map((r) => num(r, 'tick'))
        .filter((n): n is number => n !== null),
    ),
  ]
  if (!ticks.length) return null
  let snapshots: Row[]
  try {
    snapshots = parseTicks(
      path,
      ['team_num', 'is_alive', 'health', 'current_equip_value'],
      ticks,
    )
    if (!Array.isArray(snapshots)) return null
  } catch (error) {
    log.warn('[CS2Stats] Round snapshots unavailable', String(error))
    return null
  }
  return calculateCs2MatchStats({
    steamId,
    tickRate,
    starts,
    ends,
    deaths,
    snapshots,
    hurts: read('player_hurt'),
    fires: read('weapon_fire'),
    blinds: read('player_blind'),
  })
}
