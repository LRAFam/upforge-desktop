/**
 * Shapes a finished Deadlock replay review (GET /api/deadlock/demo/{jobId}) for the v3 desktop view:
 * souls curve, lobby comparison, item and ability timelines, Mid Boss and the coach's notes.
 * Real data only — every section returns empty when the analysis didn't include it.
 */

export interface LobbyRow {
  minute?: number; player?: number | null; team_avg?: number | null; enemy_avg?: number | null
  lobby_avg?: number | null; lane_opponents_avg?: number | null; player_rank_in_lobby?: number | null; lobby_size?: number | null
}
/** Measured from the replay positions (AI `_fight_context`). */
export interface DeadlockFight {
  nearby_units?: number
  deaths_total?: number; deaths_alone?: number; deaths_outnumbered?: number; deaths_enemy_side?: number; deaths_traded?: number
  team_kills?: number; kills_and_assists?: number; kill_participation_pct?: number | null
  /** Abilities cast in the window before each death (boon `abilities`); absent on older reviews. */
  abilities_measured?: boolean; ability_window_seconds?: number; deaths_no_ability?: number | null
  deaths?: Array<{ time_seconds: number; killer?: string; allies_nearby?: number; enemies_nearby?: number; alone?: boolean; outnumbered?: boolean; side?: 'own' | 'middle' | 'enemy'; traded?: boolean; abilities_used?: string[] | null }>
}

export interface DeadlockReviewDetail {
  hero?: string | null
  match_result?: string | null
  duration_minutes?: number | null
  coaching?: {
    overall_summary?: string; priority_focus?: string; economy_notes?: string
    key_issues?: Array<{ category?: string; issue?: string; evidence?: string; fix?: string }>
    strengths?: string[]
  } | null
  match_stats?: {
    player_stats?: { kills?: number; deaths?: number; assists?: number; damage_dealt?: number } | null
    economy?: {
      souls_timeline?: Array<{ minute: number; souls: number }>
      items_bought?: Array<{ name: string; cost?: number | null; time_seconds: number; change?: string }>
    } | null
    abilities?: Array<{ ability: string; level: number; time_seconds: number }> | null
    mid_boss?: Array<{ time_seconds: number; team?: number | null }> | null
    lobby?: { checkpoints?: LobbyRow[]; final?: LobbyRow | null; damage?: LobbyRow | null } | null
    kill_events?: Array<{ type: 'kill' | 'death' | 'assist'; time_seconds: number; attacker_hero?: string; victim_hero?: string }> | null
    player_team?: number | null
    claims_removed?: number
    fight?: DeadlockFight | null
  } | null
}

