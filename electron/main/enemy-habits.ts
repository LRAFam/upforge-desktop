/**
 * Enemy habits — this match only. Where the enemy team got their kills (and opening kills),
 * by callout, from Riot's per-kill position snapshots (round replay). Counted facts only:
 * no AI text, no guesses about intent. A callout is only reported when it repeats (>= MIN_REPEATS).
 */
import type { MatchRoundReplay } from './round-replay'
import { resolveCallout } from './spatial/callout-resolver'

export const MIN_REPEATS = 3

export interface EnemyHabitRow { callout: string; kills: number; openingKills: number }
export interface EnemyHabits {
  map: string
  enemyKills: number
  openingKills: number
  rows: EnemyHabitRow[]
}

type Resolve = (map: string, p: { x: number; y: number }) => { callout: string }

export function computeEnemyHabits(replay: MatchRoundReplay | null | undefined, resolve: Resolve = resolveCallout): EnemyHabits | null {
  if (!replay || typeof replay.ownPlayerIndex !== 'number') return null
  const ownTeam = replay.players[replay.ownPlayerIndex]?.team
  if (!ownTeam) return null
  const counts = new Map<string, EnemyHabitRow>()
  let enemyKills = 0
  let openingKills = 0
  for (const round of replay.rounds) {
    const kills = round.frames.filter(f => f.k === 'kill' && typeof f.actorIndex === 'number')
    kills.forEach((f, idx) => {
      const killer = replay.players[f.actorIndex!]
      if (!killer || killer.team === ownTeam) return
      const pos = f.p.find(p => p.i === f.actorIndex)
      if (!pos) return
      const { callout } = resolve(replay.map, { x: pos.x, y: pos.y })
      if (!callout || callout === 'Unknown') return
      enemyKills++
      const opening = idx === 0
      if (opening) openingKills++
      const row = counts.get(callout) ?? { callout, kills: 0, openingKills: 0 }
      row.kills++
      if (opening) row.openingKills++
      counts.set(callout, row)
    })
  }
  const rows = [...counts.values()]
    .filter(r => r.kills >= MIN_REPEATS)
    .sort((a, b) => b.kills - a.kills || b.openingKills - a.openingKills)
    .slice(0, 5)
  return { map: replay.map, enemyKills, openingKills, rows }
}
