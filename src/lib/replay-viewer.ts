/**
 * 2D round viewer: pure helpers over the parsed VALORANT replay (the AI service's compact file, schema 1).
 * Times are replay ms unless named otherwise; positions are world cm.
 */

export interface ReplayPlayer { puuid: string; agent_id: string | null; agent: string; team: 'Red' | 'Blue' | null }
export interface ReplayRound {
  n: number; start_ms: number | null; buy_end_ms: number | null; end_ms: number | null
  attacker: string | null; winner: string | null; result: string | null
  plant_ms: number | null; defuse_ms: number | null; plant_x: number | null; plant_y: number | null
}
export interface ReplayKill { t: number; killer: string | null; victim: string; weapon: string | null; headshot: boolean }
export interface ReplayUtility {
  t0: number; t1: number | null; agent: string; slot: string | null; ability: string | null
  kind: 'smoke' | 'slow' | 'wall' | 'object' | 'projectile' | 'pawn'; x: number | null; y: number | null
  track: [number, number, number][] | null
}
export interface ReplayEffect { t0: number; t1: number; target: string; label: string; source_agent: string | null; ability: string | null }
export interface ReplaySpike { round: number; from_ms: number; to_ms: number | null; carrier: string | null }
export interface CompactReplay {
  schema: number; match_id: string; map: string | null; map_url: string | null
  minimap: { xMultiplier: number; yMultiplier: number; xScalarToAdd: number; yScalarToAdd: number }
  players: ReplayPlayer[]; rounds: ReplayRound[]; kills: ReplayKill[]
  /** puuid → [t, x, y, yaw°, speed cm/s] at 8 per second */
  tracks: Record<string, [number, number, number, number, number][]>
  utility: ReplayUtility[]; effects: ReplayEffect[]; spike: ReplaySpike[]
}

/** World cm → minimap 0..1 (the valorant-api.com displayicon). */
export function toUv(c: CompactReplay, x: number, y: number): { u: number; v: number } {
  const m = c.minimap
  return { u: y * m.xMultiplier + m.xScalarToAdd, v: x * m.yMultiplier + m.yScalarToAdd }
}

/** Direction on the minimap for a world yaw (unit vector in u/v). */
export function yawToUv(c: CompactReplay, yawDeg: number): { du: number; dv: number } {
  const a = (yawDeg * Math.PI) / 180
  return { du: Math.sin(a) * Math.sign(c.minimap.xMultiplier), dv: Math.cos(a) * Math.sign(c.minimap.yMultiplier) }
}

