import { describe, expect, it, vi } from 'vitest'
import type { CoachingDrill, SharedTrainingPlan, TrainingHistory } from '../../src/env'
import {
  WARMUP_SETTLE_MS,
  WarmupPrompt,
  emptyWarmupState,
  historyHasRunOn,
  localDayKey,
  normalizeWarmupState,
  pickWarmupDrill,
  shouldCloseTrainerOnGameStart,
  warmupCopy,
  warmupDurationText,
  warmupSkipReason,
  type WarmupCheck,
  type WarmupData,
  type WarmupDeps,
  type WarmupNotice,
  type WarmupState,
} from './warmup-prompt'

const NOW = new Date(2026, 10, 20, 18, 0, 0).getTime()
const TODAY = localDayKey(NOW)
const YESTERDAY = localDayKey(NOW - 24 * 3600_000)

function check(over: Partial<WarmupCheck> = {}): WarmupCheck {
  return {
    enabled: true, game: 'valorant', currentGame: 'valorant', matchLive: false, trainerRunning: false,
    state: emptyWarmupState(), today: TODAY, ...over,
  }
}

function drill(over: Partial<CoachingDrill> = {}): CoachingDrill {
  return {
    id: 7, category: 'crosshair_placement', title: 'Keep your crosshair at head height', instructions: null,
    success_metric: null, practice_mode: null, trainer_scenario: 'head_height', trainer_difficulty: 'medium',
    trainer_duration_seconds: 120, baseline_score: 5, target_score: 8, status: 'active', ...over,
  }
}

function runAt(ms: number): TrainingHistory['sessions'][number] {
  return {
    id: 1, duration_seconds: 60, scenario: 'flick', score: 50, accuracy_pct: 50, avg_reaction_ms: 300,
    consistency_score: 50, targets_hit: 10, targets_missed: 5, completed_at: new Date(ms).toISOString(),
  }
}

const history = (...sessions: TrainingHistory['sessions']): TrainingHistory => ({ total: sessions.length, sessions, by_scenario: {} })

describe('warmupSkipReason (show / not-show rules)', () => {
  it('shows when a shooter opened, nothing is live and nothing happened today', () => {
    expect(warmupSkipReason(check())).toBeNull()
    expect(warmupSkipReason(check({ game: 'cs2', currentGame: 'cs2' }))).toBeNull()
    expect(warmupSkipReason(check({ game: 'deadlock', currentGame: 'deadlock' }))).toBeNull()
  })

  it('never during a match', () => {
    expect(warmupSkipReason(check({ matchLive: true }))).toBe('match_live')
  })

  it('respects the setting', () => {
    expect(warmupSkipReason(check({ enabled: false }))).toBe('disabled')
  })

  it('only for Valorant, CS2 and Deadlock', () => {
    expect(warmupSkipReason(check({ game: 'lol', currentGame: 'lol' }))).toBe('not_trainer_game')
  })

  it('not when the game closed meanwhile, or the trainer is already open', () => {
    expect(warmupSkipReason(check({ currentGame: null }))).toBe('game_closed')
    expect(warmupSkipReason(check({ trainerRunning: true }))).toBe('trainer_running')
  })

  it('at most once per day per game', () => {
    const state = emptyWarmupState()
    state.offered.valorant = TODAY
    expect(warmupSkipReason(check({ state }))).toBe('offered_today')
    // Another game is still offered the same day.
    expect(warmupSkipReason(check({ state, game: 'cs2', currentGame: 'cs2' }))).toBeNull()
    // Yesterday's offer does not block today.
    state.offered.valorant = YESTERDAY
    expect(warmupSkipReason(check({ state }))).toBeNull()
  })

  it('"Not today" hides it for every game until tomorrow', () => {
    const state = emptyWarmupState()
    state.declinedDay = TODAY
    expect(warmupSkipReason(check({ state }))).toBe('declined_today')
    expect(warmupSkipReason(check({ state, game: 'cs2', currentGame: 'cs2' }))).toBe('declined_today')
    expect(warmupSkipReason(check({ state, today: localDayKey(NOW + 24 * 3600_000) }))).toBeNull()
  })

  it('not after a trainer run today (API history or this PC)', () => {
    expect(warmupSkipReason(check({ ranToday: true }))).toBe('ran_today')
    const state = emptyWarmupState()
    state.lastRunDay = TODAY
    expect(warmupSkipReason(check({ state }))).toBe('ran_today')
    state.lastRunDay = YESTERDAY
    expect(warmupSkipReason(check({ state }))).toBeNull()
  })
})

