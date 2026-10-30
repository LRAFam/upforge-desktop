/**
 * League focus wording. The focus itself (metric, target, checks) comes from the API, measured
 * from Match-V5 data; the shared `focusSlots` from ./focus draws the game slots.
 * Counts are whole numbers in sentences (rulebook: counts in sentences).
 */
import type { Focus } from './focus'

const whole = (n: number) => Math.round(n)

/** The goal as a sentence fragment, e.g. "Die 5 times or fewer". */
export function lolFocusGoal(f: Pick<Focus, 'metric' | 'target' | 'label' | 'better'>): string {
  const t = f.target
  switch (f.metric) {
    case 'deaths': return whole(t) === 0 ? 'Finish games with no deaths' : `Die ${whole(t)} ${whole(t) === 1 ? 'time' : 'times'} or fewer`
    case 'cs_at_10': return `Reach ${whole(t)} CS by 10:00`
    case 'vision_per_min': return `Keep vision score at ${t.toFixed(1)} per minute or more`
    case 'kill_participation': return `Take part in ${whole(t * 100)}% of your team's kills`
    default: return `${f.label} ${f.better === 'lower' ? 'at or under' : 'at or over'} ${t}`
  }
}

/** Where the player started, in the metric's own unit. */
export function lolFocusBaseline(f: Pick<Focus, 'metric' | 'baseline'>): string {
  const b = f.baseline
  switch (f.metric) {
    case 'deaths': return `${whole(b)} ${whole(b) === 1 ? 'death' : 'deaths'} a game`
    case 'cs_at_10': return `${whole(b)} CS at 10:00`
    case 'vision_per_min': return `${b.toFixed(1)} vision per minute`
    case 'kill_participation': return `${whole(b * 100)}% kill participation`
    default: return String(b)
  }
}

export function lolFocusHeadline(f: Focus): string {
  const goal = lolFocusGoal(f)
  if (f.progress.status === 'achieved') return `Focus achieved: ${goal.charAt(0).toLowerCase()}${goal.slice(1)}`
  if (f.progress.status === 'missed') return `Not this time: ${goal.charAt(0).toLowerCase()}${goal.slice(1)}`
  return goal
}

export function lolFocusSubline(f: Focus): string {
  const p = f.progress
  if (p.status === 'achieved') return `Hit in ${p.hits} of ${p.games_played} games. A new focus starts with your next matches.`
  if (p.status === 'missed') return `Hit in ${p.hits} of ${p.games_played} games. A new focus starts with your next matches.`
  const left = Math.max(0, p.hits_required - p.hits)
  const games = Math.max(0, p.games_required - p.games_played)
  return `Lately: ${lolFocusBaseline(f)}. Hit it in ${left} more of your next ${games} ${games === 1 ? 'game' : 'games'}.`
}
