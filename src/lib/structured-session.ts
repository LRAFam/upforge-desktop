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
  metadata?: Record<string, unknown> | null
  accuracy_pct?: number
  avg_reaction_ms?: number
  heatmap?: Array<{ x: number; y: number; hit: boolean }>
}

export interface SessionSummary {
  steps: SessionStep[]
  results: SessionHistoryRow[]
  avgScore: number
  focusScore: number | null
  focusScenario: TrainerScenarioKey | null
  warmupAvg: number | null
  cooldownScore: number | null
  aimBias: string | null
  totalDurationSeconds: number
  improvementVsWarmup: number | null
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
 * Bump difficulty when the player has scored well enough at the current tier
 * for enough recent sessions on this scenario.
 */
export function bumpDifficultyForProgression(
  scenario: TrainerScenarioKey,
  current: TrainerDifficulty,
  recentSessions: SessionHistoryRow[],
): TrainerDifficulty {
  const onScenario = recentSessions.filter(s => s.scenario === scenario).slice(0, PROGRESSION_SESSIONS_REQUIRED)

  if (
    onScenario.length >= PROGRESSION_SESSIONS_REQUIRED
    && onScenario.every(s => s.score >= PROGRESSION_MIN_SCORE)
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

export function coachingDrillToSessionDrill(drill: CoachingDrillLike): SessionDrill {
  return {
    scenario: resolveTrainerScenario(drill),
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
  const startIdx = Math.max(DIFFICULTY_ORDER.indexOf(fromVod), DIFFICULTY_ORDER.indexOf(configured))
  const start = DIFFICULTY_ORDER[Math.max(0, startIdx)] ?? 'medium'
  const bumped = bumpDifficultyForProgression(drill.scenario, start, recentSessions)

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

export function buildSessionSummary(steps: SessionStep[], results: SessionHistoryRow[]): SessionSummary {
  const scores = results.map(r => r.score)
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0

  const focusIdx = steps.findIndex(s => s.phase === 'focus')
  const focusResult = focusIdx >= 0 ? results[focusIdx] : null
  const warmupResults = results.filter((_, i) => steps[i]?.phase === 'warmup')
  const cooldownResult = results.find((_, i) => steps[i]?.phase === 'cooldown') ?? null

  const warmupAvg = warmupResults.length
    ? Math.round(warmupResults.reduce((a, r) => a + r.score, 0) / warmupResults.length)
    : null

  const focusScore = focusResult?.score ?? null
  const improvementVsWarmup =
    focusScore !== null && warmupAvg !== null ? focusScore - warmupAvg : null

  const totalDurationSeconds = steps.reduce((a, s) => a + s.duration_seconds, 0)

  return {
    steps,
    results,
    avgScore,
    focusScore,
    focusScenario: focusResult ? (steps[focusIdx]?.scenario ?? null) : null,
    warmupAvg,
    cooldownScore: cooldownResult?.score ?? null,
    aimBias: computeAimBias(focusResult?.heatmap),
    totalDurationSeconds,
    improvementVsWarmup,
  }
}

export const SESSION_AUTO_ADVANCE_SEC = 4

export const SESSION_PHASE_COLORS: Record<SessionPhase, string> = {
  warmup: 'amber',
  focus: 'red',
  cooldown: 'sky',
}
