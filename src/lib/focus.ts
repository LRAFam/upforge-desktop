/** Focus loop types and display helpers (data from GET /api/focus and POST /api/match-report). */

export interface FocusCheck {
  match_id: string
  value: number
  hit: boolean
  played_at: string | null
}

export interface Focus {
  id: number
  metric: string
  label: string
  better: 'lower' | 'higher'
  baseline: number
  target: number
  checks: FocusCheck[]
  progress: { games_played: number; hits: number; games_required: number; hits_required: number; status: string }
  started_at: string | null
  completed_at: string | null
}

export interface FocusResponse {
  success: boolean
  focus: Focus | null
  history: Array<{ match_id: string; played_at: string | null; metrics: Record<string, number | null> }>
  notes_usage: { used: number; limit: number }
  /** Last locally synced report, restored by the main process for this account. */
  latest?: FocusUpdate | null
}

export interface NoteClaim { finding_id: string; text: string; rounds?: number[] }

export interface FocusUpdate {
  match_id: string
  focus: Focus | null
  focus_event: 'created' | 'checked' | 'achieved' | 'missed' | null
  /** Which linked account played the match. Alt-account games are coached but never checked against the focus. */
  account?: { is_main: boolean } | null
  /** Round-by-round shape of the match, derived on the PC from the Riot match it uploaded. */
  rounds?: MatchRoundFacts | null
  /** Last observed focus before a rotation; its status is not inferred. */
  previous_focus?: Focus | null
  report?: {
    notes?: { headline?: NoteClaim; subline?: NoteClaim; next_action?: NoteClaim; positive?: NoteClaim | null } | null
    notes_source?: string
  } | null
}

export interface FocusSyncResult {
  ok: boolean
  uploaded: number
  skipped: number
  reason?: string
  latest: FocusUpdate | null
}

/** Never pair cached notes with a different focus or a newer check from another device. */
export function hydrateFocusResponse(data: FocusResponse, latest: FocusUpdate | null): FocusResponse {
  const focus = data.focus
  const lastCheck = focus?.checks.at(-1)
  const matches = !!focus && !!latest?.focus && focus.id === latest.focus.id
    && (lastCheck ? lastCheck.match_id === latest.match_id : latest.focus.checks.length === 0)
  return { ...data, latest: matches ? { ...latest!, focus } : null }
}

export function focusTransitionText(update: FocusUpdate | null | undefined): string {
  const previous = update?.previous_focus
  if (!previous || !update?.focus || previous.id === update.focus.id) return ''
  const title = `${previous.label} ${previous.better === 'lower' ? 'under' : 'over'} ${pct(previous.target)}`
  if (previous.progress.status === 'achieved') return `You achieved your previous focus: ${title}. This is your next focus.`
  if (previous.progress.status === 'missed') return `Your previous focus ended without reaching its target: ${title}. This is your next focus.`
  return `Your focus changed from ${title} after a new match.`
}

export function focusSyncMessage(result: FocusSyncResult | null): string {
  if (!result || result.reason === 'sign_in_required') return 'Sign in to check your matches.'
  if (result.reason === 'sync_in_progress') return 'Your matches are already being checked.'
  if (result.reason === 'not_your_match') return 'The Riot account in Valorant does not match the account linked to UpForge.'
  if (result.reason === 'http_502') return 'The AI service is temporarily unavailable. Your match will be retried on the next check.'
  if (result.reason === 'network_error') return 'Could not reach UpForge. Your match will be retried on the next check.'
  if (result.reason?.startsWith('http_')) return 'UpForge could not process your match. It will be retried on the next check.'
  if (result.reason === 'invalid_match') return 'Some matches could not be processed because their match data was incomplete or rejected.'
  if (result.reason === 'riot_client_unavailable' || result.reason === 'fetch_failed') return 'Open Valorant (the Riot Client) so UpForge can read your recent matches.'
  if (result.reason === 'no_recent_matches') return 'No recent Valorant matches were found.'
  if (result.reason === 'some_matches_failed' || result.reason === 'match_history_unavailable') return 'Riot match details are not available yet. Please try again shortly.'
  if (!result.ok) return 'Could not check your matches. Please try again.'
  if (result.uploaded === 0) return "You're up to date."
  return `Checked ${result.uploaded} new match${result.uploaded === 1 ? '' : 'es'}.`
}

export const pct = (v: number | null | undefined): string => (v == null ? '—' : `${Math.round(v * 100)}%`)

/** Slots for the focus window: hit / miss / pending, in play order. */
export function focusSlots(focus: Focus): Array<'hit' | 'miss' | 'pending'> {
  const played: Array<'hit' | 'miss'> = focus.checks.map(c => (c.hit ? 'hit' : 'miss'))
  const pending = Math.max(0, focus.progress.games_required - played.length)
  return [...played, ...Array<'pending'>(pending).fill('pending')]
}

export function focusHeadline(focus: Focus): string {
  const goal = `${focus.better === 'lower' ? 'under' : 'over'} ${pct(focus.target)}`
  switch (focus.progress.status) {
    case 'achieved': return `Focus achieved: ${focus.label.toLowerCase()} ${goal}`
    case 'missed': return `Not this time: ${focus.label.toLowerCase()} ${goal}`
    default: return `${focus.label} ${goal}`
  }
}

