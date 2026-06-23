import type { KillEvent, MatchData } from './riot-types'
import { emptyMatchData, gameTimeToVideoOffsetMs } from './recording-sync'

export interface DeadlockLogSessionSnapshot {
  heroKey: string | null
  mapName: string | null
  phase: string
  lobbyMatchId: number | null
  matchStartedAtMs: number | null
  kills: KillEvent[]
  deaths: KillEvent[]
}

/** Build MatchData from console.log session state (fallback when .dem parse fails). */
export function buildDeadlockLogTimeline(
  snapshot: DeadlockLogSessionSnapshot,
  recordingStartTime: number,
  matchStartTime: number | null,
): MatchData | null {
  const hasSignal =
    snapshot.kills.length > 0
    || snapshot.deaths.length > 0
    || snapshot.heroKey != null
    || (snapshot.mapName != null && snapshot.phase === 'in_match')

  if (!hasSignal) return null

  const timeline = emptyMatchData('deadlock', recordingStartTime)
  timeline.map = snapshot.mapName
  timeline.agent = snapshot.heroKey
  timeline.gameMode = 'COMPETITIVE'
  timeline.matchStartTime = matchStartTime ?? snapshot.matchStartedAtMs
  timeline.gameplayStartTime = timeline.matchStartTime
  timeline.playerKills = snapshot.kills
  timeline.playerDeaths = snapshot.deaths
  timeline.killEvents = [...snapshot.kills, ...snapshot.deaths]
  timeline.finalStats = {
    kills: snapshot.kills.length,
    deaths: snapshot.deaths.length,
    assists: 0,
    score: 0,
    summonerName: null,
    agent: snapshot.heroKey,
    team: null,
    level: 0,
    headshotPct: null,
    adr: null,
    accountLevel: null,
  }
  timeline.endTime = Date.now()

  if (snapshot.lobbyMatchId != null) {
    timeline.matchDetails = { deadlockLobbyMatchId: snapshot.lobbyMatchId }
  }

  return timeline
}

export function appendDeadlockCombatEvent(
  events: { kills: KillEvent[]; deaths: KillEvent[] },
  line: string,
  timing: Pick<MatchData, 'matchStartTime' | 'recordingStartTime'>,
  localHero: string | null,
): void {
  // Citadel combat feed — local player highlighted in some builds.
  const killM = /\[Combat\].*?(\S+)\s+killed\s+(\S+)/i.exec(line)
    ?? /Kill:\s+(\S+)\s+(?:killed|defeated)\s+(\S+)/i.exec(line)
  if (!killM) return

  const killer = killM[1].replace(/[<>]/g, '')
  const victim = killM[2].replace(/[<>]/g, '')
  const gameTimeMs = timing.matchStartTime != null
    ? Math.max(0, Date.now() - timing.matchStartTime)
    : 0
  const videoOffsetMs = gameTimeToVideoOffsetMs(gameTimeMs, {
    matchStartTime: timing.matchStartTime,
    recordingStartTime: timing.recordingStartTime,
  })

  const ev: KillEvent = {
    EventID: events.kills.length + events.deaths.length + 1,
    EventName: 'ChampionKill',
    EventTime: gameTimeMs / 1000,
    killerName: killer,
    victimName: victim,
    assistants: [],
    timeSinceGameStartMillis: gameTimeMs,
    videoOffsetMs,
    round: 0,
  }

  const heroToken = localHero?.replace(/^hero_/, '').toLowerCase()
  const killerLower = killer.toLowerCase()
  const victimLower = victim.toLowerCase()
  const isLocalKill = heroToken != null && killerLower.includes(heroToken)
  const isLocalDeath = heroToken != null && victimLower.includes(heroToken)

  if (isLocalKill) {
    ev.killerName = 'You'
    events.kills.push(ev)
  } else if (isLocalDeath) {
    ev.victimName = 'You'
    events.deaths.push(ev)
  }
}
