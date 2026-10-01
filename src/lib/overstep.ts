/** Native Overstep evidence. Never pass this through a Riot/Valorant adapter. */
export const OVERSTEP_BUILD = 'overstep-2026-09-30'
export const OVERSTEP_RULESET = 'local-3v3-v1'
export interface OverstepManifest {
  schemaVersion: 2; localProfileId: string; game: 'overstep'; matchId: string; build: string; ruleset: string
  authority: 'local'; map: 'breakwater' | 'sluice-works' | 'transfer-yard'; mapVersion: '1'
  mode: 'circuit' | 'crosscurrent'; startedAtMs: number; playerId: 0
  participants: Array<{ id: number; team: number; kind: 'human' | 'bot' }>
}
export const EVENT_TYPES = ['match_preparing', 'match_started', 'round_started', 'round_ended', 'match_ended', 'shot', 'damage', 'kill', 'plant', 'defuse', 'paused', 'resumed', 'positions', 'equipment', 'heartbeat'] as const
export interface OverstepEvent {
  seq: number; type: typeof EVENT_TYPES[number]; elapsedMs: number; matchTimeMs: number; clockErrorMs: number
  round: number; data: Record<string, unknown>
}
export interface VideoAnchor { epochMs: number; videoMs: number; uncertaintyMs: number }
export interface OverstepSession {
  manifest: OverstepManifest; events: OverstepEvent[]; anchors: VideoAnchor[]
  state: 'starting' | 'recording' | 'finalizing' | 'ready' | 'incomplete' | 'failed' | 'skipped'
  dataState: 'receiving' | 'interrupted' | 'complete' | 'abandoned'
  dataError: string | null
  syncError: string | null
  error: string | null; videoPath: string | null; videoUrl?: string | null
}
export interface OverstepStatus { enabled: boolean; error: string | null; sessions: OverstepSession[] }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const integer = (v: unknown, min: number, max: number): boolean => finite(v) && Number.isInteger(v) && v >= min && v <= max
function requireValue(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message) }
export function parseOverstepPacket(value: unknown): { manifest: OverstepManifest; events: OverstepEvent[]; sentAtMs: number } {
  requireValue(object(value) && object(value.manifest) && Array.isArray(value.events), 'Invalid Overstep packet')
  const m = value.manifest
  requireValue(m.schemaVersion === 2 && m.game === 'overstep' && m.build === OVERSTEP_BUILD && m.ruleset === OVERSTEP_RULESET && m.authority === 'local' && m.mapVersion === '1', 'Unsupported Overstep build or schema')
  requireValue(typeof m.localProfileId === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(m.localProfileId), 'Missing local profile identity')
  requireValue(typeof m.matchId === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(m.matchId), 'Invalid match ID')
  requireValue(['breakwater', 'sluice-works', 'transfer-yard'].includes(String(m.map)) && ['circuit', 'crosscurrent'].includes(String(m.mode)), 'Invalid map or mode')
  requireValue(finite(m.startedAtMs) && m.startedAtMs > 0 && m.playerId === 0 && Array.isArray(m.participants) && m.participants.length === 6, 'Missing match clock or participants')
  for (let i = 0; i < 6; i++) {
    const p = m.participants[i]
    requireValue(object(p) && p.id === i && integer(p.team, 0, 1) && p.kind === (i === 0 ? 'human' : 'bot'), 'Invalid participant')
  }
  requireValue(finite(value.sentAtMs) && value.events.length > 0 && value.events.length <= 128, 'Invalid event batch')
  for (const e of value.events) {
    requireValue(object(e) && integer(e.seq, 0, 100000) && EVENT_TYPES.includes(e.type as OverstepEvent['type']) && finite(e.elapsedMs) && e.elapsedMs >= 0 && finite(e.matchTimeMs) && e.matchTimeMs >= 0 && finite(e.clockErrorMs) && integer(e.round, 1, 100) && object(e.data), 'Invalid event')
    const d = e.data
    if (['damage', 'kill'].includes(String(e.type))) requireValue(['r04', 'knife'].includes(String(d.weapon)) && integer(d.attacker, 0, 5) && integer(d.victim, 0, 5) && integer(d.damage, 0, 100) && integer(d.healthAfter, 0, 100) && typeof d.headshot === 'boolean', 'Invalid damage evidence')
    if (e.type === 'shot') requireValue(['r04', 'knife'].includes(String(d.weapon)) && ['spreadDegrees', 'speedCmS', 'recoveryHeat'].every(k => finite(d[k]) && Number(d[k]) >= 0) && ['origin', 'direction'].every(k => Array.isArray(d[k]) && (d[k] as unknown[]).length === 3 && (d[k] as unknown[]).every(finite)), 'Invalid shot evidence')
    if (e.type === 'match_started') requireValue(['recording', 'skipped', 'failed', 'timeout'].includes(String(d.captureState)), 'Missing capture decision')
    if (e.type === 'equipment') requireValue(integer(d.slot, 0, 3) && typeof d.reloading === 'boolean' && integer(d.smokes, 0, 2) && integer(d.recons, 0, 1), 'Invalid equipment evidence')
    if (e.type === 'positions') requireValue(Array.isArray(d.members) && d.members.length === 6 && d.members.every((p, i) => object(p) && p.member === i && integer(p.health, 0, 100) && ['position', 'aim'].every(k => Array.isArray(p[k]) && (p[k] as unknown[]).length === 3 && (p[k] as unknown[]).every(finite))), 'Invalid position evidence')
    if (e.type === 'kill') requireValue(d.healthAfter === 0, 'Kill has surviving victim')
    if (['shot', 'equipment', 'plant', 'defuse'].includes(String(e.type))) requireValue(integer(d.member, 0, 5), 'Missing event participant')
    if (e.type === 'plant' || e.type === 'defuse') requireValue(integer(d.site, 0, 1), 'Invalid site')
    if (e.type === 'round_ended') requireValue(integer(d.winner, -1, 1) && integer(d.reason, 0, 4), 'Invalid round result')
    if (e.type === 'match_ended') requireValue(['completed', 'restarted', 'returned_to_menu', 'level_closed'].includes(String(d.reason)) && integer(d.winner, -1, 1) && Array.isArray(d.score) && d.score.length === 2 && d.score.every(n => integer(n, 0, 10000)), 'Invalid match result')
  }
  return value as unknown as ReturnType<typeof parseOverstepPacket>
}
/** Validate measured OBS clock anchors; reject discontinuities rather than repairing offsets. */
export function syncIssue(session: OverstepSession): string | null {
  if (session.syncError) return session.syncError
  if (session.events.some(e => Math.abs(e.clockErrorMs) > 100)) return 'The game clock changed during this match.'
  if (session.anchors.length < 2) return 'Recording sync needs at least two measured anchors.'
  for (let i = 0; i < session.anchors.length; i++) {
    const a = session.anchors[i]
    if (![a.epochMs, a.videoMs, a.uncertaintyMs].every(Number.isFinite) || a.videoMs < 0 || a.uncertaintyMs < 0 || a.uncertaintyMs > 100) return 'Recording sync measurement was too uncertain.'
    if (i) {
      const prev = session.anchors[i - 1]
      if (a.epochMs <= prev.epochMs || a.videoMs <= prev.videoMs || a.epochMs - prev.epochMs > 5000) return 'Recording was interrupted or paused.'
      if (Math.abs((a.epochMs - a.videoMs) - (session.anchors[0].epochMs - session.anchors[0].videoMs)) > 100) return 'Recording clock drift exceeded 100 ms.'
    }
  }
  return null
}
export function eventVideoMs(session: OverstepSession, event: OverstepEvent): number | null {
  if (!session.videoPath || syncIssue(session)) return null
  const epoch = session.manifest.startedAtMs + event.elapsedMs
  for (let i = 1; i < session.anchors.length; i++) {
    const a = session.anchors[i - 1], b = session.anchors[i]
    if (epoch >= a.epochMs && epoch <= b.epochMs) return a.videoMs + (epoch - a.epochMs) * (b.videoMs - a.videoMs) / (b.epochMs - a.epochMs)
  }
  return null
}
export function eventLabel(e: OverstepEvent): string {
  const name = (id: unknown) => id === 0 ? 'You' : `Bot ${id}`
  if (e.type === 'kill') return `${name(e.data.attacker)} eliminated ${name(e.data.victim)}${e.data.headshot ? ' (headshot)' : ''}`
  if (e.type === 'plant' || e.type === 'defuse') return `${name(e.data.member)} ${e.type === 'plant' ? 'planted' : 'defused'} at ${e.data.site === 0 ? 'A' : 'B'}`
  if (e.type === 'round_ended') return ['Round ended', 'Round ended by elimination', 'Device defused', 'Device detonated', 'Time expired'][Number(e.data.reason)]
  return e.type.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase())
}