export function clock(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '--:--'
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Round half up so 10,350 reads 10.4k (toFixed alone gives 10.3k from float error).
const k = (n: number) => `${(Math.round(n / 100) / 10).toFixed(1)}k`

export interface LobbyLine { label: string; you: string; versus: Array<{ label: string; value: string; diff: string; tone: 'win' | 'loss' | 'none' }>; rank: string }

/** "At 10 min: you 9.8k · lane opponents 11.2k (−1.4k) · lobby 10.4k (−0.6k) · 9th of 12". */
export function lobbyLines(detail: DeadlockReviewDetail | null): LobbyLine[] {
  const lobby = detail?.match_stats?.lobby
  if (!lobby) return []
  const rows: Array<[string, LobbyRow | null | undefined]> = [
    ...(lobby.checkpoints ?? []).map(c => [`At ${c.minute} min`, c] as [string, LobbyRow]),
    ['End of match', lobby.final],
  ]
  return rows.filter(([, r]) => r && typeof r.player === 'number').map(([label, r]) => {
    const you = r!.player as number
    const versus = ([['Lane opponents', r!.lane_opponents_avg], ['Enemy team', r!.enemy_avg], ['Lobby', r!.lobby_avg]] as const)
      .filter(([, v]) => typeof v === 'number')
      .map(([name, v]) => {
        const diff = you - (v as number)
        return {
          label: name, value: k(v as number),
          diff: diff === 0 ? 'even' : `${diff > 0 ? '+' : '−'}${k(Math.abs(diff))}`,
          tone: (diff > 0 ? 'win' : diff < 0 ? 'loss' : 'none') as 'win' | 'loss' | 'none',
        }
      })
    const rank = r!.player_rank_in_lobby && r!.lobby_size ? `${ordinal(r!.player_rank_in_lobby)} of ${r!.lobby_size}` : ''
    return { label, you: k(you), versus, rank }
  })
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

/** Souls curve as SVG points, with the lobby-average checkpoints on the same scale. */
export function soulsCurve(detail: DeadlockReviewDetail | null, width: number, height: number, pad = 8) {
  const timeline = detail?.match_stats?.economy?.souls_timeline ?? []
  if (timeline.length < 2) return null
  const lobby = detail?.match_stats?.lobby
  const marks = (lobby?.checkpoints ?? [])
    .filter(c => typeof c.minute === 'number' && typeof c.lobby_avg === 'number')
    .map(c => ({ minute: c.minute as number, souls: c.lobby_avg as number }))
  const maxMin = Math.max(...timeline.map(p => p.minute), 1)
  const maxSouls = Math.max(...timeline.map(p => p.souls), ...marks.map(m => m.souls), 1)
  const x = (m: number) => Math.round((pad + (m / maxMin) * (width - pad * 2)) * 10) / 10
  const y = (s: number) => Math.round((height - pad - (s / maxSouls) * (height - pad * 2)) * 10) / 10
  return {
    points: timeline.map(p => ({ x: x(p.minute), y: y(p.souls) })),
    lobby: marks.map(m => ({ x: x(m.minute), y: y(m.souls), label: `Lobby avg ${k(m.souls)} at ${m.minute} min` })),
    end: k(timeline[timeline.length - 1].souls),
    minutes: maxMin,
  }
}

export function itemRows(detail: DeadlockReviewDetail | null) {
  return (detail?.match_stats?.economy?.items_bought ?? []).map(i => ({
    at: clock(i.time_seconds), name: i.name, cost: typeof i.cost === 'number' && i.cost > 0 ? `${i.cost.toLocaleString('en-GB')} souls` : '',
    upgrade: i.change === 'upgraded',
  }))
}

export function abilityRows(detail: DeadlockReviewDetail | null) {
  return (detail?.match_stats?.abilities ?? []).map(a => ({ at: clock(a.time_seconds), name: a.ability, level: a.level }))
}

export function midBossRows(detail: DeadlockReviewDetail | null) {
  const team = detail?.match_stats?.player_team
  return (detail?.match_stats?.mid_boss ?? []).map(m => ({
    at: clock(m.time_seconds),
    // Only say whose it was when we know the player's team.
    who: typeof team === 'number' && typeof m.team === 'number' ? (m.team === team ? 'Your team' : 'Enemy team') : 'Taken',
    ours: typeof team === 'number' && m.team === team,
  }))
}

const SIDE: Record<string, string> = { own: 'your side', middle: 'middle of the map', enemy: 'enemy side' }

/** Deaths with fight context when the replay had positions; otherwise just time and killer. */
export function deathRows(detail: DeadlockReviewDetail | null) {
  const fight = detail?.match_stats?.fight?.deaths
  const window = detail?.match_stats?.fight?.ability_window_seconds ?? 8
  if (fight?.length) {
    return fight.map(d => ({
      at: clock(d.time_seconds),
      by: d.killer && d.killer !== 'non-hero' ? d.killer : '',
      context: [
        `${d.allies_nearby ?? 0} ${d.allies_nearby === 1 ? 'teammate' : 'teammates'} · ${d.enemies_nearby ?? 0} ${d.enemies_nearby === 1 ? 'enemy' : 'enemies'} nearby`,
        d.side ? SIDE[d.side] : '',
        d.traded ? 'traded' : '',
        // Only when measured: null/absent means the replay didn't say.
        Array.isArray(d.abilities_used)
          ? (d.abilities_used.length ? `used ${d.abilities_used.join(', ')}` : `no ability in the ${window} s before`)
          : '',
      ].filter(Boolean).join(' · '),
      alone: !!d.alone,
    }))
  }
  return (detail?.match_stats?.kill_events ?? []).filter(e => e.type === 'death')
    .map(e => ({ at: clock(e.time_seconds), by: e.attacker_hero ?? '', context: '', alone: false }))
}

/** "In 48% of your team's kills (12 of 25)" and "Alone in 2 of 7 deaths"-style facts, only when measured. */
export function fightFacts(detail: DeadlockReviewDetail | null): Array<{ label: string; value: string }> {
  const f = detail?.match_stats?.fight
  if (!f) return []
  const out: Array<{ label: string; value: string }> = []
  if (typeof f.kill_participation_pct === 'number' && f.team_kills) {
    out.push({ label: 'Kill participation', value: `${f.kill_participation_pct}% (${f.kills_and_assists ?? 0} of ${f.team_kills})` })
  }
  const total = f.deaths_total ?? 0
  if (total > 0) {
    out.push({ label: 'No teammate nearby', value: `${f.deaths_alone ?? 0} of ${total} deaths` })
    out.push({ label: 'Outnumbered', value: `${f.deaths_outnumbered ?? 0} of ${total} deaths` })
    out.push({ label: 'On the enemy side', value: `${f.deaths_enemy_side ?? 0} of ${total} deaths` })
    out.push({ label: 'Traded within 10 s', value: `${f.deaths_traded ?? 0} of ${total} deaths` })
    if (f.abilities_measured && typeof f.deaths_no_ability === 'number') {
      out.push({ label: `No ability in the ${f.ability_window_seconds ?? 8} s before`, value: `${f.deaths_no_ability} of ${total} deaths` })
    }
  }
  return out
}
