/** Focus streaks (board P6): consecutive on-target games across the player's focuses, and a copyable one-liner. */
import type { Focus } from '../focus'
import { pct } from '../focus'

/**
 * Games on target in a row inside one focus, counting back from the most recent check. A focus ends
 * after 2 hits in 3 games, so on its own this tops out at 2: prefer the server's streak (focusStreakFrom).
 */
export function focusStreak(focus: Focus | null | undefined): number {
  const checks = focus?.checks ?? []
  let n = 0
  for (let i = checks.length - 1; i >= 0 && checks[i].hit; i--) n++
  return n
}

/**
 * The streak to show and to earn badges with: the server's count across consecutive focuses in this
 * game (API focus_streak / streak), else the current focus's own trailing hits (older servers).
 */
export function focusStreakFrom(serverStreak: unknown, focus: Focus | null | undefined): number {
  return typeof serverStreak === 'number' && Number.isInteger(serverStreak) && serverStreak >= 0 ? serverStreak : focusStreak(focus)
}

/** Streak line under the focus slots; only from two games up. */
export function focusStreakLine(streak: number): string | null {
  return streak >= 2 ? `${streak} games in a row on target.` : null
}

/** Achievement ids earned by a streak (definitions live in useAchievements). */
export function focusStreakAchievements(streak: number): string[] {
  const ids: string[] = []
  if (streak >= 3) ids.push('focus-streak-3')
  if (streak >= 5) ids.push('focus-streak-5')
  return ids
}

/** "What I'm working on": one line a player can paste into LFG or Discord. */
export function focusShareLine(focus: Focus | null | undefined, game = 'Valorant'): string | null {
  if (!focus || focus.progress.status !== 'active') return null
  const goal = `${focus.better === 'lower' ? 'under' : 'over'} ${pct(focus.target)}`
  return `Working on: ${focus.label.toLowerCase()} ${goal} in ${game} (with UpForge).`
}
