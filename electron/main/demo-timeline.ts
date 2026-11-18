import fs from 'fs'
import log from 'electron-log'
import { buildCs2TimelineFromDemo } from './cs2-demo-parser'
import { parseCs2DemoInWorker } from './cs2-demo-parse-client'
import { getGameDataCapture } from './game-data-capture'
import { cachedCs2DemoSource, cs2DemoBundleReadError, type Cs2DemoSource } from './cs2-demo-source'
import type { MatchData } from './riot-types'
import { hasSource2DemoPreamble } from './source2-demo-preamble'

export interface DemoTimelineOptions {
  game: 'cs2' | 'deadlock'
  demoPath: string
  map?: string | null
  gameMode?: string | null
  matchStartTime: number | null
  recordingStartTime: number
  /** Optional hint — FACEIT nickname or Steam display name */
  localPlayerName?: string | null
  /** Skip spatial enrichment (faster demo preview). */
  skipSpatial?: boolean
  /** CS2: what GSI saw live for this recording — anchors demo time to the video. */
  cs2Live?: import('./cs2-gsi-timeline').Cs2LiveSummary | null
}

/** Demos the CS2 parser could not read (path → parser error). Cleared when a parse succeeds. */
const cs2DemoReadErrors = new Map<string, string>()

/** Why the last parse of this CS2 demo failed, when the parser itself could not read it. */
export function cs2DemoReadError(demoPath: string | null | undefined): string | null {
  return demoPath ? cs2DemoReadErrors.get(demoPath) ?? null : null
}

export { CS2_DEMO_UNREADABLE_MESSAGE } from './demo-read-messages'

/**
 * Parse a Source-engine .dem replay into MatchData for clip extraction and VOD review.
 * CS2 uses its native parser; Deadlock needs its separate cloud review.
 */
export async function buildTimelineFromDemo(opts: DemoTimelineOptions): Promise<MatchData | null> {
  if (!fs.existsSync(opts.demoPath)) {
    log.warn('[DemoTimeline] Demo not found:', opts.demoPath)
    return null
  }

  if (opts.game === 'cs2') {
    if (!hasSource2DemoPreamble(opts.demoPath)) return null
    // demoparser2 is synchronous native code that reads the whole demo per call: run it in a worker
    // so the main process (and every window) stays responsive while a demo parses.
    const parseStartedAt = Date.now()
    const parsed = await parseCs2DemoInWorker(opts.demoPath)
    // Diagnostics capture (no-op unless a CS2 capture just ended): real demo size + parse time.
    let demoBytes: number | null = null
    try { demoBytes = fs.statSync(opts.demoPath).size } catch { /* gone */ }
    getGameDataCapture()?.noteAfterMatch('cs2', 'cs2-demo-parse', { status: parsed.status, durationMs: Date.now() - parseStartedAt, demoBytes })
    let source: Cs2DemoSource | undefined
    if (parsed.status === 'ok') {
      const readError = cs2DemoBundleReadError(parsed.bundle)
      if (readError) {
        cs2DemoReadErrors.set(opts.demoPath, readError)
        log.warn('[DemoTimeline] CS2 demo unreadable by demoparser2:', readError)
      } else {
        cs2DemoReadErrors.delete(opts.demoPath)
      }
      source = cachedCs2DemoSource(parsed.bundle)
    } else if (parsed.status === 'failed') {
      // A timeout is a slow parse, not a format problem: keep the generic message for it.
      if (!/timed out/.test(parsed.error)) cs2DemoReadErrors.set(opts.demoPath, parsed.error)
      log.warn('[DemoTimeline] CS2 demo parse worker failed:', parsed.error)
      return null
    } else {
      // No worker could be started at all (e.g. tests): parse on this thread as before.
      log.warn('[DemoTimeline] CS2 demo parse worker unavailable — parsing on main thread:', parsed.error)
    }
    const timeline = buildCs2TimelineFromDemo(opts, source)
    if (timeline) {
      const { recomputeTimelineVideoOffsets } = await import('./riot-local-api')
      recomputeTimelineVideoOffsets(timeline)
    }
    return timeline
  }

  // A Source-1 parser cannot read Deadlock's Source-2 format. Keep rich-data gates locked
  // until deadlock-cloud-timeline.ts receives real review events.
  log.info('[DemoTimeline] Deadlock replay: local parse unsupported (Source 2); using the cloud review timeline')
  return null
}
