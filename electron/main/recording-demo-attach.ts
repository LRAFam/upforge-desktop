/**
 * Link a user-provided .dem file to an existing recording — parse timeline + extract clips.
 */

import fs from 'fs'
import log from 'electron-log'
import { buildTimelineFromDemo } from './demo-timeline'
import { hasRichMatchData } from './match-data-quality'
import { resolveMatchSessionStartMs } from './recording-sync'
import type { RecordingsStore } from './recordings-store'
import type { MatchData } from './riot-types'
import type { SourceGame } from './source-replay-finder'

export interface AttachDemoResult {
  ok: boolean
  error?: string
  timeline?: MatchData | null
  clipsScheduled?: boolean
}

export async function attachDemoFileToRecording(opts: {
  store: RecordingsStore
  recordingId: string
  demoPath: string
  localPlayerName?: string | null
  onClipsExtracted?: (videoPath: string, timeline: MatchData, game: SourceGame) => Promise<void>
  logActivity?: (msg: string) => void
}): Promise<AttachDemoResult> {
  const rec = opts.store.getById(opts.recordingId)
  if (!rec) return { ok: false, error: 'Recording not found' }

  if (rec.game !== 'cs2' && rec.game !== 'deadlock') {
    return { ok: false, error: 'Demo attach is only supported for CS2 and Deadlock' }
  }

  const normalized = opts.demoPath.trim()
  if (!normalized.toLowerCase().endsWith('.dem')) {
    return { ok: false, error: 'Please choose a .dem replay file' }
  }
  if (!fs.existsSync(normalized)) {
    return { ok: false, error: 'Demo file not found' }
  }

  const matchSessionStart = resolveMatchSessionStartMs(rec.timeline, rec.recordedAt)
  const recordingStartMs = rec.timeline?.recordingStartTime
    ?? rec.timeline?.gameplayStartTime
    ?? matchSessionStart

  const timeline = await buildTimelineFromDemo({
    game: rec.game as SourceGame,
    demoPath: normalized,
    map: rec.map ?? rec.timeline?.map ?? null,
    matchStartTime: rec.timeline?.matchStartTime ?? matchSessionStart,
    recordingStartTime: recordingStartMs,
    localPlayerName: opts.localPlayerName ?? null,
  })

  if (!timeline || !hasRichMatchData(timeline)) {
    return {
      ok: false,
      error: 'Could not read kills from this demo — check your Steam name in Settings → Recording (CS2)',
    }
  }

  opts.store.updateTimeline(opts.recordingId, timeline)
  log.info(`[AttachDemo] Linked ${rec.game} demo to recording ${opts.recordingId}:`, normalized)
  opts.logActivity?.(`${rec.game === 'cs2' ? 'CS2 demo' : 'Deadlock replay'} linked — building timeline`)

  let clipsScheduled = false
  const videoPath = rec.path
  if (videoPath && fs.existsSync(videoPath) && opts.onClipsExtracted) {
    clipsScheduled = true
    void opts.onClipsExtracted(videoPath, timeline, rec.game as SourceGame).catch((err) => {
      log.warn('[AttachDemo] Clip extraction failed:', err)
    })
  }

  return { ok: true, timeline, clipsScheduled }
}
