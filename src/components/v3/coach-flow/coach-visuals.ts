/**
 * Visual data for the coach flow (report, key moments, round review), built only from match data
 * we already have: round summaries, every player's kill events, Riot's position snapshots
 * (roundReplay) and the final scoreboard. Nothing is guessed: no positions → no map, no kill list
 * for a round → no timeline.
 *
 * Rounds are shown 1-based (R1 = Riot round 0); roundReplay `r` and kill `round` are 0-based.
 */
import { buildValorantMatchView, type BuyBand, type ValorantTimelineLike } from '../matchpage/valorant/valorant-match-view'

type Rec = Record<string, unknown>
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

// ── Rounds ──────────────────────────────────────────────────────────────────────────────────────

export interface RoundCell {
  /** 1-based round on screen. */
  round: number
  result: 'won' | 'lost' | 'unknown'
  buy: BuyBand | null
  /** Your opening duel this round, if the first kill involved you. */
  opening: 'won' | 'lost' | null
  kills: number | null
  deaths: number | null
  planted: boolean
  marked: boolean
}

/** One cell per round, with the rounds the coach looked at marked. */
export function roundCells(md: Rec | null | undefined, markedRounds: number[] = []): RoundCell[] {
  const view = buildValorantMatchView({ ...(md as ValorantTimelineLike), game: 'valorant' })
  if (!view) return []
  const marked = new Set(markedRounds)
  return view.roundRows.map((r) => ({
    round: r.round + 1,
    result: r.result,
    buy: r.buy,
    opening: r.opening,
    kills: r.kills,
    deaths: r.deaths,
    planted: !!r.plant,
    marked: marked.has(r.round + 1),
  }))
}

// ── Players, kills, positions ───────────────────────────────────────────────────────────────────

interface ReplayPlayer { puuid?: string; team?: string; agent?: string | null; name?: string }
interface ReplayPos { i: number; x: number; y: number; alive?: boolean | null }
interface ReplayFrame { k?: string; t?: number | null; v?: number; rt?: number; label?: string; p?: ReplayPos[]; spike?: { x: number; y: number } }
interface ReplayRound { r: number; frames?: ReplayFrame[]; endMs?: number | null }
interface Replay { map?: string; players?: ReplayPlayer[]; rounds?: ReplayRound[]; ownPlayerIndex?: number }
interface KillEvent {
  round?: number
  killerPuuid?: string
  victimPuuid?: string
  killerAgent?: string
  victimAgent?: string
  weapon?: string
  videoOffsetMs?: number
  spatial?: { norm?: { x?: number; y?: number }; callout?: string; killerCallout?: string; killerDistance?: number }
}

function replayOf(md: Rec | null | undefined): Replay | null {
  const r = md?.roundReplay as Replay | undefined
  return r && Array.isArray(r.players) && Array.isArray(r.rounds) ? r : null
}

function killsOf(md: Rec | null | undefined): KillEvent[] {
  const k = md?.killEvents
  return Array.isArray(k) ? (k as KillEvent[]) : []
}

/** Your puuid and team, from the match data (falls back to the replay's own-player index). */
function you(md: Rec | null | undefined): { puuid: string | null; team: string | null } {
  const replay = replayOf(md)
  const own = replay && typeof replay.ownPlayerIndex === 'number' ? replay.players?.[replay.ownPlayerIndex] : undefined
  const puuid = str(md?.puuid) ?? str(own?.puuid)
  const fs = md?.finalStats as Rec | undefined
  const team = str(fs?.team) ?? str(own?.team) ?? null
  return { puuid, team }
}

export type Who = 'you' | 'ally' | 'enemy'
export type Outcome = 'kill' | 'death' | 'trade' | 'teammate'

