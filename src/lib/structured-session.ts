/**
 * Guided training session: warmup → focus (VOD drill) → cooldown → summary.
 */

import {
  type TrainerScenarioKey,
  type TrainerDifficulty,
  resolveTrainerScenario,
  resolveTrainerDifficulty,
  resolveTrainerDuration,
  trainerScenarioDef,
} from './trainer-scenarios'
import { isCurrentScoringRun } from './training-result-metrics'

export type SessionPhase = 'warmup' | 'focus' | 'cooldown'

export interface SessionDrill {
  scenario: TrainerScenarioKey
  difficulty: TrainerDifficulty
  duration_seconds: number
  weakness: string
  weakness_score: number
  reason: string
  user_drill_id?: number
}

export interface SessionStep extends SessionDrill {
  phase: SessionPhase
  phaseLabel: string
}

export interface SessionHistoryRow {
  scenario: string
  score: number
  /** Run length; rows from GET /api/training/sessions always have it. */
  duration_seconds?: number
  /** When the run finished (the trainer's stamp). A guided step's run has it; with the scenario it finds the run's upload state. */
  completed_at?: string
  metadata?: Record<string, unknown> | null
  accuracy_pct?: number
  avg_reaction_ms?: number
  heatmap?: Array<{ x: number; y: number; hit: boolean }>
}

export interface SessionSummary {
  steps: SessionStep[]
  results: SessionHistoryRow[]
  focusScore: number | null
  focusScenario: TrainerScenarioKey | null
  cooldownScore: number | null
  aimBias: string | null
  totalDurationSeconds: number
  /**
   * Focus score minus the player's last run on the same settings (null when none). The warm-up and
   * cool-down run other settings or drills, so the summary never averages or compares across steps.
   */
  focusVsLast: number | null
}

/** "Easy · 30s": the settings a step ran on, shown next to its score. */
export function sessionStepSettings(step: Pick<SessionStep, 'difficulty' | 'duration_seconds'>): string {
  return `${step.difficulty.charAt(0).toUpperCase()}${step.difficulty.slice(1)} · ${step.duration_seconds}s`
}

const DIFFICULTY_ORDER: TrainerDifficulty[] = ['easy', 'medium', 'hard', 'pro']

const PROGRESSION_MIN_SCORE = 65
const PROGRESSION_SESSIONS_REQUIRED = 3

/** Complementary low-intensity scenario after focus work */
const COOLDOWN_FOR: Partial<Record<TrainerScenarioKey, TrainerScenarioKey>> = {
  flick: 'microadjust',
  gridshot: 'microadjust',
  sixshot: 'microadjust',
  microadjust: 'tracking',
  microflick: 'tracking',
  tracking: 'flick',
  strafe_track: 'microadjust',
  switching: 'tracking',
  strafe_aim: 'tracking',
  duel: 'microadjust',
}

export function difficultyFromVodBaseline(baselineScore: number): TrainerDifficulty {
  if (baselineScore >= 9) return 'hard'
  if (baselineScore >= 7) return 'medium'
  if (baselineScore >= 4) return 'easy'
  return 'easy'
}

export function nextDifficulty(current: TrainerDifficulty): TrainerDifficulty | null {
  const idx = DIFFICULTY_ORDER.indexOf(current)
  if (idx < 0 || idx >= DIFFICULTY_ORDER.length - 1) return null
  return DIFFICULTY_ORDER[idx + 1]
}

/**
 * Bump difficulty when the player has scored well enough at the current tier for enough recent runs.
 * Only runs at the drill's own settings count: this scenario at this difficulty and (when known) length,
 * like the API's plan. Runs at other tiers never count, so three near misses at Medium do not launch the
 * easier drill that replaced that drill at Medium again. Nor do runs scored by older rules than this app's
 * trainer uses for the drill. `recentSessions` is newest first.
 */
