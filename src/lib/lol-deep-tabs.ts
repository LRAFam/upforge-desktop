/**
 * League match page deep tabs (board 19b): Lane · Deaths · Objectives · Vision.
 * Shaped from the stored `match_data` of a League analysis (Match-V5 + timeline, normalised by the
 * API). Only values Riot reports are shown; anything missing is left out rather than shown as zero.
 */

export interface LolDeepRow { k: string; text: string; sub?: string }
export interface LolDeepTabs {
  lane: LolDeepRow[]
  deaths: LolDeepRow[]
  objectives: LolDeepRow[]
  vision: LolDeepRow[]
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))
const n0 = (n: number) => Math.round(n).toLocaleString('en-GB')
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "took 1,000 damage: 90% physical, 10% magic (mostly physical)". Mirrors the AI's wording rules. */
export function damageLine(damage: unknown): string | null {
  const d = obj(damage)
  const total = num(d?.total)
  if (!d || !total || total <= 0) return null
  const shares = (['physical', 'magic', 'true'] as const).map(k => [k, (num(d[k]) ?? 0) / total] as const)
  const split = shares.filter(([, s]) => s > 0).map(([k, s]) => `${Math.round(s * 100)}% ${k}`).join(', ')
  const [topKind, topShare] = shares.reduce((a, b) => (b[1] > a[1] ? b : a))
  return `Took ${n0(total)} damage: ${split}${topShare >= 0.6 ? ` (mostly ${topKind})` : ''}`
}

function sourcesLine(damage: unknown): string | undefined {
  const sources = arr(obj(damage)?.sources).map(obj).filter((s): s is Obj => !!s && !!str(s.name))
  return sources.length ? `From ${sources.map(s => `${str(s.name)} ${n0(num(s.damage) ?? 0)}`).join(', ')}` : undefined
}

const MONSTER: Record<string, string> = {
  DRAGON: 'Dragon', BARON_NASHOR: 'Baron', RIFTHERALD: 'Rift Herald', HORDE: 'Voidgrubs', ATAKHAN: 'Atakhan',
}
const BUILDING: Record<string, string> = { TOWER_BUILDING: 'Tower', INHIBITOR_BUILDING: 'Inhibitor' }
const LANE: Record<string, string> = { TOP_LANE: 'top', MID_LANE: 'mid', BOT_LANE: 'bot' }
const titleCase = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

export function lolDeepTabs(matchData: unknown): LolDeepTabs | null {
  const md = obj(matchData)
  if (!md) return null
  const me = obj(md.participant)
  const roster = arr(md.roster).map(obj).filter((r): r is Obj => !!r)
  const myId = num(me?.participant_id)
  const myTeam = num(roster.find(r => num(r.participant_id) === myId)?.team_id)
  const champ = (id: unknown) => str(roster.find(r => num(r.participant_id) === num(id))?.champion_name)
  const events = obj(md.timeline_events)
  const ch = obj(me?.challenges)
  const minutes = (num(md.game_duration_seconds) ?? 0) / 60

  // Lane
  const lane: LolDeepRow[] = []
  const lm = obj(md.lane_metrics)
  const opp = str(lm?.opponent_champion)
  for (const minute of ['10', '15']) {
    const e = obj(obj(lm?.at)?.[minute])
    const cs = num(e?.cs)
    if (cs === null) continue
    const oppCs = num(e?.opponent_cs)
    const gold = num(e?.gold_diff)
    lane.push({
      k: `${minute}:00`,
      text: opp && oppCs !== null ? `CS ${cs} vs ${oppCs} (${opp})` : `CS ${cs}`,
      sub: gold !== null ? `Gold ${signed(gold)}${num(e?.xp_diff) !== null ? ` · XP ${signed(num(e?.xp_diff)!)}` : ''}` : undefined,
    })
  }
  const maxLead = num(ch?.max_cs_lead)
  if (maxLead !== null && opp) lane.push({ k: 'Best lead', text: `${signed(maxLead)} CS over ${opp} at your best point` })
  const plates = num(ch?.turret_plates)
  if (plates !== null) lane.push({ k: 'Plates', text: count(plates, 'turret plate') + ' taken' })
  const solo = num(ch?.solo_kills)
  if (solo !== null) lane.push({ k: 'Solo kills', text: count(solo, 'solo kill') })

  // Deaths
  const deaths: LolDeepRow[] = arr(events?.deaths).map(obj).filter((e): e is Obj => !!e).map((e) => {
    const sec = num(e.timestamp_sec) ?? (num(e.timestamp_ms) ?? 0) / 1000
    const killerId = num(e.killerId)
    const killer = killerId === 0 ? 'Executed (no champion credited)' : champ(killerId) ? `Killed by ${champ(killerId)}` : 'Died'
    const assists = arr(e.assistingParticipantIds).map(champ).filter((x): x is string => !!x)
    const damage = damageLine(e.damage_received)
    return {
      k: clock(sec),
      text: `${killer}${assists.length ? ` (with ${assists.join(', ')})` : ''}`,
      sub: [damage, sourcesLine(e.damage_received)].filter(Boolean).join(' · ') || undefined,
    }
  })

  // Objectives
  const objectives: LolDeepRow[] = arr(events?.objectives).map(obj).filter((e): e is Obj => !!e).map((e) => {
    const sec = num(e.timestamp_sec) ?? (num(e.timestamp_ms) ?? 0) / 1000
    const team = num(e.killerTeamId) ?? num(e.teamId)
    // BUILDING_KILL.teamId is the team that LOST the building; ELITE_MONSTER_KILL.killerTeamId took it.
    const isBuilding = str(e.type) === 'BUILDING_KILL'
    const ours = team !== null && myTeam !== null
      ? (isBuilding && num(e.killerTeamId) === null ? team !== myTeam : team === myTeam)
      : null
    const who = ours === null ? '' : ours ? 'Your team took ' : 'Enemy took '
    let what: string
    if (isBuilding) {
      const b = BUILDING[str(e.buildingType) ?? ''] ?? titleCase(str(e.buildingType) ?? 'Structure')
      const l = LANE[str(e.laneType) ?? '']
      what = l ? `${l} ${b.toLowerCase()}` : b.toLowerCase()
    } else {
      const m = MONSTER[str(e.monsterType) ?? ''] ?? titleCase(str(e.monsterType) ?? 'Objective')
      const sub = str(e.monsterSubType)
      what = sub && m === 'Dragon' ? `${titleCase(sub.replace(/_DRAGON$/, ''))} Dragon` : m
    }
    return { k: clock(sec), text: who ? `${who}${what}` : what.charAt(0).toUpperCase() + what.slice(1) }
  })

  // Vision
  const vision: LolDeepRow[] = []
  const vs = num(me?.vision_score)
  if (vs !== null) vision.push({ k: 'Score', text: `${vs}${minutes > 0 ? ` (${(vs / minutes).toFixed(1)} per minute)` : ''}` })
  const placed = num(me?.wards_placed)
  if (placed !== null) vision.push({ k: 'Placed', text: count(placed, 'ward') })
  const cleared = num(me?.wards_killed)
  if (cleared !== null) vision.push({ k: 'Cleared', text: count(cleared, 'enemy ward') })
  const control = num(ch?.control_wards)
  if (control !== null) vision.push({ k: 'Control', text: count(control, 'control ward') + ' placed' })

  return { lane, deaths, objectives, vision }
}
