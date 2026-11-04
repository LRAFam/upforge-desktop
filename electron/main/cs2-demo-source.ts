/**
 * Every demoparser2 call the CS2 timeline + stats builders make, behind one small interface.
 *
 * demoparser2 is a synchronous native module: each call reads the whole demo. Run on the Electron
 * main thread, a 5v5 demo blocks every window for seconds. The worker (cs2-demo-parse-worker.ts)
 * runs the fixed plan below off the main thread; the builders then read the cached results.
 *
 * Keep this file free of electron / electron-log imports — the worker bundles it.
 */
import { parseEvent, parseHeader, parsePlayerInfo, parseTicks } from '@laihoe/demoparser2'

type Row = Record<string, unknown>

export interface Cs2DemoSource {
  header(): unknown
  playerInfo(): unknown
  /** Same argument order as demoparser2 parseEvent(path, event, playerExtra, otherExtra). */
  event(name: string, playerExtra: string[], otherExtra: string[]): unknown
  ticks(props: string[], ticks: number[]): unknown
}

export type Cs2DemoBundleEntry = { ok: true; value: unknown } | { ok: false; error: string }
export type Cs2DemoBundle = Record<string, Cs2DemoBundleEntry>

export const HEADER_KEY = 'header'
export const PLAYER_INFO_KEY = 'playerInfo'

export function eventKey(name: string, playerExtra: string[], otherExtra: string[]): string {
  return `event:${name}|${playerExtra.join(',')}|${otherExtra.join(',')}`
}

export function ticksKey(props: string[], ticks: number[]): string {
  return `ticks:${props.join(',')}|${ticks.join(',')}`
}

const TIMELINE_ROUND = ['total_rounds_played']
const LIVE_ROUND = ['total_rounds_played', 'is_warmup_period']
const STATS_TEAM = ['team_num']
const STATS_ROUND = LIVE_ROUND

/**
 * player_death for the timeline. demoparser2 prefixes player props (X → user_X / attacker_X) and
 * returns the event's own fields (distance, thrusmoke, attackerblind, assistedflash…) by default.
 */
export const CS2_TIMELINE_DEATH_FIELDS = { playerExtra: ['X', 'Y', 'team_num', 'last_place_name'], otherExtra: LIVE_ROUND } as const

/** parseEvent calls made by buildCs2TimelineFromDemo. */
export const CS2_TIMELINE_EVENTS: ReadonlyArray<[string, string[], string[]]> = [
  ['player_death', [...CS2_TIMELINE_DEATH_FIELDS.playerExtra], [...CS2_TIMELINE_DEATH_FIELDS.otherExtra]],
  ['round_end', ['reason', 'round_win_reason'], LIVE_ROUND],
  ['round_start', [], TIMELINE_ROUND],
  ['round_freeze_end', [], TIMELINE_ROUND],
  // Valve's place name for the planter ("BombsiteA") names the site; the event's `site` is an entity id.
  ['bomb_planted', ['last_place_name'], TIMELINE_ROUND],
  ['bomb_defused', [], TIMELINE_ROUND],
  ['bomb_exploded', [], TIMELINE_ROUND],
]

export const CS2_STATS_EVENT_FIELDS = { playerExtra: STATS_TEAM, otherExtra: STATS_ROUND } as const

/** parseEvent calls made by extractCs2MatchStats. */
export const CS2_STATS_EVENTS = [
  'round_freeze_end', 'round_end', 'player_death', 'player_hurt', 'weapon_fire', 'player_blind',
] as const

export const CS2_STATS_TICK_PROPS = ['team_num', 'is_alive', 'health', 'current_equip_value', 'balance']

/** Extra parseEvent calls for the per-round facts (read with the stats fields). */
export const CS2_FACT_EVENTS = ['grenade_thrown', 'flashbang_detonate'] as const

/** flash_duration either side of each flashbang detonation: who it blinded (many demos have no player_blind). */
export const CS2_FLASH_TICK_PROPS = ['flash_duration']
/** Everyone's position at each live death tick: teammates near the player when they died. */
export const CS2_DEATH_TICK_PROPS = ['X', 'Y', 'team_num', 'is_alive']

const finiteTick = (r: Row): number | null =>
  typeof r.tick === 'number' && Number.isFinite(r.tick) ? r.tick : null

/** Ticks one before and one after every flashbang detonation. */
export function cs2FlashSampleTicks(detonations: Row[]): number[] {
  const out = new Set<number>()
  for (const d of detonations) {
    const t = finiteTick(d)
    if (t == null) continue
    out.add(Math.trunc(t) - 1)
    out.add(Math.trunc(t) + 1)
  }
  return [...out].filter(t => t >= 0).sort((a, b) => a - b)
}