export function bumpDifficultyForProgression(
  scenario: TrainerScenarioKey,
  current: TrainerDifficulty,
  recentSessions: SessionHistoryRow[],
  durationSeconds?: number,
): TrainerDifficulty {
  const atTier = recentSessions
    .filter(s => s.scenario === scenario && s.metadata?.difficulty === current
      && (durationSeconds === undefined || s.duration_seconds === undefined || s.duration_seconds === durationSeconds)
      && isCurrentScoringRun({ scenario: s.scenario, metadata: s.metadata ?? undefined }))
    .slice(0, PROGRESSION_SESSIONS_REQUIRED)

  if (
    atTier.length >= PROGRESSION_SESSIONS_REQUIRED
    && atTier.every(s => s.score >= PROGRESSION_MIN_SCORE)
  ) {
    return nextDifficulty(current) ?? current
  }

  return current
}

export interface CoachingDrillLike {
  id?: number
  category: string
  title: string
  baseline_score: number
  trainer_scenario?: string | null
  trainer_difficulty?: string | null
  trainer_duration_seconds?: number | null
  godot_config?: { scenario?: string; difficulty?: string; duration_seconds?: number } | null
}

/** Null for drills the aim trainer cannot train (utility / economy / comms): they never join a trainer session. */
export function coachingDrillToSessionDrill(drill: CoachingDrillLike): SessionDrill | null {
  const scenario = resolveTrainerScenario(drill)
  if (!scenario) return null
  return {
    scenario,
    difficulty: resolveTrainerDifficulty(drill),
    duration_seconds: resolveTrainerDuration(drill),
    weakness: drill.category,
    weakness_score: drill.baseline_score,
    reason: drill.title,
    user_drill_id: drill.id,
  }
}

export function applyProgressionToDrill(
  drill: SessionDrill,
  recentSessions: SessionHistoryRow[],
): SessionDrill {
  const fromVod = difficultyFromVodBaseline(drill.weakness_score)
  const configured = drill.difficulty ?? fromVod
  const own = DIFFICULTY_ORDER.indexOf(configured)
  // An assigned drill (API id) starts at its own difficulty, as the API's plan does: the easier copy assigned
  // after a pause keeps its parent's review score, which must not lift it back. Other drills start no lower than
  // their score's tier.
  const startIdx = drill.user_drill_id != null && own >= 0 ? own : Math.max(DIFFICULTY_ORDER.indexOf(fromVod), own)
  const start = DIFFICULTY_ORDER[Math.max(0, startIdx)] ?? 'medium'
  const bumped = bumpDifficultyForProgression(drill.scenario, start, recentSessions, drill.duration_seconds)

  return { ...drill, difficulty: bumped }
}

export interface BuildSessionPlanInput {
  focusDrill: SessionDrill | null
  aiFocusArea?: string | null
  recentSessions?: SessionHistoryRow[]
}

function defaultFocusDrill(): SessionDrill {
  return {
    scenario: 'flick',
    difficulty: 'medium',
    duration_seconds: 60,
    weakness: 'mechanics',
    weakness_score: 5,
    reason: 'General aim session',
  }
}

function resolveFocus(input: BuildSessionPlanInput): SessionDrill {
  let focus = input.focusDrill ?? defaultFocusDrill()

  if (!input.focusDrill && input.aiFocusArea) {
    const key = input.aiFocusArea.toLowerCase().replace(/\s+/g, '_') as TrainerScenarioKey
    if (trainerScenarioDef(key)) {
      focus = { ...defaultFocusDrill(), scenario: key, reason: `AI focus: ${input.aiFocusArea}` }
    }
  }

  return applyProgressionToDrill(focus, input.recentSessions ?? [])
}

