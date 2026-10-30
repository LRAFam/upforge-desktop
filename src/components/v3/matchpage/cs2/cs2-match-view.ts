/**
 * CS2 match stats for the v3 match page and the in-app CS2 result view.
 * Input: the measured `match_stats` v1 (desktop demoparser2 or the server's identical port), plus
 * the recording's round summaries and your kills/deaths when the match page has them.
 * Rule: render only measured values; a null metric is shown as "Not measured", never 0.
 */

type Num = number | null | undefined
export interface Cs2StatsV1 {
  schema_version?: number
  rounds?: number
  score?: string
  player_stats?: Record<string, number | null | Record<string, number>>
  round_stats?: Record<string, number | null>
  utility_stats?: Record<string, number | null>
  economy_stats?: Record<string, number | null>
}
interface RoundSummaryLike { roundNumber: number; winningTeam: string | null; ceremony?: string | null; spikePlanted?: boolean; spikeSite?: string | null }
interface KillLike { round?: number; weapon?: string; headshot?: boolean }

export interface StatRow { label: string; value: string; hint?: string }
export interface RoundRow { round: number; result: 'won' | 'lost' | 'unknown'; ended: string; kills: number; deaths: number; plant: string | null }
export interface Cs2MatchView {
  score: string | null
  rounds: number | null
  headline: StatRow[]
  duels: StatRow[]
  weapons: StatRow[]
  utility: StatRow[]
  economy: StatRow[]
  sides: StatRow[]
  roundRows: RoundRow[]
}

const NOT = 'Not measured'
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const int = (v: Num) => (num(v) == null ? NOT : String(Math.round(v as number)))
const dec = (v: Num, d = 2) => (num(v) == null ? NOT : (v as number).toFixed(d))
const pct = (v: Num) => (num(v) == null ? NOT : `${Math.round(v as number)}%`)
const money = (v: Num) => (num(v) == null ? NOT : `$${Math.round(v as number).toLocaleString('en-GB')}`)
const of = (a: Num, b: Num) => (num(a) == null || num(b) == null ? NOT : `${Math.round(a as number)} of ${Math.round(b as number)}`)

const CEREMONY: Record<string, string> = {
  elimination: 'Elimination', bombdefused: 'Bomb defused', detonation: 'Bomb exploded', time: 'Time ran out', timeout: 'Time ran out',
}