/** Ticks of every non-warmup player_death. */
export function cs2DeathTicks(deaths: Row[]): number[] {
  return [...new Set(
    deaths.filter(d => d.is_warmup_period !== true).map(finiteTick).filter((t): t is number => t != null),
  )].sort((a, b) => a - b)
}

/** Ticks extractCs2MatchStats snapshots: every round_freeze_end + round_end tick, deduplicated. */
export function cs2StatsSnapshotTicks(starts: Row[], ends: Row[]): number[] {
  return [
    ...new Set(
      [...starts, ...ends]
        .map((r) => (typeof r.tick === 'number' && Number.isFinite(r.tick) ? r.tick : null))
        .filter((n): n is number => n !== null),
    ),
  ]
}

/** Direct native calls (main thread). Used by tests and when no worker can be started. */
export function nativeCs2DemoSource(pathOrBuf: string | Buffer): Cs2DemoSource {
  return {
    header: () => parseHeader(pathOrBuf),
    playerInfo: () => parsePlayerInfo(pathOrBuf),
    event: (name, playerExtra, otherExtra) => parseEvent(pathOrBuf, name, playerExtra, otherExtra),
    ticks: (props, ticks) => parseTicks(pathOrBuf, props, ticks),
  }
}

/** Run the full plan against a source (the worker calls this with the native source). */
export function collectCs2DemoBundle(source: Cs2DemoSource): Cs2DemoBundle {
  const bundle: Cs2DemoBundle = {}
  const run = (key: string, fn: () => unknown): unknown => {
    if (bundle[key]) {
      const hit = bundle[key]!
      return hit.ok ? hit.value : undefined
    }
    try {
      const value = fn()
      bundle[key] = { ok: true, value }
      return value
    } catch (err) {
      bundle[key] = { ok: false, error: err instanceof Error ? err.message : String(err) }
      return undefined
    }
  }
  run(HEADER_KEY, () => source.header())
  run(PLAYER_INFO_KEY, () => source.playerInfo())
  for (const [name, playerExtra, otherExtra] of CS2_TIMELINE_EVENTS) {
    run(eventKey(name, playerExtra, otherExtra), () => source.event(name, playerExtra, otherExtra))
  }
  const statsRows: Record<string, unknown> = {}
  for (const name of CS2_STATS_EVENTS) {
    const { playerExtra, otherExtra } = CS2_STATS_EVENT_FIELDS
    statsRows[name] = run(eventKey(name, [...playerExtra], [...otherExtra]), () => source.event(name, [...playerExtra], [...otherExtra]))
  }
  for (const name of CS2_FACT_EVENTS) {
    const { playerExtra, otherExtra } = CS2_STATS_EVENT_FIELDS
    statsRows[name] = run(eventKey(name, [...playerExtra], [...otherExtra]), () => source.event(name, [...playerExtra], [...otherExtra]))
  }
  const starts = statsRows.round_freeze_end
  const ends = statsRows.round_end
  if (Array.isArray(starts) && Array.isArray(ends)) {
    const ticks = cs2StatsSnapshotTicks(starts as Row[], ends as Row[])
    if (ticks.length) run(ticksKey(CS2_STATS_TICK_PROPS, ticks), () => source.ticks(CS2_STATS_TICK_PROPS, ticks))
  }
  const detonations = statsRows.flashbang_detonate
  if (Array.isArray(detonations)) {
    const ticks = cs2FlashSampleTicks(detonations as Row[])
    if (ticks.length) run(ticksKey(CS2_FLASH_TICK_PROPS, ticks), () => source.ticks(CS2_FLASH_TICK_PROPS, ticks))
  }
  const deathFields = CS2_TIMELINE_DEATH_FIELDS
  const deaths = bundle[eventKey('player_death', [...deathFields.playerExtra], [...deathFields.otherExtra])]
  if (deaths?.ok && Array.isArray(deaths.value)) {
    const ticks = cs2DeathTicks(deaths.value as Row[])
    if (ticks.length) run(ticksKey(CS2_DEATH_TICK_PROPS, ticks), () => source.ticks(CS2_DEATH_TICK_PROPS, ticks))
  }
  return bundle
}

/** Reads a worker bundle. A call the plan did not cover throws, like a failed native call would. */
export function cachedCs2DemoSource(bundle: Cs2DemoBundle): Cs2DemoSource {
  const read = (key: string): unknown => {
    const entry = bundle[key]
    if (!entry) throw new Error(`demo call not in worker plan: ${key}`)
    if (!entry.ok) throw new Error(entry.error)
    return entry.value
  }
  return {
    header: () => read(HEADER_KEY),
    playerInfo: () => read(PLAYER_INFO_KEY),
    event: (name, playerExtra, otherExtra) => read(eventKey(name, playerExtra, otherExtra)),
    ticks: (props, ticks) => read(ticksKey(props, ticks)),
  }
}