export interface MapPoint { x: number; y: number; who: Who; agent: string | null; alive: boolean | null; role: 'killer' | 'victim' | null }
export interface MomentSnapshot {
  map: string
  round: number
  /** Ms into the round, when Riot reported it. */
  roundMs: number | null
  /** Recording time of this snapshot (pairs with roundMs to turn any recording time into round time). */
  videoMs: number
  points: MapPoint[]
  /** Killer → victim, in the same normalised space as the points. */
  line: { from: { x: number; y: number }; to: { x: number; y: number }; outcome: Outcome } | null
  callout: string | null
  outcome: Outcome | null
  weapon: string | null
  /** e.g. "Chamber killed you" — built from the kill event, in words. */
  caption: string | null
}

const near = (a: number | undefined, b: number, tol: number) => typeof a === 'number' && Math.abs(a - b) <= tol

function outcomeFor(k: KillEvent, me: string | null, myTeam: string | null, teamOf: (p?: string) => string | null): Outcome {
  if (me && k.killerPuuid === me) return 'kill'
  if (me && k.victimPuuid === me) return 'death'
  const victimTeam = teamOf(k.victimPuuid)
  return myTeam && victimTeam && victimTeam !== myTeam ? 'trade' : 'teammate'
}

/**
 * Positions at the kill nearest to `videoMs` in that round (within 4 s), from Riot's snapshot of
 * every player at that kill. Null when the round has no snapshot or fewer than 2 positions.
 */
export function momentSnapshot(md: Rec | null | undefined, round: number, videoMs: number): MomentSnapshot | null {
  const replay = replayOf(md)
  const r = replay?.rounds?.find(x => x.r === round - 1)
  if (!replay || !r?.frames?.length) return null
  const framed = r.frames.filter(f => typeof f.v === 'number' && Array.isArray(f.p) && f.p.length >= 2)
  if (!framed.length) return null
  const frame = framed.reduce((best, f) => (Math.abs((f.v as number) - videoMs) < Math.abs((best.v as number) - videoMs) ? f : best))
  if (!near(frame.v, videoMs, 4000)) return null

  const players = replay.players ?? []
  const { puuid: me, team: myTeam } = you(md)
  const teamOf = (p?: string) => (p ? players.find(x => x.puuid === p)?.team ?? null : null)
  const idxOf = (p?: string) => (p ? players.findIndex(x => x.puuid === p) : -1)
  const kill = frame.k === 'kill'
    ? killsOf(md).find(k => k.round === round - 1 && near(k.videoOffsetMs, frame.v as number, 250)) ?? null
    : null
  const killer = kill ? idxOf(kill.killerPuuid) : -1
  const victim = kill ? idxOf(kill.victimPuuid) : -1

  const points: MapPoint[] = (frame.p ?? []).map((p) => {
    const pl = players[p.i]
    const who: Who = pl?.puuid && pl.puuid === me ? 'you' : pl?.team && myTeam && pl.team === myTeam ? 'ally' : 'enemy'
    return { x: p.x, y: p.y, who, agent: pl?.agent ?? null, alive: p.alive ?? null, role: p.i === killer ? 'killer' : p.i === victim ? 'victim' : null }
  })

  // Riot leaves the victim out of the after-kill snapshot; the kill event carries where they fell.
  const vNorm = kill?.spatial?.norm
  if (kill && victim >= 0 && !points.some(p => p.role === 'victim') && typeof vNorm?.x === 'number' && typeof vNorm?.y === 'number') {
    const pl = players[victim]
    const who: Who = pl?.puuid === me ? 'you' : pl?.team && myTeam && pl.team === myTeam ? 'ally' : 'enemy'
    points.push({ x: vNorm.x, y: vNorm.y, who, agent: pl?.agent ?? null, alive: false, role: 'victim' })
  }
  const from = points.find(p => p.role === 'killer')
  const to = points.find(p => p.role === 'victim')
  const outcome = kill ? outcomeFor(kill, me, myTeam, teamOf) : null
  const name = (p: string | undefined, agent: string | undefined) => (p && p === me ? 'you' : agent ?? 'someone')
  const caption = kill
    ? `${name(kill.killerPuuid, kill.killerAgent).replace(/^you$/, 'You')} killed ${name(kill.victimPuuid, kill.victimAgent)}`
    : frame.k === 'plant' ? 'Spike planted' : frame.k === 'defuse' ? 'Spike defused' : null

  return {
    map: str(replay.map) ?? str(md?.map) ?? '',
    round,
    roundMs: num(frame.rt),
    videoMs: frame.v as number,
    points,
    line: from && to && outcome ? { from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, outcome } : null,
    callout: str(kill?.spatial?.callout),
    outcome,
    weapon: str(kill?.weapon),
    caption,
  }
}