/** "ak47" / "weapon_ak47" → "AK-47"-ish display; unknown weapons keep their name, title-cased. */
export function weaponLabel(raw: string): string {
  const w = raw.replace(/^weapon_/, '').toLowerCase()
  const known: Record<string, string> = { ak47: 'AK-47', m4a1: 'M4A4', m4a1_silencer: 'M4A1-S', awp: 'AWP', deagle: 'Desert Eagle', usp_silencer: 'USP-S', glock: 'Glock-18', galilar: 'Galil AR', famas: 'FAMAS', mp9: 'MP9', mac10: 'MAC-10', ssg08: 'SSG 08', hegrenade: 'HE Grenade', inferno: 'Molotov', knife: 'Knife' }
  return known[w] ?? w.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function buildCs2MatchView(
  stats: Cs2StatsV1 | null | undefined,
  extra: { roundSummaries?: RoundSummaryLike[] | null; kills?: KillLike[] | null; deaths?: KillLike[] | null } = {},
): Cs2MatchView | null {
  const ps = stats?.player_stats ?? null
  const rs = stats?.round_stats ?? null
  const us = stats?.utility_stats ?? null
  const es = stats?.economy_stats ?? null
  const summaries = extra.roundSummaries ?? []
  if (!ps && !summaries.length) return null

  const p = (k: string) => num(ps?.[k] as Num)
  const multi = ps?.multi_kills && typeof ps.multi_kills === 'object' ? (ps.multi_kills as Record<string, number>) : null
  const multiTotal = multi ? Object.entries(multi).filter(([k]) => Number(k) >= 2).reduce((n, [, v]) => n + (num(v) ?? 0), 0) : null

  const kills = extra.kills ?? []
  const deaths = extra.deaths ?? []
  const byWeapon = new Map<string, number>()
  for (const k of kills) if (k.weapon) byWeapon.set(weaponLabel(k.weapon), (byWeapon.get(weaponLabel(k.weapon)) ?? 0) + 1)
  const weapons = [...byWeapon.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([label, n]) => ({ label, value: `${n} ${n === 1 ? 'kill' : 'kills'}` }))

  const roundRows: RoundRow[] = summaries.map(s => ({
    round: s.roundNumber + 1,
    result: s.winningTeam === 'ALLY' ? 'won' : s.winningTeam === 'ENEMY' ? 'lost' : 'unknown',
    ended: CEREMONY[(s.ceremony ?? '').toLowerCase()] ?? (s.ceremony ? s.ceremony : '—'),
    kills: kills.filter(k => k.round === s.roundNumber).length,
    deaths: deaths.filter(d => d.round === s.roundNumber).length,
    plant: s.spikePlanted ? `Planted ${s.spikeSite ?? ''}`.trim() : null,
  }))

  return {
    score: stats?.score ?? null,
    rounds: num(stats?.rounds) ?? (summaries.length || null),
    headline: [
      { label: 'K / D / A', value: [p('kills'), p('deaths'), p('assists')].every(v => v != null) ? `${p('kills')} / ${p('deaths')} / ${p('assists')}` : NOT },
      { label: 'ADR', value: dec(p('adr'), 1), hint: 'Damage per round' },
      { label: 'KAST', value: pct(p('kast_pct')), hint: 'Rounds with a kill, assist, survival or trade' },
      { label: 'Headshot kills', value: pct(p('headshot_pct')) },
    ],
    duels: [
      { label: 'Opening duels won', value: of(p('opening_kills'), num(p('opening_kills')) != null && num(p('opening_deaths')) != null ? (p('opening_kills')! + p('opening_deaths')!) : null) },
      { label: 'Clutches won', value: of(p('clutches_won'), p('clutches_attempted')) },
      { label: 'Rounds with 2+ kills', value: multiTotal == null ? NOT : String(multiTotal) },
      { label: 'Rounds with a kill', value: of(num(rs?.rounds_with_kills), num(stats?.rounds)) },
      { label: 'Rounds with no kill, assist or damage', value: int(num(rs?.zero_impact_rounds)) },
    ],
    weapons,
    utility: [
      { label: 'Grenades thrown', value: int(num(us?.grenades_thrown)) },
      { label: 'Smokes', value: int(num(us?.smokes_thrown)) },
      { label: 'Flashes', value: int(num(us?.flashes_thrown)) },
      { label: 'Molotovs', value: int(num(us?.molotovs_thrown)) },
      { label: 'HE grenades', value: int(num(us?.he_thrown)) },
      { label: 'Enemies flashed', value: int(num(us?.enemies_flashed)) },
      { label: 'Teammates flashed', value: int(num(us?.teammates_flashed)) },
      { label: 'Utility damage', value: int(num(us?.utility_damage)) },
    ],
    economy: [
      { label: 'Full-buy rounds', value: int(num(es?.full_buys)), hint: 'Equipment worth $4,000 or more' },
      { label: 'Force-buy rounds', value: int(num(es?.force_buys)), hint: '$1,500 to $3,999' },
      { label: 'Eco rounds', value: int(num(es?.eco_rounds)), hint: 'Under $1,500' },
      { label: 'Average equipment, CT', value: money(num(es?.avg_eq_ct)) },
      { label: 'Average equipment, T', value: money(num(es?.avg_eq_t)) },
      { label: 'Average saved', value: money(num(es?.avg_saved)) },
    ],
    sides: [
      { label: 'K/D on CT', value: dec(num(rs?.ct_kd)) },
      { label: 'K/D on T', value: dec(num(rs?.t_kd)) },
    ],
    roundRows,
  }
}

/** True when a section has at least one measured value (so the tab isn't a wall of "Not measured"). */
export const hasMeasured = (rows: StatRow[]) => rows.some(r => r.value !== NOT)
