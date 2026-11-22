import type { TrainerDifficulty } from './trainer-scenarios'

/** Manual runs and leaderboard filters must describe the same events. */
export const TRAINER_BOARD_DIFFICULTIES = ['easy', 'medium', 'hard', 'pro'] as const
export const TRAINER_BOARD_DURATIONS = [30, 60, 90, 120, 180] as const

export interface ManualTrainerOptions {
  difficulty: TrainerDifficulty
  duration_seconds: number
}
export interface ManualTrainerScope {
  accountId: number | null
  game: string
  scenario: string
}
type OptionStorage = Pick<Storage, 'getItem' | 'setItem'>

export const DEFAULT_MANUAL_TRAINER_OPTIONS: ManualTrainerOptions = { difficulty: 'medium', duration_seconds: 60 }

export function manualTrainerOptions(value: unknown): ManualTrainerOptions | null {
  if (!value || typeof value !== 'object') return null
  const { difficulty, duration_seconds } = value as Partial<ManualTrainerOptions>
  if (!TRAINER_BOARD_DIFFICULTIES.includes(difficulty as TrainerDifficulty)
    || !TRAINER_BOARD_DURATIONS.includes(duration_seconds as typeof TRAINER_BOARD_DURATIONS[number])) return null
  return { difficulty: difficulty!, duration_seconds: duration_seconds! }
}

function storage(): OptionStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}
function key(scope: ManualTrainerScope): string | null {
  if (!Number.isSafeInteger(scope.accountId) || scope.accountId! <= 0) return null
  return `uf.trainer.manual.v1:${scope.accountId}:${encodeURIComponent(scope.game)}:${encodeURIComponent(scope.scenario)}`
}

export function readManualTrainerOptions(scope: ManualTrainerScope, fallback: unknown, store: OptionStorage | null = storage()): ManualTrainerOptions {
  const k = key(scope)
  try {
    const saved = k ? store?.getItem(k) : null
    const options = saved ? manualTrainerOptions(JSON.parse(saved)) : null
    if (options) return options
  } catch { /* Unavailable or corrupt storage must not prevent a manual run. */ }
  return manualTrainerOptions(fallback) ?? { ...DEFAULT_MANUAL_TRAINER_OPTIONS }
}

export function writeManualTrainerOptions(scope: ManualTrainerScope, value: unknown, store: OptionStorage | null = storage()): void {
  const k = key(scope), options = manualTrainerOptions(value)
  if (!k || !options) return
  try { store?.setItem(k, JSON.stringify(options)) } catch { /* Practice still works without local storage. */ }
}
