/**
 * Session coach (board P6): after two or more ranked losses in a row in the current
 * session, suggest a short break or a warm-up. Uses the player's own logged games only.
 * No claims about mood or health; whole numbers only.
 */
import { plural } from '../plural'

export interface RankedResult { startTime: number; rrEarned: number }

/** A new session starts when two games start more than this far apart. */
export const SESSION_GAP_MS = 2 * 60 * 60_000
/** The current session must have a game that started this recently. */
export const SESSION_ACTIVE_MS = 3 * 60 * 60_000
/** Personal pattern needs at least this many "next game after two losses" samples. */
export const PERSONAL_MIN_SAMPLES = 10

export interface SessionCoach {
  lossStreak: number
  headline: string
  detail: string
  /** True when the detail line uses the player's own history. */
  personal: boolean
}

const outcome = (g: RankedResult): 'win' | 'loss' | 'other' => (g.rrEarned > 0 ? 'win' : g.rrEarned < 0 ? 'loss' : 'other')

/** Split games (any order) into sessions, oldest first. */
export function splitSessions(games: RankedResult[]): RankedResult[][] {
  const sorted = [...games].filter(g => Number.isFinite(g.startTime)).sort((a, b) => a.startTime - b.startTime)
  const sessions: RankedResult[][] = []
  for (const g of sorted) {
    const cur = sessions[sessions.length - 1]
    if (cur && g.startTime - cur[cur.length - 1].startTime <= SESSION_GAP_MS) cur.push(g)
    else sessions.push([g])
  }
  return sessions
}

/** How the player did in the game right after two straight losses in the same session. */
export function afterTwoLosses(games: RankedResult[]): { wins: number; games: number } {
  let wins = 0
  let n = 0
  for (const s of splitSessions(games)) {
    for (let i = 2; i < s.length; i++) {
      if (outcome(s[i - 2]) === 'loss' && outcome(s[i - 1]) === 'loss') {
        const o = outcome(s[i])
        if (o === 'other') continue
        n++
        if (o === 'win') wins++
      }
    }
  }
  return { wins, games: n }
}

export function sessionCoach(games: RankedResult[], now = Date.now()): SessionCoach | null {
  const sessions = splitSessions(games)
  const current = sessions[sessions.length - 1]
  if (!current || now - current[current.length - 1].startTime > SESSION_ACTIVE_MS) return null
  let streak = 0
  for (let i = current.length - 1; i >= 0 && outcome(current[i]) === 'loss'; i--) streak++
  if (streak < 2) return null

  const headline = `${plural(streak, 'loss', 'losses')} in a row this session.`
  const after = afterTwoLosses(games)
  if (after.games >= PERSONAL_MIN_SAMPLES) {
    const decided = games.filter(g => outcome(g) !== 'other')
    const overallWins = decided.filter(g => outcome(g) === 'win').length
    const behind = after.wins / after.games < overallWins / Math.max(1, decided.length)
    return {
      lossStreak: streak,
      headline,
      detail: `After two losses in a row you've won ${after.wins} of your next ${plural(after.games, 'game')}, against ${overallWins} of ${decided.length} overall. ${behind ? 'A short break or a 5-minute warm-up before the next one is worth it.' : 'You usually bounce back, so a quick warm-up is enough if you keep going.'}`,
      personal: true,
    }
  }
  return {
    lossStreak: streak,
    headline,
    detail: 'A short break or a 5-minute warm-up before the next one helps you reset.',
    personal: false,
  }
}