describe('historyHasRunOn', () => {
  it('counts only runs finished on the local day', () => {
    expect(historyHasRunOn(history(runAt(NOW - 3600_000)), TODAY)).toBe(true)
    expect(historyHasRunOn(history(runAt(NOW - 30 * 3600_000)), TODAY)).toBe(false)
    expect(historyHasRunOn(null, TODAY)).toBe(false)
    expect(historyHasRunOn({ sessions: [{ ...runAt(NOW), completed_at: 'nope' }] }, TODAY)).toBe(false)
  })
})

describe('pickWarmupDrill', () => {
  const plan: SharedTrainingPlan = {
    version: 1, source: { type: 'starter', drill_id: null },
    focus: { scenario: 'flick', label: 'Flick', category: 'aim', reason: 'x' }, total_duration_seconds: 180,
    steps: [
      { phase: 'warmup', phase_label: 'Warm-up', scenario: 'gridshot', scenario_label: 'Gridshot', difficulty: 'easy', duration_seconds: 60, category: 'aim', reason: 'x', user_drill_id: null },
    ],
  }

  it('offers the first assigned drill the trainer can run, with its run counting towards it', () => {
    const d = pickWarmupDrill([drill({ trainer_scenario: null, category: 'economy', godot_config: null }), drill()], plan, null, 'valorant')
    expect(d).toMatchObject({ scenario: 'head_height', label: 'Head Height Corridor', duration_seconds: 120, user_drill_id: 7 })
  })

  it('skips drills for another game', () => {
    expect(pickWarmupDrill([drill({ game: 'cs2' })], null, null, 'valorant')).toBeNull()
  })

  it('falls back to the plan warm-up step', () => {
    expect(pickWarmupDrill([], plan, null, 'cs2')).toMatchObject({ scenario: 'gridshot', difficulty: 'easy', duration_seconds: 60 })
    expect(pickWarmupDrill(null, null, null, 'cs2')).toBeNull()
  })
})

describe('copy', () => {
  it('names the drill and its length', () => {
    expect(warmupDurationText(120)).toBe('2 minutes')
    expect(warmupDurationText(60)).toBe('1 minute')
    expect(warmupDurationText(90)).toBe('90 seconds')
    expect(warmupCopy({ scenario: 'head_height', label: 'Head Height', difficulty: 'medium', duration_seconds: 120 }))
      .toEqual({ title: 'Warm up first?', body: 'Head Height, 2 minutes' })
  })
})

describe('normalizeWarmupState', () => {
  it('drops junk and keeps valid days', () => {
    expect(normalizeWarmupState(null)).toEqual(emptyWarmupState())
    const s = normalizeWarmupState({ offered: { valorant: TODAY, cs2: 5 }, declinedDay: 'x', lastRunDay: TODAY, counts: { shown: 2, started: -1 } })
    expect(s.offered).toEqual({ valorant: TODAY })
    expect(s.declinedDay).toBeNull()
    expect(s.lastRunDay).toBe(TODAY)
    expect(s.counts).toEqual({ shown: 2, started: 0, declined: 0 })
  })
})

describe('shouldCloseTrainerOnGameStart (TS1118-16)', () => {
  it('closes a drill started before the game opened, keeps one started with the game open', () => {
    expect(shouldCloseTrainerOnGameStart({ trainerRunning: true, launchedWhileGameOpen: null, game: 'valorant' })).toBe(true)
    expect(shouldCloseTrainerOnGameStart({ trainerRunning: true, launchedWhileGameOpen: 'cs2', game: 'valorant' })).toBe(true)
    expect(shouldCloseTrainerOnGameStart({ trainerRunning: true, launchedWhileGameOpen: 'valorant', game: 'valorant' })).toBe(false)
    expect(shouldCloseTrainerOnGameStart({ trainerRunning: false, launchedWhileGameOpen: null, game: 'valorant' })).toBe(false)
  })
})