// ── Round timeline ──────────────────────────────────────────────────────────────────────────────

export interface RoundMark { ms: number; kind: 'your-kill' | 'your-death' | 'ally-down' | 'enemy-down' | 'plant' | 'defuse'; label: string; videoMs: number | null }
export interface RoundTimeline {
  round: number
  /** Last known moment of the round, ms since round start. */
  durationMs: number
  /** Players alive after each event, starting 5v5. */
  alive: Array<{ ms: number; allies: number; enemies: number }>
  marks: RoundMark[]
}

/** Alive counts and events for one round, from every player's kills and Riot's round clock. */
export function roundTimeline(md: Rec | null | undefined, round: number): RoundTimeline | null {
  const replay = replayOf(md)
  const r = replay?.rounds?.find(x => x.r === round - 1)
  const frames = (r?.frames ?? []).filter(f => typeof f.rt === 'number')
  if (!replay || !frames.length) return null
  const players = replay.players ?? []
  const { puuid: me, team: myTeam } = you(md)
  if (!myTeam) return null
  const teamOf = (p?: string) => (p ? players.find(x => x.puuid === p)?.team ?? null : null)
  const kills = killsOf(md).filter(k => k.round === round - 1)

  let allies = 5
  let enemies = 5
  const alive: RoundTimeline['alive'] = [{ ms: 0, allies, enemies }]
  const marks: RoundMark[] = []
  for (const f of [...frames].sort((a, b) => (a.rt as number) - (b.rt as number))) {
    const ms = f.rt as number
    const videoMs = num(f.v)
    if (f.k === 'plant' || f.k === 'defuse') {
      marks.push({ ms, kind: f.k, label: f.k === 'plant' ? 'Spike planted' : 'Spike defused', videoMs })
      continue
    }
    if (f.k !== 'kill') continue
    const k = videoMs == null ? undefined : kills.find(x => near(x.videoOffsetMs, videoMs, 250))
    if (!k) continue
    const victimTeam = teamOf(k.victimPuuid)
    if (victimTeam === myTeam) allies = Math.max(0, allies - 1)
    else if (victimTeam) enemies = Math.max(0, enemies - 1)
    alive.push({ ms, allies, enemies })
    if (me && k.killerPuuid === me) marks.push({ ms, kind: 'your-kill', label: `You killed ${k.victimAgent ?? 'an enemy'}`, videoMs })
    else if (me && k.victimPuuid === me) marks.push({ ms, kind: 'your-death', label: `${k.killerAgent ?? 'An enemy'} killed you`, videoMs })
    else marks.push({ ms, kind: victimTeam === myTeam ? 'ally-down' : 'enemy-down', label: `${k.killerAgent ?? '?'} killed ${k.victimAgent ?? '?'}`, videoMs })
  }
  const last = Math.max(...frames.map(f => f.rt as number))
  const durationMs = Math.max(num(r?.endMs) ?? 0, last + 3000)
  return { round, durationMs, alive, marks }
}

// ── Numbers ─────────────────────────────────────────────────────────────────────────────────────

