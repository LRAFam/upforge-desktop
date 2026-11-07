/**
 * Pure helpers for the UI v3 Practice screen (no Vue, no IPC) so they can be unit-tested.
 * All numbers come from the training API via TrainingHubView; nothing here invents data.
 */
import { isBetaScenario, type TrainerScenarioKey } from '../../../lib/trainer-scenarios'
import { coachingStatLine, isMatchStatsDrill, type CoachingDrillSourceFields, type CoachingStatLine } from '../../../lib/coaching-drill-stat'
import { isCurrentScoringRun } from '../../../lib/training-result-metrics'

export type PracticeTab = 'train' | 'analytics' | 'leaderboards' | 'loadouts'
export type PracticeCategory = 'all' | 'aim' | 'reaction' | 'precision' | 'duel'

export const PRACTICE_TABS: Array<{ id: PracticeTab; label: string }> = [
  { id: 'train', label: 'Train' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'leaderboards', label: 'Leaderboards' },
  { id: 'loadouts', label: 'Loadouts' },
]

export interface PracticeStats {
  streak: number
  thisWeekCount: number
  improvement: number | null
  totalSessions: number
  comparisonLabel: string
}

export interface PracticeStatItem {
  value: string
  label: string
  tone?: 'win' | 'loss'
  title?: string
}

/** Header stats in reading order. Unknown values show an em dash, never a made-up zero. */
export function practiceStatItems(s: PracticeStats): PracticeStatItem[] {
  const items: PracticeStatItem[] = [
    // Counts are whole numbers: no streak is 0, like the other counts (audit 2026-11-02).
    { value: `${Math.max(0, s.streak)}`, label: 'day streak' },
    { value: `${s.thisWeekCount}`, label: s.thisWeekCount === 1 ? 'session this week' : 'sessions this week' },
  ]
  if (s.improvement !== null) {
    items.push({
      value: `${s.improvement > 0 ? '+' : ''}${s.improvement}`,
      label: 'vs last week',
      tone: s.improvement > 0 ? 'win' : s.improvement < 0 ? 'loss' : undefined,
      title: `Matched runs: ${s.comparisonLabel}`,
    })
  }
  items.push({ value: `${s.totalSessions}`, label: 'all time' })
  return items
}

const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', pro: 'Pro' }

export function difficultyLabel(d: string): string {
  return DIFFICULTY_LABEL[d] ?? d
}

