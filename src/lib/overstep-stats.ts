import { syncIssue, type OverstepSession } from './overstep'

export type OverstepMode = 'circuit' | 'crosscurrent'
export interface OverstepRecordingPolicy { recordedModes: OverstepMode[] }
export function parseRecordingPolicy(value: unknown): OverstepRecordingPolicy {
  const p = value as OverstepRecordingPolicy
  if (!p || !Array.isArray(p.recordedModes) || p.recordedModes.some(m => !['circuit', 'crosscurrent'].includes(m)) || new Set(p.recordedModes).size !== p.recordedModes.length) throw new Error('recordedModes must contain unique supported modes')
  return { recordedModes: [...p.recordedModes] }
}
const counts = () => ({ kills: 0, deaths: 0, headshotKills: 0, shots: 0, hits: 0, headHits: 0, damage: 0 })
const ratio = (n: number, d: number) => d === 0 ? null : n / d
const metrics = (v: ReturnType<typeof counts>) => ({ ...v, kd: ratio(v.kills, v.deaths), headshotPercentage: v.hits === 0 ? null : 100 * v.headHits / v.hits, headshotKillPercentage: v.kills === 0 ? null : 100 * v.headshotKills / v.kills, accuracyPercentage: v.shots === 0 ? null : 100 * v.hits / v.shots })
const weaponMetrics = (id: string, v: ReturnType<typeof counts>) => {
  const { deaths, kd, ...result } = metrics(v)
  return { ...result, headshotPercentage: id === 'knife' ? null : result.headshotPercentage, headshotKillPercentage: id === 'knife' ? null : result.headshotKillPercentage }
}
/** Firearm headshot percentage = landed firearm head hits / landed firearm hits. Melee is separate. */
export function matchStats(s: OverstepSession, videoAvailable: boolean = false) {
  const players = s.manifest.participants.map(p => ({ ...p, ...counts(), plants: 0, defuses: 0, weapons: { r04: counts(), knife: counts() } }))
  for (const e of s.events) {
    const d = e.data
    if (e.type === 'shot') { const p = players[Number(d.member)], w = p.weapons[d.weapon as 'r04' | 'knife']; w.shots++; if (d.weapon === 'r04') p.shots++ }
    if (e.type === 'damage') {
      const p = players[Number(d.attacker)], w = p.weapons[d.weapon as 'r04' | 'knife']; w.hits++; w.damage += Number(d.damage); if (d.headshot) w.headHits++
      p.damage += Number(d.damage)
      if (d.weapon === 'r04') { p.hits++; if (d.headshot) p.headHits++ }
    }
    if (e.type === 'kill') {
      const p = players[Number(d.attacker)], v = players[Number(d.victim)], w = p.weapons[d.weapon as 'r04' | 'knife']; p.kills++; w.kills++; v.deaths++
      if (d.headshot) { p.headshotKills++; w.headshotKills++ }
    }
    if (e.type === 'plant') players[Number(d.member)].plants++
    if (e.type === 'defuse') players[Number(d.member)].defuses++
  }
  const end = s.events.find(e => e.type === 'match_ended')
  const start = s.events.find(e => e.type === 'match_started')
  const completed = end?.data.reason === 'completed'
  const readyBeforeStart = start?.data.captureState === 'recording' && s.anchors.length > 0 && s.anchors[0].epochMs <= s.manifest.startedAtMs + start.elapsedMs
  return {
    matchId: s.manifest.matchId, localProfileId: s.manifest.localProfileId, mode: s.manifest.mode, map: s.manifest.map, authority: s.manifest.authority,
    startedAtMs: s.manifest.startedAtMs, status: completed ? 'completed' : end ? 'abandoned' : s.dataState === 'interrupted' ? 'interrupted' : 'in_progress',
    dataError: s.dataError, score: end ? end.data.score : null, winner: completed ? end!.data.winner : null,
    durationMs: end ? end.matchTimeMs : null,
    recording: { state: s.state, error: s.error, readyBeforeStart, videoAvailable, capturedFromStart: readyBeforeStart && videoAvailable && syncIssue(s) === null, videoPath: s.videoPath },
    players: players.map(p => ({ ...p, ...metrics(p), outcome: !completed ? null : end!.data.winner === -1 ? 'draw' : end!.data.winner === p.team ? 'win' : 'loss', weapons: Object.fromEntries(Object.entries(p.weapons).map(([id, w]) => [id, weaponMetrics(id, w)])) })),
  }
}
export function profileStats(sessions: OverstepSession[], profileId: string, mode?: OverstepMode) {
  const matches = sessions.filter(s => s.manifest.localProfileId === profileId && (!mode || s.manifest.mode === mode)).map(s => matchStats(s))
  const completed = matches.filter(m => m.status === 'completed')
  const total = counts(), weapons = { r04: counts(), knife: counts() }
  let wins = 0, losses = 0, draws = 0
  for (const m of completed) {
    const p = m.players[0]
    if (p.outcome === 'win') wins++; else if (p.outcome === 'loss') losses++; else draws++
    for (const k of Object.keys(total) as Array<keyof typeof total>) total[k] += p[k]
    for (const id of ['r04', 'knife'] as const) for (const k of ['kills', 'headshotKills', 'shots', 'hits', 'headHits', 'damage'] as const) weapons[id][k] += p.weapons[id][k]
  }
  return { localProfileId: profileId, scope: 'local_completed_matches', matches: completed.length, abandoned: matches.filter(m => m.status === 'abandoned').length, interrupted: matches.filter(m => m.status === 'interrupted').length, wins, losses, draws, winPercentage: completed.length ? wins / completed.length * 100 : null, ...metrics(total), weapons: Object.fromEntries(Object.entries(weapons).map(([id, w]) => [id, weaponMetrics(id, w)])) }
}