export interface Bar { label: string; value: number; of: number; text: string; tone?: 'win' | 'loss' | 'none' }
export interface NumbersView {
  /** Big, plain numbers: K/D/A, ADR, headshot share. */
  stats: Array<{ label: string; value: string }>
  /** Share of hits by body part (only when Riot's per-round hit regions were kept). */
  hits: Bar[]
  /** Rounds won by your buy. */
  economy: Bar[]
  /** Opening duels won vs lost. */
  openings: { won: number; lost: number } | null
}

const BAND_LABEL: Record<BuyBand, string> = { pistol: 'Pistol', full: 'Full buy', half: 'Half buy', eco: 'Eco' }

export function numbersView(md: Rec | null | undefined): NumbersView | null {
  const view = buildValorantMatchView({ ...(md as ValorantTimelineLike), game: 'valorant' })
  if (!view) return null
  const fs = (md?.finalStats ?? {}) as Rec
  const k = num(fs.kills); const d = num(fs.deaths); const a = num(fs.assists)
  const adr = num(fs.adr)
  const hsPct = num(fs.headshotPct)
  const stats: NumbersView['stats'] = []
  if (k != null && d != null) stats.push({ label: 'K / D / A', value: `${k} / ${d} / ${a ?? 0}` })
  if (adr != null) stats.push({ label: 'ADR', value: String(Math.round(adr)) })
  const headShare = view.hits[0]?.value
  if (headShare && headShare !== 'Not measured') stats.push({ label: 'Headshot share', value: headShare })
  else if (hsPct != null) stats.push({ label: 'Headshot share', value: `${Math.round(hsPct)}%` })

  const hits: Bar[] = view.hits.map((h) => {
    const m = /(\d+) of (\d+)/.exec(h.hint ?? '')
    const v = m ? Number(m[1]) : 0
    const of = m ? Number(m[2]) : 0
    return { label: h.label, value: v, of, text: h.value }
  }).filter(b => b.of > 0)

  const economy: Bar[] = view.economy.map((e) => {
    const m = /Won (\d+) of (\d+)/.exec(e.value)
    const v = m ? Number(m[1]) : 0
    const of = m ? Number(m[2]) : 0
    return { label: BAND_LABEL[e.band], value: v, of, text: `${v} of ${of}`, tone: (of && v / of >= 0.5 ? 'win' : 'loss') as Bar['tone'] }
  }).filter(b => b.of > 0)

  const won = view.roundRows.filter(r => r.opening === 'won').length
  const lost = view.roundRows.filter(r => r.opening === 'lost').length
  return { stats, hits, economy, openings: won + lost ? { won, lost } : null }
}

/** Round time ("ms into the round") of a recording time, using a snapshot's known pairing. */
export function roundTimeOf(s: Pick<MomentSnapshot, 'roundMs' | 'videoMs'> | null | undefined, videoMs: number): number | null {
  if (!s || s.roundMs == null) return null
  const ms = s.roundMs + (videoMs - s.videoMs)
  return ms >= 0 ? ms : null
}

/** "1:02" — ms into the round (or a clip). */
export function mmss(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return ''
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Up to 3 short lines from a story paragraph (sentence split; never cuts mid-sentence). */
export function storyLines(text: string | null | undefined, max = 3): string[] {
  const t = (text ?? '').trim()
  if (!t) return []
  const parts = t.match(/[^.!?]+[.!?]+(\s|$)/g)?.map(s => s.trim()).filter(Boolean) ?? [t]
  return parts.slice(0, max)
}

/** "in 6 of 9 matches" → { x: 6, n: 9 } so a habit can be drawn as match pips (n capped at 20). */
export function ofN(text: string | null | undefined): { x: number; n: number } | null {
  const m = /\b(\d+) of (?:your )?(?:last )?(\d+)\b/i.exec(text ?? '')
  if (!m) return null
  const x = Number(m[1]); const n = Number(m[2])
  return n > 0 && n <= 20 && x <= n ? { x, n } : null
}
