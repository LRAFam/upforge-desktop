/** Riot uses a zero placeholder in timeSinceGameStartMillis for some modes. */
export function riotGameTime(row: Record<string, unknown>): number | null {
  for (const value of [row.timeSinceGameStartMillis, row.gameTime]) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  }
  return null
}

export function riotRoundTime(row: Record<string, unknown>): number | null {
  for (const value of [row.roundTime, row.timeSinceRoundStartMillis]) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  }
  return null
}

/** Only use observed, consistent clock pairs; never invent starts for missing rounds. */
export function observedRoundStarts(kills: Array<Record<string, unknown>> = []): Map<number, number> {
  const starts = new Map<number, number>()
  const inconsistent = new Set<number>()
  for (const kill of kills) {
    const round = kill.round as number
    const gameTime = riotGameTime(kill)
    const roundTime = riotRoundTime(kill)
    if (!Number.isInteger(round) || gameTime == null || roundTime == null || gameTime < roundTime) continue
    const start = gameTime - roundTime
    const previous = starts.get(round)
    if (previous != null && Math.abs(previous - start) > 1) inconsistent.add(round)
    else if (previous == null) starts.set(round, start)
  }
  for (const round of inconsistent) starts.delete(round)
  return starts
}
