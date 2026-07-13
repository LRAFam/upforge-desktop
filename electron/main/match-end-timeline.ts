/**
 * Resolves match timeline data when a recorded match ends.
 * Extracted from index.ts handleMatchEnd — demo parsing, deadlock log merge, etc.
 */

import log from 'electron-log'
import type { MatchData } from './riot-types'
import { normalizeGameId } from './game-capabilities'
import {
  buildTimelineFromReplay,
  type PostMatchReplayContext,
  type ReplayUploadMeta,
} from './post-match-replay'
import { buildDeadlockTimelineFromLogSession } from './deadlock-match-watcher'

export interface ReplayRetryContext {
  game: 'cs2' | 'deadlock'
  matchSessionStart: number
  customReplayDir?: string
  meta?: ReplayUploadMeta
  recordingId?: string
}

export interface MatchEndTimelineInput {
  game: string
  matchSessionStart: number
  currentMatchStartTime: number | null
  currentRecordingStartTime: number | null
  currentGsiMapName: string | null
  cs2DemoDir?: string
}

export interface MatchEndTimelineDeps {
  resolveCs2LocalPlayerName: () => Promise<string | null>
  getDeadlockMap: () => string | null
  getLatestGsiMap: () => string | null
  logActivity: (msg: string) => void
}

export interface MatchEndTimelineResult {
  timeline: MatchData | null
  pendingReplayPath: string | null
  replayRetryContext: ReplayRetryContext | null
}

export interface LiveClientTimelineDeps {
  stopValorantTimeline: () => Promise<MatchData | null>
  stopLolTimeline: () => Promise<MatchData | null>
}

/** Stop the live-client poller for Valorant or LoL and return its timeline snapshot. */
export async function fetchLiveClientTimeline(
  game: string,
  deps: LiveClientTimelineDeps,
): Promise<MatchData | null> {
  const id = normalizeGameId(game)
  if (id === 'valorant') return deps.stopValorantTimeline()
  if (id === 'lol') return deps.stopLolTimeline()
  return null
}

/**
 * Build or enrich timeline after OBS stops — demo replay for CS2/Deadlock,
 * console-log merge for Deadlock, pass-through for Valorant/LoL live client.
 */
export async function buildMatchEndTimeline(
  input: MatchEndTimelineInput,
  deps: MatchEndTimelineDeps,
  liveTimeline: MatchData | null,
): Promise<MatchEndTimelineResult> {
  const game = normalizeGameId(input.game)
  let timeline = liveTimeline
  let pendingReplayPath: string | null = null
  let replayRetryContext: ReplayRetryContext | null = null

  if ((game === 'cs2' || game === 'deadlock') && !timeline) {
    const cs2PlayerName = game === 'cs2' ? await deps.resolveCs2LocalPlayerName() : null
    const replayCtx: PostMatchReplayContext = {
      game,
      matchSessionStart: input.matchSessionStart,
      matchStartTime: input.currentMatchStartTime,
      recordingStartTime: input.currentRecordingStartTime ?? input.matchSessionStart,
      gsiMap: input.currentGsiMapName
        ?? (game === 'deadlock' ? deps.getDeadlockMap() : deps.getLatestGsiMap()),
      customReplayDir: game === 'cs2' ? input.cs2DemoDir : undefined,
      localPlayerName: cs2PlayerName,
    }
    const parsed = await buildTimelineFromReplay(replayCtx, { pollOnce: true })
    if (parsed.timeline) timeline = parsed.timeline
    pendingReplayPath = parsed.demoPath
    replayRetryContext = {
      game,
      matchSessionStart: input.matchSessionStart,
      customReplayDir: game === 'cs2' ? input.cs2DemoDir : undefined,
      meta: game === 'deadlock'
        ? { matchStartedAt: Math.floor(input.matchSessionStart / 1000) }
        : undefined,
    }
    if (timeline) {
      const killCount = timeline.killEvents?.length ?? timeline.playerKills.length
      log.info(
        `[MatchEndTimeline] ${game} demo — kills=${killCount} matched=${timeline.playerKills.length}`,
      )
      if (game === 'cs2' && timeline.playerKills.length === 0 && killCount > 0) {
        deps.logActivity(
          'CS2 demo loaded — set your Steam name in Settings → Recording to tag your kills (full match timeline still available)',
        )
      } else if (game === 'cs2' && timeline.playerKills.length === 0) {
        deps.logActivity('CS2 demo parsed but no kills matched — set your Steam name in Settings → Recording')
      }
    }
  }

  if (game === 'deadlock') {
    const logTimeline = buildDeadlockTimelineFromLogSession(
      input.currentRecordingStartTime ?? input.matchSessionStart,
      input.currentMatchStartTime,
    )
    if (logTimeline && !timeline) {
      timeline = logTimeline
      log.info(
        `[MatchEndTimeline] deadlock log — kills=${logTimeline.playerKills.length} hero=${logTimeline.agent ?? '?'}`,
      )
    } else if (logTimeline && timeline) {
      if (!timeline.agent && logTimeline.agent) timeline.agent = logTimeline.agent
      if (!timeline.map && logTimeline.map) timeline.map = logTimeline.map
      if (timeline.playerKills.length === 0 && logTimeline.playerKills.length > 0) {
        timeline.playerKills = logTimeline.playerKills
        timeline.playerDeaths = logTimeline.playerDeaths
        timeline.killEvents = logTimeline.killEvents
        log.info(`[MatchEndTimeline] merged ${logTimeline.playerKills.length} kills from console log`)
      }
    }
  }

  return { timeline, pendingReplayPath, replayRetryContext }
}
