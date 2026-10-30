/**
 * Deadlock kill timeline from the cloud replay review.
 *
 * Deadlock replays are Source 2 files; the desktop's `demofile` parser only reads Source 1
 * (HL2DEMO), so a local parse never produced kills. The cloud review parses the replay with
 * boon and returns the player's kills, deaths and assists with match-clock times. This turns
 * those into the recording's timeline, so clips, the match page and the Analyse lock all work
 * from real replay data, and stay locked when there is none.
 */
import type { KillEvent, MatchData } from './riot-types'
import { emptyMatchData, gameTimeToVideoOffsetMs } from './recording-sync'

export interface DeadlockCloudKillEvent {
  type: 'kill' | 'death' | 'assist'
  /** Seconds on the match clock (boon: replay ticks converted, pauses excluded). */
  time_seconds: number
  attacker_hero?: string
  victim_hero?: string
}

export interface DeadlockCloudTimelineInput {
  events: DeadlockCloudKillEvent[] | null | undefined
  hero?: string | null
  jobId: string
  recordingStartTime: number
  /** Wall-clock ms when the match started (match watcher), used to line events up with the video. */
  matchStartTime: number | null
  durationMinutes?: number | null
  result?: string | null
}

const MAX_EVENTS = 200

function valid(e: unknown): e is DeadlockCloudKillEvent {
  const x = e as DeadlockCloudKillEvent
  return !!x && (x.type === 'kill' || x.type === 'death' || x.type === 'assist')
    && typeof x.time_seconds === 'number' && Number.isFinite(x.time_seconds) && x.time_seconds >= 0
}

/** Returns null when the review has no usable events, so a sparse recording stays sparse. */
export function deadlockTimelineFromCloud(input: DeadlockCloudTimelineInput): MatchData | null {
  const events = (input.events ?? []).filter(valid).slice(0, MAX_EVENTS)
  if (!events.length) return null

  const timeline = emptyMatchData('deadlock', input.recordingStartTime)
  timeline.matchStartTime = input.matchStartTime
  timeline.gameplayStartTime = input.matchStartTime
  timeline.gameMode = 'COMPETITIVE'
  timeline.agent = input.hero ?? null

  const kills: KillEvent[] = []
  const deaths: KillEvent[] = []
  const all: KillEvent[] = []
  let id = 1
  for (const e of [...events].sort((a, b) => a.time_seconds - b.time_seconds)) {
    const ms = Math.round(e.time_seconds * 1000)
    const ev: KillEvent = {
      EventID: id++,
      EventName: 'ChampionKill',
      EventTime: e.time_seconds,
      killerName: e.type === 'kill' ? 'You' : (e.attacker_hero ?? 'Enemy'),
      victimName: e.type === 'death' ? 'You' : (e.victim_hero ?? 'Enemy'),
      assistants: e.type === 'assist' ? ['You'] : [],
      timeSinceGameStartMillis: ms,
      videoOffsetMs: gameTimeToVideoOffsetMs(ms, timeline),
      killerAgent: e.attacker_hero,
      victimAgent: e.victim_hero,
    }
    all.push(ev)
    if (e.type === 'kill') kills.push(ev)
    if (e.type === 'death') deaths.push(ev)
  }
  timeline.playerKills = kills
  timeline.playerDeaths = deaths
  timeline.killEvents = all
  timeline.finalStats = {
    kills: kills.length,
    deaths: deaths.length,
    assists: all.length - kills.length - deaths.length,
    score: 0,
    summonerName: null,
    agent: input.hero ?? null,
    team: null,
    level: 0,
    headshotPct: null,
    adr: null,
    accountLevel: null,
  }
  timeline.matchDetails = {
    source: 'deadlock_cloud_replay',
    jobId: input.jobId,
    // Match clock excludes pauses, so offsets can drift after a pause; flagged for the UI.
    clock: 'match_seconds',
    durationMinutes: input.durationMinutes ?? null,
    result: input.result ?? null,
  }
  return timeline
}