export function focusSubline(focus: Focus): string {
  const p = focus.progress
  if (p.status === 'achieved') return `Hit in ${p.hits} of ${p.games_played} games. Your next focus starts after your next match.`
  if (p.status === 'missed') return `Hit in ${p.hits} of ${p.games_played} games. A new focus starts after your next match.`
  const left = p.hits_required - p.hits
  return `Started at ${pct(focus.baseline)}. Hit it in ${left} more of your next ${p.games_required - p.games_played} game${p.games_required - p.games_played === 1 ? '' : 's'}.`
}


/**
 * "Before → since" for practice: the focus baseline against the average of the games checked
 * since it started. Null until at least one game has been checked (no invented progress).
 */
export function focusBeforeAfter(focus: Focus | null | undefined): { before: string; since: string; games: number; improved: boolean } | null {
  const values = (focus?.checks ?? []).map(c => c.value).filter(v => typeof v === 'number' && Number.isFinite(v))
  if (!focus || !values.length || !Number.isFinite(focus.baseline)) return null
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const improved = focus.better === 'lower' ? avg < focus.baseline : avg > focus.baseline
  return { before: pct(focus.baseline), since: pct(avg), games: values.length, improved }
}

/** Bounded round summary for the last synced match (won/lost and where the player died first). */
export interface MatchRoundFacts {
  map: string | null
  ally: number
  enemy: number
  rounds: Array<{ won: boolean; diedFirst: boolean }>
}

const MAX_ROUNDS = 40

/**
 * Derive round facts from the uploaded Riot match payload (match_data). Same source the AI
 * service uses for `first_death_rounds`. Returns null when the shape is missing or unclear,
 * so the UI hides the section instead of guessing.
 */
export function deriveRoundFacts(matchData: unknown): MatchRoundFacts | null {
  const m = matchData as {
    map?: unknown
    finalStats?: { team?: unknown } | null
    finalScore?: { allyScore?: unknown; enemyScore?: unknown } | null
    roundSummaries?: Array<{ winningTeam?: unknown; playerWasFirstBlood?: unknown }> | null
  } | null
  const list = Array.isArray(m?.roundSummaries) ? m!.roundSummaries! : []
  if (!list.length || list.length > MAX_ROUNDS) return null
  const team = typeof m?.finalStats?.team === 'string' && m.finalStats.team ? m.finalStats.team : null
  const rounds: MatchRoundFacts['rounds'] = []
  for (const r of list) {
    const w = r?.winningTeam
    if (typeof w !== 'string' || !w) return null
    // Riot rounds name the winning team (Red/Blue); demo-derived rounds use ALLY/ENEMY.
    if (w !== 'ALLY' && w !== 'ENEMY' && !team) return null
    rounds.push({ won: w === 'ALLY' || (team !== null && w === team), diedFirst: r?.playerWasFirstBlood === true })
  }
  const won = rounds.filter(r => r.won).length
  const ally = Number(m?.finalScore?.allyScore)
  const enemy = Number(m?.finalScore?.enemyScore)
  const scoreOk = Number.isInteger(ally) && Number.isInteger(enemy) && ally + enemy === rounds.length && ally === won
  return {
    map: typeof m?.map === 'string' && m.map ? m.map : null,
    ally: scoreOk ? ally : won,
    enemy: scoreOk ? enemy : rounds.length - won,
    rounds,
  }
}

/** Accept only a well-formed, bounded MatchRoundFacts (used when reading persisted state). */
export function sanitizeRoundFacts(value: unknown): MatchRoundFacts | null {
  const v = value as MatchRoundFacts | null
  if (!v || !Array.isArray(v.rounds) || !v.rounds.length || v.rounds.length > MAX_ROUNDS) return null
  if (!v.rounds.every(r => r && typeof r.won === 'boolean' && typeof r.diedFirst === 'boolean')) return null
  if (!Number.isInteger(v.ally) || !Number.isInteger(v.enemy) || v.ally + v.enemy !== v.rounds.length) return null
  return { map: typeof v.map === 'string' ? v.map.slice(0, 40) : null, ally: v.ally, enemy: v.enemy, rounds: v.rounds.map(r => ({ won: r.won, diedFirst: r.diedFirst })) }
}

/** "What decided it" — only numbers that follow directly from the round facts. */
export function decidedStats(f: MatchRoundFacts | null | undefined): Array<{ value: string; caption: string; sub?: string; tone?: 'win' | 'loss' }> {
  if (!f) return []
  const df = f.rounds.filter(r => r.diedFirst)
  if (!df.length) return []
  const dfWon = df.filter(r => r.won).length
  const others = f.rounds.filter(r => !r.diedFirst)
  const othersWon = others.filter(r => r.won).length
  const items: Array<{ value: string; caption: string; sub?: string; tone?: 'win' | 'loss' }> = [
    { value: `${dfWon}/${df.length}`, caption: 'Rounds won after you died first', sub: `You died first in ${df.length} of ${f.rounds.length} rounds`, tone: dfWon * 2 < df.length ? 'loss' : undefined },
  ]
  if (others.length) items.push({ value: `${othersWon}/${others.length}`, caption: 'Rounds won when you didn’t', sub: 'Every other round this match' })
  return items
}