export function buildStructuredSessionPlan(input: BuildSessionPlanInput): SessionStep[] {
  const focus = resolveFocus(input)
  const cooldownScenario = COOLDOWN_FOR[focus.scenario] ?? 'microadjust'

  return [
    {
      ...focus,
      phase: 'warmup',
      phaseLabel: 'Warm-up',
      difficulty: 'easy',
      duration_seconds: 30,
      reason: `Warm up — ${trainerScenarioDef(focus.scenario)?.label ?? focus.scenario}`,
    },
    {
      ...focus,
      phase: 'focus',
      phaseLabel: 'Focus',
      reason: focus.reason,
    },
    {
      scenario: cooldownScenario,
      difficulty: 'easy',
      duration_seconds: 30,
      weakness: 'cooldown',
      weakness_score: 0,
      phase: 'cooldown',
      phaseLabel: 'Cool-down',
      reason: `Cool down — ${trainerScenarioDef(cooldownScenario)?.label ?? cooldownScenario}`,
    },
  ]
}

export function computeAimBias(
  heatmap: Array<{ x: number; y: number; hit: boolean }> | undefined,
): string | null {
  if (!heatmap?.length) return null

  const misses = heatmap.filter(p => !p.hit)
  if (misses.length < 4) return null

  let left = 0
  let right = 0
  let high = 0
  let low = 0

  for (const p of misses) {
    if (p.x < 0.45) left++
    else if (p.x > 0.55) right++
    if (p.y < 0.45) high++
    else if (p.y > 0.55) low++
  }

  const horiz = left > right * 1.4 ? 'left' : right > left * 1.4 ? 'right' : null
  const vert = high > low * 1.4 ? 'high' : low > high * 1.4 ? 'low' : null

  if (horiz && vert) return `Misses cluster ${horiz} and ${vert} of target`
  if (horiz) return `Misses tend ${horiz} of target — check overshoot on that axis`
  if (vert) return `Misses tend ${vert} of target — check vertical control`
  return null
}

export function buildSessionSummary(
  steps: SessionStep[],
  results: SessionHistoryRow[],
  focusVsLast: number | null = null,
): SessionSummary {
  const focusIdx = steps.findIndex(s => s.phase === 'focus')
  const focusResult = focusIdx >= 0 ? results[focusIdx] : null
  const cooldownResult = results.find((_, i) => steps[i]?.phase === 'cooldown') ?? null

  const totalDurationSeconds = steps.reduce((a, s) => a + s.duration_seconds, 0)

  return {
    steps,
    results,
    focusScore: focusResult?.score ?? null,
    focusScenario: focusResult ? (steps[focusIdx]?.scenario ?? null) : null,
    cooldownScore: cooldownResult?.score ?? null,
    aimBias: computeAimBias(focusResult?.heatmap),
    totalDurationSeconds,
    focusVsLast: focusResult ? focusVsLast : null,
  }
}

export const SESSION_AUTO_ADVANCE_SEC = 4

/**
 * What a guided session does with a trainer result:
 * - `other`: not this step's run (another drill, or a run the trainer started again from its end card with R):
 *   history only, and the session stays where it is;
 * - `finish`: the last step is done;
 * - `next_in_trainer`: the step is done and the trainer is still open on its end card, offering the next step (N).
 *   Nothing starts by itself; N there, or Start now here, opens it;
 * - `next_countdown`: the step is done and the trainer closed after its result: the next step starts after the countdown.
 */
export type GuidedResultStep = 'other' | 'finish' | 'next_in_trainer' | 'next_countdown'

export function guidedResultStep(input: {
  stepScenario: string | null | undefined
  resultScenario: string
  launch: { keep_open?: boolean; repeat_of?: number } | null | undefined
  isLastStep: boolean
}): GuidedResultStep {
  if (!input.stepScenario || input.stepScenario !== input.resultScenario) return 'other'
  if (input.launch?.repeat_of != null) return 'other'
  if (input.isLastStep) return 'finish'
  return input.launch?.keep_open === true ? 'next_in_trainer' : 'next_countdown'
}

/** The drill the trainer's end card offers after step `stepIndex`, or undefined on the last step. */
export function guidedNextScenario(plan: ReadonlyArray<{ scenario: string }> | null | undefined, stepIndex: number): string | undefined {
  return plan?.[stepIndex + 1]?.scenario
}

export const SESSION_PHASE_COLORS: Record<SessionPhase, string> = {
  warmup: 'amber',
  focus: 'red',
  cooldown: 'sky',
}
