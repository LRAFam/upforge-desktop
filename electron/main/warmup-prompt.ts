/**
 * Warm-up offer when a shooter opens: "Warm up first? Head Height, 1 minute" with Start / Not today.
 *
 * Shown as a normal OS toast (showAppNotification), which never takes focus from the game and is
 * already blocked while a match records. Rules (warmupSkipReason):
 * - Valorant, CS2 and Deadlock only; the setting (Settings › Trainer) is on.
 * - Once per game process: a re-armed watch after a match does not offer it again.
 * - Never while a match is live or the trainer is already open; re-checked when Start is pressed,
 *   since a toast can be clicked later from the notification centre.
 * - At most once per game per day; "Not today" hides it for every game until tomorrow.
 * - Not when a trainer run was done today (API history or a run finished on this PC).
 */
import fs from 'fs'
import type { CoachingDrill, SharedTrainingPlan, TrainingHistory } from '../../src/env'
import { applyProgressionToDrill, coachingDrillToSessionDrill, type SessionDrill } from '../../src/lib/structured-session'
import { isScenarioForGame, trainerScenarioDef } from '../../src/lib/trainer-scenarios'

export const WARMUP_GAMES: readonly string[] = ['valorant', 'cs2', 'deadlock']

/**
 * Wait after the game process appears before deciding. Valorant's process can first show while a map
 * is loading; the 2 s match probe needs a few samples to confirm menus (background-match-state).
 */
export const WARMUP_SETTLE_MS = 20_000

export interface WarmupState {
  /** Local day (YYYY-MM-DD) the offer was last shown, per game. */
  offered: Record<string, string>
  /** "Not today" was pressed on this local day (applies to every game). */
  declinedDay: string | null
  /** A trainer run finished on this PC on this local day. */
  lastRunDay: string | null
  counts: { shown: number; started: number; declined: number }
}

export function emptyWarmupState(): WarmupState {
  return { offered: {}, declinedDay: null, lastRunDay: null, counts: { shown: 0, started: 0, declined: 0 } }
}

export function normalizeWarmupState(raw: unknown): WarmupState {
  const base = emptyWarmupState()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>
  const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  if (r.offered && typeof r.offered === 'object') {
    for (const [game, d] of Object.entries(r.offered as Record<string, unknown>)) {
      const v = day(d)
      if (v) base.offered[game] = v
    }
  }
  base.declinedDay = day(r.declinedDay)
  base.lastRunDay = day(r.lastRunDay)
  const c = (r.counts && typeof r.counts === 'object' ? r.counts : {}) as Record<string, unknown>
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)
  base.counts = { shown: n(c.shown), started: n(c.started), declined: n(c.declined) }
  return base
}

