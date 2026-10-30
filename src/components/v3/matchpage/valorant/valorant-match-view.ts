/**
 * Valorant match stats for the v3 match page (board 18b): Rounds · Duels · Economy.
 * Input: the recording timeline we already have (roundSummaries, your kills, Riot's per-round
 * hit regions and economy from matchDetails / matchDetailsLite).
 * Rules: measured values only ("Not measured", never 0); counts in sentences are whole numbers;
 * buy bands use the same thresholds as the AI's match facts (services/match_report_facts.py).
 */

const NOT = 'Not measured'
const HALF_LENGTH = 12 // competitive pistol rounds are round 0 and round 12

type Num = number | null | undefined
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : NOT)

export interface ValorantRoundSummaryLike {
  roundNumber: number
  winningTeam: string | null
  ceremony?: string | null
  spikePlanted?: boolean
  spikeSite?: string | null
  playerStats?: { kills?: number; deaths?: number } | null
  playerGotFirstBlood?: boolean
  playerWasFirstBlood?: boolean
  playerLoadoutValue?: Num
  playerSpent?: Num
  playerDamageDealt?: Num
  playerWeapon?: string | null
}
export interface ValorantKillLike { round?: number; weapon?: string | null }
interface DamageRow { receiver?: unknown; damage?: unknown; headshots?: unknown; bodyshots?: unknown; legshots?: unknown }
interface PlayerRoundRow { subject?: unknown; damage?: DamageRow[] | null }

export interface ValorantTimelineLike {
  game?: string
  gameMode?: string | null
  puuid?: string | null
  roundSummaries?: ValorantRoundSummaryLike[] | null
  kills?: ValorantKillLike[] | null
  teamSnapshot?: Array<{ puuid?: string | null; team?: string | null }> | null
  finalStats?: { team?: string | null; adr?: Num } | null
  matchDetails?: { roundResults?: Array<{ roundNum?: number; playerStats?: PlayerRoundRow[] | null }> | null } | null
  matchDetailsLite?: { rounds?: Array<{ round?: number; players?: PlayerRoundRow[] | null }> | null } | null
}

export type BuyBand = 'pistol' | 'full' | 'half' | 'eco'
export interface StatRow { label: string; value: string; hint?: string }
export interface ValorantRoundRow {
  /** 0-based Riot round number (display adds 1). */
  round: number
  result: 'won' | 'lost' | 'unknown'
  ended: string
  plant: string | null
  kills: number | null
  deaths: number | null
  opening: 'won' | 'lost' | null
  buy: BuyBand | null
  damage: number | null
}
export interface ValorantMatchView {
  headline: StatRow[]
  roundRows: ValorantRoundRow[]
  duels: StatRow[]
  weapons: StatRow[]
  hits: StatRow[]
  economy: Array<StatRow & { band: BuyBand }>
}

const CEREMONY: Record<string, string> = {
  ceremonydefault: 'Elimination', ceremonyace: 'Ace', ceremonyclutch: 'Clutch', ceremonyflawless: 'Flawless',
  ceremonythrifty: 'Thrifty', ceremonyteamace: 'Team ace', ceremonycloser: 'Closer',
  elimination: 'Elimination', bombdefused: 'Spike defused', bombdetonated: 'Spike detonated', defuse: 'Spike defused', detonate: 'Spike detonated',
}
const BAND_LABEL: Record<BuyBand, string> = { pistol: 'Pistol rounds', full: 'Full buys', half: 'Half buys', eco: 'Eco rounds' }

export function buyBand(roundIndex: number, loadout: Num, mode: string | null | undefined): BuyBand | null {
  if ((mode ?? '').toUpperCase() === 'COMPETITIVE' && (roundIndex === 0 || roundIndex === HALF_LENGTH)) return 'pistol'
  const v = num(loadout)
  if (v == null) return null
  if (v >= 3900) return 'full'
  if (v >= 2000) return 'half'
  return 'eco'
}

function endedLabel(ceremony: string | null | undefined): string {
  const key = (ceremony ?? '').toLowerCase().replace(/[^a-z]/g, '')
  return CEREMONY[key] ?? (ceremony ? ceremony.replace(/^Ceremony/, '') : 'Round ended')
}

function ownTeam(t: ValorantTimelineLike): string | null {
  const snap = t.teamSnapshot?.find(p => p?.puuid && p.puuid === t.puuid)?.team
  return snap || (typeof t.finalStats?.team === 'string' && t.finalStats.team ? t.finalStats.team : null)
}

function roundResult(winner: string | null, team: string | null): ValorantRoundRow['result'] {
  if (!winner) return 'unknown'
  if (winner === 'ALLY') return 'won'
  if (winner === 'ENEMY') return 'lost'
  if (!team) return 'unknown'
  return winner === team ? 'won' : 'lost'
}

/** Your per-round hit rows from raw matchDetails, or the slim copy kept on upload. */
function ownHitRows(t: ValorantTimelineLike): DamageRow[] | null {
  const me = t.puuid
  if (!me) return null
  const raw = t.matchDetails?.roundResults
  const lite = t.matchDetailsLite?.rounds
  const rounds = Array.isArray(raw) && raw.length ? raw.map(r => r.playerStats ?? []) : Array.isArray(lite) && lite.length ? lite.map(r => r.players ?? []) : null
  if (!rounds) return null
  const rows: DamageRow[] = []
  let sawMe = false
  for (const players of rounds) {
    const mine = (players ?? []).find(p => p?.subject === me)
    if (!mine) continue
    sawMe = true
    if (Array.isArray(mine.damage)) rows.push(...mine.damage)
  }
  return sawMe ? rows : null
}

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0)

