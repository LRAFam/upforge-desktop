import type { TrainerDifficulty } from './trainer-scenarios'

const DIFFICULTY_STAR_COUNT: Record<TrainerDifficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  pro: 4,
}

export function difficultyStarCount(difficulty: TrainerDifficulty): number {
  return DIFFICULTY_STAR_COUNT[difficulty] ?? 2
}

export function formatTrainerRank(rank: number | null | undefined): string | null {
  if (rank == null || rank < 1) return null
  return `#${rank.toLocaleString()}`
}