function lastIndexAtOrBefore(times: (i: number) => number, n: number, t: number): number {
  let lo = 0
  let hi = n - 1
  if (n === 0 || times(0) > t) return -1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (times(mid) <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Player state at t, interpolated between the 8 Hz samples (yaw takes the nearer sample). */
export function playerAt(c: CompactReplay, puuid: string, t: number): { x: number; y: number; yaw: number; speed: number } | null {
  const tr = c.tracks[puuid]
  if (!tr?.length) return null
  const i = lastIndexAtOrBefore((k) => tr[k]![0], tr.length, t)
  const first = tr[0]!
  if (i < 0) return { x: first[1], y: first[2], yaw: first[3], speed: first[4] }
  const a = tr[i]!
  const b = tr[i + 1]
  if (!b || b[0] - a[0] > 1000) return { x: a[1], y: a[2], yaw: a[3], speed: a[4] }
  const f = (t - a[0]) / (b[0] - a[0])
  return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, yaw: f < 0.5 ? a[3] : b[3], speed: a[4] }
}

export function roundWindow(r: ReplayRound): { from: number; to: number } {
  const go = r.buy_end_ms ?? r.start_ms ?? 0
  return { from: go - 2000, to: (r.end_ms ?? go + 100_000) + 1500 }
}

export function roundAt(c: CompactReplay, t: number): ReplayRound | null {
  return c.rounds.find((r) => { const w = roundWindow(r); return t >= w.from && t <= w.to }) ?? null
}

/** Round clock text: "1:23" before the plant, spike timer after it. */
export function roundClock(r: ReplayRound, t: number): { text: string; spike: boolean; defused: boolean } {
  const go = r.buy_end_ms ?? r.start_ms ?? 0
  const end = Math.min(t, r.defuse_ms ?? t, r.end_ms ?? t)
  const spike = r.plant_ms != null && end >= r.plant_ms
  const ms = spike ? 45_000 - (end - (r.plant_ms as number)) : 100_000 - Math.max(0, end - go)
  const s = Math.max(0, Math.floor(ms / 1000))
  return { text: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, spike, defused: r.defuse_ms != null && t >= r.defuse_ms }
}

export function deathTime(c: CompactReplay, puuid: string, r: ReplayRound): number | null {
  const w = roundWindow(r)
  return c.kills.find((k) => k.victim === puuid && k.t >= (r.start_ms ?? w.from) && k.t <= w.to)?.t ?? null
}

/** Where the spike is at t: carried (by whom), on the ground, planted or defused. */
export function spikeAt(c: CompactReplay, r: ReplayRound, t: number):
  | { state: 'carried'; carrier: string } | { state: 'planted' | 'defused' | 'loose'; x: number; y: number } | null {
  if (r.plant_ms != null && t >= r.plant_ms && r.plant_x != null && r.plant_y != null) {
    return { state: r.defuse_ms != null && t >= r.defuse_ms ? 'defused' : 'planted', x: r.plant_x, y: r.plant_y }
  }
  const s = c.spike.filter((x) => x.round === r.n && x.from_ms <= t && (x.to_ms ?? Infinity) > t).pop()
  if (!s) return null
  if (s.carrier) return { state: 'carried', carrier: s.carrier }
  // On the ground: where its last carrier dropped it.
  const prev = c.spike.filter((x) => x.round === r.n && x.carrier && (x.to_ms ?? 0) <= s.from_ms).pop()
  const p = prev?.carrier ? playerAt(c, prev.carrier, s.from_ms) : null
  return p ? { state: 'loose', x: p.x, y: p.y } : null
}

/** Position of an ability object at t (moving projectiles/pawns follow their track). */
export function utilityAt(u: ReplayUtility, t: number): { x: number; y: number } | null {
  if (u.track?.length) {
    const i = lastIndexAtOrBefore((k) => u.track![k]![0], u.track.length, t)
    const p = i < 0 ? undefined : u.track[i]
    return p ? { x: p[1], y: p[2] } : null
  }
  if (u.kind === 'projectile') return null
  return u.x != null && u.y != null ? { x: u.x, y: u.y } : null
}

export function utilityVisible(u: ReplayUtility, t: number): boolean {
  const end = u.t1 ?? u.t0 + 8000
  return t >= u.t0 && t <= Math.min(end, u.t0 + (u.kind === 'object' ? 8000 : 60_000))
}

/**
 * Recording ms → replay ms, from kills that are in both (Riot's videoOffsetMs vs the replay's kill time).
 * The median offset is robust to the few seconds of drift in videoOffsetMs. Null when nothing lines up.
 */
export function recordingToReplayOffset(
  riotKills: { killerPuuid?: string; victimPuuid?: string; videoOffsetMs?: number | null }[],
  c: CompactReplay,
): number | null {
  const used = new Set<number>()
  const deltas: number[] = []
  const byPair = new Map<string, number[]>()
  c.kills.forEach((k, i) => {
    const key = `${k.killer}|${k.victim}`
    byPair.set(key, [...(byPair.get(key) ?? []), i])
  })
  for (const k of riotKills) {
    if (typeof k.videoOffsetMs !== 'number') continue
    const cands = (byPair.get(`${k.killerPuuid}|${k.victimPuuid}`) ?? []).filter((i) => !used.has(i))
    const first = cands[0]
    if (first === undefined) continue
    used.add(first)
    deltas.push(c.kills[first]!.t - k.videoOffsetMs)
  }
  if (deltas.length < 3) return null
  deltas.sort((a, b) => a - b)
  return deltas[Math.floor(deltas.length / 2)] ?? null
}

export const AGENT_ICON = (agentId: string) => `https://media.valorant-api.com/agents/${agentId}/displayicon.png`
export const ABILITY_ICON = (agentId: string, slot: string) =>
  `https://media.valorant-api.com/agents/${agentId}/abilities/${slot.toLowerCase()}/displayicon.png`
/** Riot's spike symbol (the Standard game mode icon). */
export const SPIKE_ICON = 'https://media.valorant-api.com/gamemodes/96bd3920-4f36-d026-2b28-c683eb0bcac5/displayicon.png'