export function buildValorantMatchView(t: ValorantTimelineLike | null | undefined): ValorantMatchView | null {
  if (!t || (t.game && t.game !== 'valorant')) return null
  const summaries = Array.isArray(t.roundSummaries) ? t.roundSummaries : []
  if (!summaries.length) return null
  const team = ownTeam(t)
  const mode = t.gameMode ?? null

  const roundRows: ValorantRoundRow[] = summaries.map((s, i) => ({
    round: s.roundNumber,
    result: roundResult(s.winningTeam, team),
    ended: endedLabel(s.ceremony),
    plant: s.spikePlanted ? (s.spikeSite ? `Planted ${s.spikeSite}` : 'Spike planted') : null,
    kills: num(s.playerStats?.kills),
    deaths: num(s.playerStats?.deaths),
    opening: s.playerGotFirstBlood ? 'won' : s.playerWasFirstBlood ? 'lost' : null,
    buy: buyBand(i, s.playerLoadoutValue, mode),
    damage: num(s.playerDamageDealt),
  }))

  const won = roundRows.filter(r => r.result === 'won').length
  const known = roundRows.filter(r => r.result !== 'unknown').length
  const dmg = roundRows.map(r => r.damage).filter((v): v is number => v != null)
  const adr = num(t.finalStats?.adr) ?? (dmg.length === roundRows.length && dmg.length ? dmg.reduce((a, b) => a + b, 0) / dmg.length : null)

  // Opening duels: the first kill of each round that involved you.
  const openWon = roundRows.filter(r => r.opening === 'won')
  const openLost = roundRows.filter(r => r.opening === 'lost')
  const openings = openWon.length + openLost.length
  const duels: StatRow[] = [
    { label: 'Opening duels won', value: openings ? `${openWon.length} of ${openings}` : 'None taken' },
    { label: 'Rounds won after your opening kill', value: openWon.length ? `${openWon.filter(r => r.result === 'won').length} of ${openWon.length}` : NOT },
    { label: 'Rounds won after you died first', value: openLost.length ? `${openLost.filter(r => r.result === 'won').length} of ${openLost.length}` : NOT },
  ]

  const byWeapon = new Map<string, number>()
  for (const k of t.kills ?? []) {
    const w = typeof k?.weapon === 'string' && k.weapon.trim() ? k.weapon.trim() : null
    if (w) byWeapon.set(w, (byWeapon.get(w) ?? 0) + 1)
  }
  const weapons: StatRow[] = [...byWeapon.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, n]) => ({ label, value: `${n} ${n === 1 ? 'kill' : 'kills'}` }))

  const hitRows = ownHitRows(t)
  let hits: StatRow[] = []
  if (hitRows) {
    const head = hitRows.reduce((n, d) => n + count(d.headshots), 0)
    const body = hitRows.reduce((n, d) => n + count(d.bodyshots), 0)
    const leg = hitRows.reduce((n, d) => n + count(d.legshots), 0)
    const total = head + body + leg
    hits = total
      ? [
          { label: 'Head', value: pct(head, total), hint: `${head} of ${total} hits` },
          { label: 'Body', value: pct(body, total), hint: `${body} of ${total} hits` },
          { label: 'Legs', value: pct(leg, total), hint: `${leg} of ${total} hits` },
        ]
      : []
  }

  const economy: ValorantMatchView['economy'] = (['pistol', 'full', 'half', 'eco'] as BuyBand[])
    .map((band) => {
      const rows = roundRows.filter(r => r.buy === band && r.result !== 'unknown')
      if (!rows.length) return null
      const w = rows.filter(r => r.result === 'won').length
      return { band, label: BAND_LABEL[band], value: `Won ${w} of ${rows.length}` }
    })
    .filter((r): r is StatRow & { band: BuyBand } => r !== null)

  const headline: StatRow[] = [
    { label: 'Rounds won', value: known ? `${won}–${known - won}` : NOT },
    { label: 'ADR', value: adr == null ? NOT : String(Math.round(adr)), hint: 'Average damage per round' },
    { label: 'Opening duels', value: openings ? `${openWon.length}–${openLost.length}` : NOT },
    { label: 'Headshot share', value: hits[0]?.value ?? NOT, hint: 'Share of your hits that landed on the head (hits, not shots fired)' },
  ]

  return { headline, roundRows, duels, weapons, hits, economy }
}

/** True when a list has at least one measured value. */
export function hasMeasured(rows: StatRow[]): boolean {
  return rows.some(r => r.value !== NOT)
}

/** The round to open from the post-game "Review this round": your first opening death in a lost round. */
export function reviewRoundFor(t: ValorantTimelineLike | null | undefined): number | null {
  const view = buildValorantMatchView(t)
  if (!view) return null
  const r = view.roundRows.find(x => x.opening === 'lost' && x.result === 'lost')
  return r ? r.round : null
}
