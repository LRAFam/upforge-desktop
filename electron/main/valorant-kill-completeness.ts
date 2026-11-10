const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const identifier = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.toLowerCase() : null
const count = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0

/** Prove every normalized event against all ten players in every scored Riot round. */
export function hasCompleteRiotKillEvents(value: unknown): boolean {
  const timeline = record(value)
  if (!timeline) return false
  const rosterRows = timeline.teamSnapshot
  const rounds = record(timeline.matchDetails)?.roundResults
  const events = timeline.killEvents
  const score = record(timeline.finalScore)
  if (!Array.isArray(rosterRows) || rosterRows.length !== 10 || !Array.isArray(rounds)
    || !Array.isArray(events) || !score || !count(score.allyScore) || !count(score.enemyScore)) return false
  const totalRounds = score.allyScore + score.enemyScore
  if (!totalRounds || rounds.length !== totalRounds) return false
  const roster = new Set(rosterRows.map(player => identifier(record(player)?.puuid)))
  if (roster.has(null) || roster.size !== 10 || !roster.has(identifier(timeline.puuid))) return false

  const source = new Map<string, number>()
  const roundIds = new Set<number>()
  const eventKey = (round: unknown, time: unknown, killer: unknown, victim: unknown): string | null => {
    const k = identifier(killer), v = identifier(victim)
    if (!count(round) || round >= totalRounds || typeof time !== 'number' || !Number.isFinite(time) || time < 0
      || !k || !v || !roster.has(k) || !roster.has(v)) return null
    return JSON.stringify([round, time, k, v])
  }
  for (const raw of rounds) {
    const round = record(raw)
    if (!round || !count(round.roundNum) || round.roundNum >= totalRounds || roundIds.has(round.roundNum)
      || !Array.isArray(round.playerStats) || round.playerStats.length !== roster.size) return false
    roundIds.add(round.roundNum)
    const seenPlayers = new Set<string>()
    for (const rawPlayer of round.playerStats) {
      const player = record(rawPlayer), subject = identifier(player?.subject)
      if (!player || !subject || !roster.has(subject) || seenPlayers.has(subject) || !Array.isArray(player.kills)) return false
      seenPlayers.add(subject)
      for (const rawKill of player.kills) {
        const kill = record(rawKill)
        if (!kill || identifier(kill.killer) !== subject) return false
        const key = eventKey(round.roundNum, kill.gameTime, kill.killer, kill.victim)
        if (!key) return false
        source.set(key, (source.get(key) ?? 0) + 1)
      }
    }
  }
  for (const raw of events) {
    const event = record(raw)
    if (!event) return false
    const key = eventKey(event.round, event.timeSinceGameStartMillis, event.killerPuuid, event.victimPuuid)
    if (!key || !source.has(key)) return false
    const remaining = source.get(key)! - 1
    if (remaining === 0) source.delete(key)
    else source.set(key, remaining)
  }
  return source.size === 0
}