export function durationLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`
}

/** Personal best as shown on a drill tile: a number, or "Not played" when there is none. */
export function personalBestLabel(pb: number | null | undefined): string {
  return typeof pb === 'number' && Number.isFinite(pb) ? `${Math.round(pb)}` : 'Not played'
}

export interface SessionStepLike {
  phaseLabel: string
  scenario: TrainerScenarioKey | string
  duration_seconds: number
}

/** Total session length in whole minutes (rounded up), or null when there is no plan. */
export function sessionMinutes(steps: SessionStepLike[]): number | null {
  if (!steps.length) return null
  const total = steps.reduce((a, s) => a + (Number.isFinite(s.duration_seconds) ? s.duration_seconds : 0), 0)
  return total > 0 ? Math.max(1, Math.ceil(total / 60)) : null
}

// ── Scoring update ────────────────────────────────────────────────────────────
/**
 * Trainer 1.11 (Nov 2026) sends `metadata.scoring_version = 3` (scoring fixed; tracking drills score time on
 * target). Personal bests, comparisons and leaderboards only count runs of CURRENT_SCORING_VERSION; v2 and
 * older runs stay in history but have no best. Say so instead of "Not played".
 */
export const SCORING_UPDATE_LABEL = 'Nov 2026'

interface RunLike { scenario: string; score: number; metadata?: Record<string, unknown> }

export function isOldScoringRun(run: RunLike): boolean {
  return !isCurrentScoringRun(run)
}

/** Best score per drill among runs from before the scoring update (they don't count as personal bests). */
export function oldScoringBests(runs: readonly RunLike[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of runs ?? []) {
    if (!isOldScoringRun(r) || !Number.isFinite(r.score)) continue
    out[r.scenario] = Math.max(out[r.scenario] ?? -Infinity, r.score)
  }
  return out
}

/**
 * One honest line when the player has runs from before the scoring update, or null when they don't.
 * `runs` is the history page (newest first, capped by the API), `total` the full count.
 */
export function oldScoringNote(runs: readonly RunLike[] | null | undefined, total: number): string | null {
  const list = runs ?? []
  const old = list.filter(isOldScoringRun).length
  if (!old) return null
  const exact = list.length >= total
  const what = exact ? `Your ${old} ${old === 1 ? 'run' : 'runs'} from before ${SCORING_UPDATE_LABEL}` : `Runs from before ${SCORING_UPDATE_LABEL}`
  return `${what} used the old scoring, so ${old === 1 && exact ? 'it doesn’t' : 'they don’t'} count towards personal bests. They stay in your history.`
}

/** Short caption for a drill with no current best: "Old best 53" or "Not played". */
export function noBestCaption(oldBest: number | null | undefined): string {
  return typeof oldBest === 'number' && Number.isFinite(oldBest) ? `Old best ${Math.round(oldBest)}` : 'Not played'
}

// ── Drills from your matches (coaching drills from /api/drills) ───────────────
export interface CoachingDrillLike extends CoachingDrillSourceFields {
  id: number
  category: string
  title: string
  instructions: string | null
  success_metric: string | null
  practice_mode: string | null
  trainer_scenario?: string | null
  godot_config?: { scenario?: string } | null
}

export interface MatchDrillRow {
  id: number
  /** What the drill fixes, from the coaching drill's own title (difficulty tags removed). */
  title: string
  /** "Utility · Custom game" or "Mechanics · Trainer: Flick". */
  meta: string
  /**
   * Trainer scenario only when the drill names one (`trainer_scenario`). `godot_config.scenario` is NOT used:
   * the API fills it from the category when there is none (DrillService::buildGodotConfig →
   * TrainerScenarios::validateScenario), which turned "Empress Timing" into "Flick".
   */
  trainerScenario: string | null
  steps: string | null
  goal: string | null
  /** From repeated match-stat problems (`source: 'match_stats'`), not a VOD. */
  fromMatches: boolean
  /** Coach's reason quoting the player's numbers (match-stats drills only). */
  why: string | null
  /** "HS 16% → target 19% · now 17%" (match-stats drills only). */
  stat: CoachingStatLine | null
  beta: boolean
}

const CATEGORY_LABEL: Record<string, string> = {
  mechanics: 'Mechanics', crosshair_placement: 'Crosshair placement', game_sense: 'Game sense',
  positioning: 'Positioning', utility_usage: 'Utility', economy: 'Economy', communication: 'Comms',
  agent_specific: 'Agent play', aim: 'Aim',
}
const MODE_LABEL: Record<string, string> = {
  deathmatch: 'Deathmatch', custom_game: 'Custom game', range: 'The Range', ranked: 'Ranked', unrated: 'Unrated',
}

function words(key: string): string {
  const s = key.replace(/_/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : ''
}

/** "Empress Timing — Pre-Execute Only Custom Practice (Hard)" → without the trailing difficulty tags. */
export function cleanDrillTitle(title: string): string {
  return title.replace(/(\s*\((easy|medium|hard|pro)\))+\s*$/i, '').trim() || title.trim()
}

export function matchDrillRows(
  drills: readonly CoachingDrillLike[] | null | undefined,
  scenarioLabel: (key: string) => string | undefined,
  limit = 3,
): MatchDrillRow[] {
  return (drills ?? []).slice(0, limit).map(d => {
    const named = d.trainer_scenario ?? null
    const label = named ? scenarioLabel(named) : undefined
    const trainerScenario = named && label ? named : null
    const where = trainerScenario ? `Trainer: ${label}` : d.practice_mode ? (MODE_LABEL[d.practice_mode] ?? words(d.practice_mode)) : 'In game'
    const category = CATEGORY_LABEL[d.category] ?? words(d.category)
    return {
      id: d.id,
      title: cleanDrillTitle(d.title),
      meta: [category, where].filter(Boolean).join(' · '),
      trainerScenario,
      steps: d.instructions?.trim() || null,
      goal: d.success_metric?.trim() || null,
      ...coachingDrillExtras(d, trainerScenario),
    }
  })
}

/** Match-stats label, why line, stat line and Beta tag for a coaching drill (VOD drills get none but Beta). */
export function coachingDrillExtras(
  d: CoachingDrillSourceFields,
  scenario: string | null | undefined,
): Pick<MatchDrillRow, 'fromMatches' | 'why' | 'stat' | 'beta'> {
  const fromMatches = isMatchStatsDrill(d)
  return {
    fromMatches,
    why: fromMatches ? d.why?.trim() || null : null,
    stat: fromMatches ? coachingStatLine(d.stat) : null,
    beta: d.beta === true || isBetaScenario(scenario),
  }
}

/**
 * One rule for every game (cross-game pass 2026-11-02). The drill library, daily challenge and quick play are
 * general aim practice for every game. The focus, the focus reason on the guided session and the calibration
 * tool come from Valorant analyses, so only Valorant shows them. "Drills from your matches" are coach-assigned
 * for the player's game, so they always show (Nov 2026).
 * The note is the one honest line a non-Valorant player sees. Sensitivity: the trainer converts CS2 and
 * Deadlock (0.022°/count, upforge-trainer MouseSensitivity.gd); League has no aim sensitivity.
 */
export interface PracticeGameScope {
  matchCoaching: boolean
  note: string | null
}

export function practiceGameScope(game: string | null | undefined): PracticeGameScope {
  switch (game) {
    case 'valorant':
    case null:
    case undefined:
      return { matchCoaching: true, note: null }
    case 'cs2':
      return { matchCoaching: false, note: 'These are general aim drills. Set the trainer to CS2 sensitivity in Settings › Trainer so they feel like your game. Drills the coach adds from your match stats are Valorant-only for now.' }
    case 'deadlock':
      return { matchCoaching: false, note: 'These are general aim drills. Set the trainer to Deadlock sensitivity in Settings › Trainer so they feel like your game. Drills the coach adds from your match stats are Valorant-only for now.' }
    case 'lol':
      return { matchCoaching: false, note: 'These are aim drills for shooters, so they won’t help much in League. League drills come with Riot stats coaching, on the match page of a recorded game.' }
    default:
      return { matchCoaching: false, note: 'These are general aim drills. Drills the coach adds from your match stats are Valorant-only for now.' }
  }
}

/**
 * "Do this next" on Practice: one drill, so the player isn't left choosing between six sections.
 * The drill a match report just recommended (passed in the route) wins; then the player's top drill
 * from their matches. The focus plan and the guided session are handled by the page before/after this.
 */
export interface NextDrill {
  source: 'match_report' | 'match_drill'
  title: string
  why: string | null
  steps: string | null
  goal: string | null
  /** Trainer drill to launch, when there is one. */
  scenario: string | null
  matchDrillId: number | null
}

export interface PracticeRouteDrill { drill?: unknown; why?: unknown; scenario?: unknown }

const routeText = (v: unknown, max: number): string | null => {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' && s.trim() ? s.trim().slice(0, max) : null
}

/** Route link from a match report: `/training?drill=…&why=…&scenario=…`. */
export function practiceRouteFromReport(drill: { text: string; why?: string | null } | null, scenario: string | null): { path: string; query: Record<string, string> } {
  const query: Record<string, string> = {}
  if (drill?.text) query.drill = drill.text
  if (drill?.why) query.why = drill.why
  if (scenario) query.scenario = scenario
  return { path: '/training', query }
}

export function pickNextDrill(
  route: PracticeRouteDrill,
  matchDrills: readonly MatchDrillRow[],
  availableScenarios: readonly string[],
): NextDrill | null {
  const text = routeText(route.drill, 400)
  if (text) {
    const scenario = routeText(route.scenario, 64)
    return {
      source: 'match_report',
      title: text,
      why: routeText(route.why, 300),
      steps: null,
      goal: null,
      scenario: scenario && availableScenarios.includes(scenario) ? scenario : null,
      matchDrillId: null,
    }
  }
  const top = matchDrills[0]
  if (!top) return null
  return {
    source: 'match_drill',
    title: top.title,
    why: top.why ?? null,
    steps: top.steps,
    goal: top.goal,
    scenario: top.trainerScenario,
    matchDrillId: top.id,
  }
}