/** Local calendar day, YYYY-MM-DD. */
export function localDayKey(at: Date | number): string {
  const d = typeof at === 'number' ? new Date(at) : at
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export type WarmupSkipReason =
  | 'disabled'
  | 'not_trainer_game'
  | 'game_closed'
  | 'match_live'
  | 'trainer_running'
  | 'declined_today'
  | 'offered_today'
  | 'ran_today'

export interface WarmupCheck {
  enabled: boolean
  game: string
  currentGame: string | null
  matchLive: boolean
  trainerRunning: boolean
  state: WarmupState
  today: string
  /** Undefined until history is known; the cheap checks run first. */
  ranToday?: boolean
}

/** Why the offer must not show, or null when it may. */
export function warmupSkipReason(c: WarmupCheck): WarmupSkipReason | null {
  if (!c.enabled) return 'disabled'
  if (!WARMUP_GAMES.includes(c.game)) return 'not_trainer_game'
  if (c.currentGame !== c.game) return 'game_closed'
  if (c.matchLive) return 'match_live'
  if (c.trainerRunning) return 'trainer_running'
  if (c.state.declinedDay === c.today) return 'declined_today'
  if (c.state.offered[c.game] === c.today) return 'offered_today'
  if (c.ranToday || c.state.lastRunDay === c.today) return 'ran_today'
  return null
}

/** True when any run in the API history finished on `today` (local day). */
export function historyHasRunOn(history: Pick<TrainingHistory, 'sessions'> | null | undefined, today: string): boolean {
  for (const s of history?.sessions ?? []) {
    const t = Date.parse(s?.completed_at ?? '')
    if (Number.isFinite(t) && localDayKey(t) === today) return true
  }
  return false
}

export interface WarmupDrill {
  scenario: string
  label: string
  difficulty: SessionDrill['difficulty']
  duration_seconds: number
  user_drill_id?: number
  context?: Record<string, unknown>
}

function fromSessionDrill(d: SessionDrill): WarmupDrill {
  return {
    scenario: d.scenario,
    label: trainerScenarioDef(d.scenario)?.label ?? d.scenario,
    difficulty: d.difficulty,
    duration_seconds: d.duration_seconds,
    ...(d.user_drill_id != null ? { user_drill_id: d.user_drill_id } : {}),
    context: { weakness: d.weakness, score: d.weakness_score },
  }
}

/**
 * The drill to offer: the player's first assigned drill that the trainer can run (Practice's
 * "Today's drills" order, with the same difficulty progression), else the plan's warm-up step.
 */
export function pickWarmupDrill(
  drills: readonly CoachingDrill[] | null | undefined,
  plan: SharedTrainingPlan | null | undefined,
  history: Pick<TrainingHistory, 'sessions'> | null | undefined,
  game: string,
): WarmupDrill | null {
  const sessions = history?.sessions ?? []
  for (const d of drills ?? []) {
    if (d.game != null && d.game !== game) continue
    const session = coachingDrillToSessionDrill(d)
    if (!session || !isScenarioForGame(session.scenario, game)) continue
    return fromSessionDrill(applyProgressionToDrill(session, sessions))
  }
  const step = plan?.steps?.find(s => s.phase === 'warmup' && trainerScenarioDef(s.scenario))
  if (!step) return null
  return {
    scenario: step.scenario,
    label: trainerScenarioDef(step.scenario)?.label ?? step.scenario_label,
    difficulty: step.difficulty,
    duration_seconds: step.duration_seconds,
    ...(step.user_drill_id != null ? { user_drill_id: step.user_drill_id } : {}),
    context: { weakness: step.category },
  }
}

export function warmupDurationText(seconds: number): string {
  if (seconds % 60 === 0) {
    const m = seconds / 60
    return m === 1 ? '1 minute' : `${m} minutes`
  }
  return `${seconds} seconds`
}

export const WARMUP_ACTIONS = ['Start', 'Not today'] as const

export function warmupCopy(drill: WarmupDrill): { title: string; body: string } {
  return { title: 'Warm up first?', body: `${drill.label}, ${warmupDurationText(drill.duration_seconds)}` }
}

export interface WarmupNotice {
  title: string
  body: string
  actions: readonly string[]
  onAction: (index: number) => void
  onClick: () => void
}

export interface WarmupData {
  drills: CoachingDrill[] | null
  plan: SharedTrainingPlan | null
  history: TrainingHistory | null
}

export interface WarmupDeps {
  isEnabled: () => boolean
  isSignedIn: () => boolean
  currentGame: () => string | null
  isMatchLive: () => boolean
  isTrainerRunning: () => boolean
  loadData: (game: string) => Promise<WarmupData>
  launch: (drill: WarmupDrill) => Promise<{ ok: boolean; error?: string }>
  notify: (notice: WarmupNotice) => void
  notifyError: (message: string) => void
  track: (event: 'warmup_prompt_shown' | 'warmup_prompt_started' | 'warmup_prompt_declined', props: Record<string, unknown>) => void
  readState: () => WarmupState
  writeState: (state: WarmupState) => void
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  log?: (msg: string) => void
}

export class WarmupPrompt {
  /** Games whose current process already had its chance (cleared on game-stopped). */
  private readonly seen = new Set<string>()
  private readonly timers = new Map<string, unknown>()

  constructor(private readonly deps: WarmupDeps) {}

  private now(): number { return this.deps.now?.() ?? Date.now() }
  private today(): string { return localDayKey(this.now()) }
  private log(msg: string): void { this.deps.log?.(`[Warmup] ${msg}`) }

  onGameStarted(game: string): void {
    if (!WARMUP_GAMES.includes(game) || this.seen.has(game)) return
    this.seen.add(game)
    const set = this.deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    this.timers.set(game, set(() => {
      this.timers.delete(game)
      void this.check(game).catch(err => this.log(`check failed: ${(err as Error)?.message ?? err}`))
    }, WARMUP_SETTLE_MS))
  }

  onGameStopped(game: string): void {
    this.seen.delete(game)
    const t = this.timers.get(game)
    if (t !== undefined) {
      (this.deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)))(t)
      this.timers.delete(game)
    }
  }

  /** A trainer run finished on this PC (any drill, any screen). */
  markRunFinished(): void {
    const state = this.deps.readState()
    state.lastRunDay = this.today()
    this.deps.writeState(state)
  }

  private skip(game: string, ranToday?: boolean): WarmupSkipReason | null {
    return warmupSkipReason({
      enabled: this.deps.isEnabled(),
      game,
      currentGame: this.deps.currentGame(),
      matchLive: this.deps.isMatchLive(),
      trainerRunning: this.deps.isTrainerRunning(),
      state: this.deps.readState(),
      today: this.today(),
      ranToday,
    })
  }

  /** Decide and show. Returns true when the offer was shown (tests). */
  async check(game: string): Promise<boolean> {
    const early = this.skip(game)
    if (early) { this.log(`not offered for ${game}: ${early}`); return false }
    // Drills and history come from the account; signed out there is nothing to offer or save to.
    if (!this.deps.isSignedIn()) { this.log(`not offered for ${game}: signed_out`); return false }
    const data = await this.deps.loadData(game)
    const today = this.today()
    // Re-check after the fetch: a match may have started meanwhile.
    const reason = this.skip(game, historyHasRunOn(data.history, today))
    if (reason) { this.log(`not offered for ${game}: ${reason}`); return false }
    const drill = pickWarmupDrill(data.drills, data.plan, data.history, game)
    if (!drill) { this.log(`not offered for ${game}: no_drill`); return false }

    const state = this.deps.readState()
    state.offered[game] = today
    state.counts.shown++
    this.deps.writeState(state)
    this.deps.track('warmup_prompt_shown', { game, scenario: drill.scenario })
    const copy = warmupCopy(drill)
    this.deps.notify({
      ...copy,
      actions: WARMUP_ACTIONS,
      onAction: (i) => { if (i === 0) void this.start(game, drill); else if (i === 1) this.decline(game, drill) },
      onClick: () => { void this.start(game, drill) },
    })
    this.log(`offered ${drill.scenario} for ${game}`)
    return true
  }

  /** Start pressed (or the toast clicked). Never launches during a match. */
  async start(game: string, drill: WarmupDrill): Promise<boolean> {
    if (this.deps.isMatchLive()) { this.log('Start ignored: a match is live'); return false }
    if (this.deps.isTrainerRunning()) { this.log('Start ignored: the trainer is already open'); return false }
    const state = this.deps.readState()
    state.counts.started++
    this.deps.writeState(state)
    this.deps.track('warmup_prompt_started', { game, scenario: drill.scenario })
    const res = await this.deps.launch(drill)
    if (!res.ok) this.deps.notifyError(res.error ?? 'The aim trainer did not start. Try again, or restart UpForge.')
    return res.ok
  }

  decline(game: string, drill: WarmupDrill): void {
    const state = this.deps.readState()
    state.declinedDay = this.today()
    state.counts.declined++
    this.deps.writeState(state)
    this.deps.track('warmup_prompt_declined', { game, scenario: drill.scenario })
  }
}

/** JSON file store for WarmupState (userData/warmup-prompt.json). */
export function fileWarmupStore(file: string): { read: () => WarmupState; write: (s: WarmupState) => void } {
  return {
    read: () => {
      try { return normalizeWarmupState(JSON.parse(fs.readFileSync(file, 'utf8'))) } catch { return emptyWarmupState() }
    },
    write: (s) => {
      try { fs.writeFileSync(file, JSON.stringify(s)) } catch { /* best effort */ }
    },
  }
}

/** Trainer kill on game start (TS1118-16): keep a drill the player started while this game was already open. */
export function shouldCloseTrainerOnGameStart(opts: { trainerRunning: boolean; launchedWhileGameOpen: string | null; game: string }): boolean {
  if (!opts.trainerRunning) return false
  return opts.launchedWhileGameOpen !== opts.game
}