describe('WarmupPrompt', () => {
  function setup(over: Partial<WarmupDeps> = {}, data: Partial<WarmupData> = {}) {
    let state: WarmupState = emptyWarmupState()
    const notices: WarmupNotice[] = []
    const timers: Array<() => void> = []
    const flags = { matchLive: false, game: 'valorant' as string | null }
    const deps: WarmupDeps = {
      isEnabled: () => true,
      isSignedIn: () => true,
      currentGame: () => flags.game,
      isMatchLive: () => flags.matchLive,
      isTrainerRunning: () => false,
      loadData: vi.fn(async () => ({ drills: [drill()], plan: null, history: history(), ...data })),
      launch: vi.fn(async () => ({ ok: true })),
      notify: (n) => { notices.push(n) },
      notifyError: vi.fn(),
      track: vi.fn(),
      readState: () => JSON.parse(JSON.stringify(state)),
      writeState: (s) => { state = s },
      now: () => NOW,
      setTimer: (fn, ms) => { expect(ms).toBe(WARMUP_SETTLE_MS); timers.push(fn); return timers.length },
      clearTimer: (h) => { timers[(h as number) - 1] = () => {} },
      ...over,
    }
    const prompt = new WarmupPrompt(deps)
    const flush = async () => { while (timers.length) timers.shift()!(); await new Promise(r => setTimeout(r, 0)) }
    return { prompt, deps, notices, flags, flush, state: () => state, timers }
  }

  it('shows once after the game opens, with Start / Not today', async () => {
    const t = setup()
    t.prompt.onGameStarted('valorant')
    await t.flush()
    expect(t.notices).toHaveLength(1)
    expect(t.notices[0]).toMatchObject({ title: 'Warm up first?', body: 'Head Height Corridor, 2 minutes', actions: ['Start', 'Not today'] })
    expect(t.state().offered.valorant).toBe(TODAY)
    expect(t.deps.track).toHaveBeenCalledWith('warmup_prompt_shown', { game: 'valorant', scenario: 'head_height' })
  })

  it('a re-armed watch for the same game process does not offer again', async () => {
    const t = setup()
    t.prompt.onGameStarted('valorant')
    t.prompt.onGameStarted('valorant')
    expect(t.timers).toHaveLength(1)
  })

  it('a second launch of the game the same day does not offer again', async () => {
    const t = setup()
    t.prompt.onGameStarted('valorant')
    await t.flush()
    t.prompt.onGameStopped('valorant')
    t.prompt.onGameStarted('valorant')
    await t.flush()
    expect(t.notices).toHaveLength(1)
  })

  it('closing the game before the settle delay cancels the offer', async () => {
    const t = setup()
    t.prompt.onGameStarted('valorant')
    t.prompt.onGameStopped('valorant')
    await t.flush()
    expect(t.notices).toHaveLength(0)
  })

  it('nothing shows when a match goes live during the settle delay or the fetch', async () => {
    const t = setup()
    t.prompt.onGameStarted('valorant')
    t.flags.matchLive = true
    await t.flush()
    expect(t.notices).toHaveLength(0)

    const u = setup({ loadData: async () => { u.flags.matchLive = true; return { drills: [drill()], plan: null, history: null } } })
    expect(await u.prompt.check('valorant')).toBe(false)
    expect(u.notices).toHaveLength(0)
  })

  it('nothing shows after a run today in the API history', async () => {
    const t = setup({}, { history: history(runAt(NOW - 600_000)) })
    expect(await t.prompt.check('valorant')).toBe(false)
  })

  it('nothing shows after a run finished on this PC today', async () => {
    const t = setup()
    t.prompt.markRunFinished()
    expect(await t.prompt.check('valorant')).toBe(false)
    expect(t.deps.loadData).not.toHaveBeenCalled()
  })

  it('nothing shows when signed out or there is no drill', async () => {
    expect(await setup({ isSignedIn: () => false }).prompt.check('valorant')).toBe(false)
    expect(await setup({}, { drills: [], plan: null }).prompt.check('valorant')).toBe(false)
  })

  it('Start launches the drill like Practice and counts it', async () => {
    const t = setup()
    await t.prompt.check('valorant')
    t.notices[0].onAction(0)
    await new Promise(r => setTimeout(r, 0))
    expect(t.deps.launch).toHaveBeenCalledWith(expect.objectContaining({ scenario: 'head_height', duration_seconds: 120, user_drill_id: 7 }))
    expect(t.state().counts).toEqual({ shown: 1, started: 1, declined: 0 })
    expect(t.deps.track).toHaveBeenCalledWith('warmup_prompt_started', { game: 'valorant', scenario: 'head_height' })
  })

  it('Start pressed later from the notification centre does nothing during a match', async () => {
    const t = setup()
    await t.prompt.check('valorant')
    t.flags.matchLive = true
    t.notices[0].onClick()
    await new Promise(r => setTimeout(r, 0))
    expect(t.deps.launch).not.toHaveBeenCalled()
  })

  it('a failed launch says so', async () => {
    const t = setup({ launch: async () => ({ ok: false, error: 'The aim trainer is missing.' }) })
    await t.prompt.check('valorant')
    expect(await t.prompt.start('valorant', pickWarmupDrill([drill()], null, null, 'valorant')!)).toBe(false)
    expect(t.deps.notifyError).toHaveBeenCalledWith('The aim trainer is missing.')
  })

  it('"Not today" hides it until tomorrow, for every game', async () => {
    const t = setup()
    await t.prompt.check('valorant')
    t.notices[0].onAction(1)
    expect(t.state().declinedDay).toBe(TODAY)
    expect(t.state().counts.declined).toBe(1)
    t.flags.game = 'cs2'
    expect(await t.prompt.check('cs2')).toBe(false)
  })
})
