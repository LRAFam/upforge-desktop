/**
 * Pure helpers for the UI v3 Practice screen (no Vue, no IPC) so they can be unit-tested.
 * All numbers come from the training API via TrainingHubView; nothing here invents data.
 */
import type { TrainerScenarioKey } from '../../../lib/trainer-scenarios'

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
    { value: s.streak > 0 ? `${s.streak}` : '—', label: 'day streak' },
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

export function practiceTitle(tab: PracticeTab): string {
  return tab === 'train' ? 'Practice' : PRACTICE_TABS.find(t => t.id === tab)?.label ?? 'Practice'
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

/**
 * Recommended drills are only trustworthy when they came from the API (coaching drills).
 * TrainingHubView seeds placeholder drills with example reasons; v3 never shows those.
 */
export function showRecommended(fromApi: boolean, count: number): boolean {
  return fromApi && count > 0
}
