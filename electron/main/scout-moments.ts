/**
 * Build and upload Smart Review scout moment thumbnails from local clip extraction.
 * Avoids re-downloading the full VOD on the server when the user runs Analyze Key Moments.
 */

import fs from 'fs'
import log from 'electron-log'
import type { ClipStore } from './clip-store'
import type { ClipExtractor } from './clip-extractor'
import type { MatchData } from './riot-types'

export interface ScoutMomentPayload {
  timestamp_sec: number
  trigger: string
  round: number | null
  image_base64: string
}

const TARGET_MOMENTS = 12
const MIN_GAP_SEC = 5

interface WeightedMoment {
  time: number
  weight: number
  reason: string
}

function weightedMomentsFromTimeline(timeline: MatchData): WeightedMoment[] {
  const weighted: WeightedMoment[] = []

  for (const k of timeline.playerKills ?? []) {
    const t = k.videoOffsetMs != null ? k.videoOffsetMs / 1000 : null
    if (t == null || t < 0) continue
    weighted.push({ time: Math.max(0, t - 1), weight: 22, reason: 'player_kill' })
  }

  for (const d of timeline.playerDeaths ?? []) {
    const t = d.videoOffsetMs != null ? d.videoOffsetMs / 1000 : null
    if (t == null || t < 0) continue
    weighted.push({ time: Math.max(0, t - 2), weight: 40, reason: 'player_death' })
  }

  for (const p of timeline.spikePlants ?? []) {
    const t = p.videoOffsetMs != null ? p.videoOffsetMs / 1000 : null
    if (t == null || t < 0) continue
    weighted.push({ time: Math.max(0, t - 1.5), weight: 28, reason: 'spike_plant' })
  }

  for (const d of timeline.spikeDefuses ?? []) {
    const t = d.videoOffsetMs != null ? d.videoOffsetMs / 1000 : null
    if (t == null || t < 0) continue
    weighted.push({ time: Math.max(0, t - 1.5), weight: 35, reason: 'spike_defuse' })
  }

  return weighted
}

function isNearExisting(time: number, existing: number[]): boolean {
  return existing.some(t => Math.abs(t - time) < MIN_GAP_SEC)
}

function collectFromClips(clipStore: ClipStore, jobId: string): ScoutMomentPayload[] {
  const clips = clipStore
    .getAll()
    .filter(c => c.analysisJobId === jobId && c.thumbPath && fs.existsSync(c.thumbPath))

  const moments: ScoutMomentPayload[] = []
  const seenTimes: number[] = []

  for (const clip of clips) {
    const timestampSec = clip.momentOffsetMs != null
      ? Math.round(clip.momentOffsetMs / 1000)
      : null
    if (timestampSec == null || isNearExisting(timestampSec, seenTimes)) continue

    try {
      const buf = fs.readFileSync(clip.thumbPath!)
      moments.push({
        timestamp_sec: timestampSec,
        trigger: clip.trigger,
        round: clip.round,
        image_base64: buf.toString('base64'),
      })
      seenTimes.push(timestampSec)
    } catch (err) {
      log.warn('[ScoutMoments] Failed to read clip thumb:', clip.id, err)
    }
  }

  return moments.sort((a, b) => a.timestamp_sec - b.timestamp_sec)
}

async function extractGapThumbs(
  videoPath: string,
  timeline: MatchData,
  existingTimes: number[],
  clipExtractor: ClipExtractor,
  maxGaps: number,
): Promise<ScoutMomentPayload[]> {
  if (!fs.existsSync(videoPath) || maxGaps <= 0) return []

  const weighted = weightedMomentsFromTimeline(timeline)
    .sort((a, b) => b.weight - a.weight)

  const gaps: ScoutMomentPayload[] = []
  const scoutDir = clipExtractor.scoutThumbDir()

  for (const moment of weighted) {
    if (gaps.length >= maxGaps) break
    if (isNearExisting(moment.time, existingTimes)) continue

    const ts = Math.round(moment.time)
    const outPath = `${scoutDir}/scout_gap_${ts}.jpg`
    try {
      await clipExtractor.thumbnail({
        sourcePath: videoPath,
        offsetMs: Math.round(moment.time * 1000),
        outputPath: outPath,
      })
      const buf = fs.readFileSync(outPath)
      gaps.push({
        timestamp_sec: ts,
        trigger: moment.reason,
        round: null,
        image_base64: buf.toString('base64'),
      })
      existingTimes.push(ts)
    } catch (err) {
      log.warn('[ScoutMoments] Gap thumb failed at', moment.time, err)
    }
  }

  return gaps
}

export async function buildAndUploadScoutMoments(opts: {
  jobId: string | null
  videoPath: string
  timeline: MatchData | null
  clipStore: ClipStore
  clipExtractor: ClipExtractor
  upload: (jobId: string, moments: ScoutMomentPayload[]) => Promise<void>
}): Promise<void> {
  const { jobId, videoPath, timeline, clipStore, clipExtractor, upload } = opts
  if (!jobId || !timeline) return

  let moments = collectFromClips(clipStore, jobId)
  const existingTimes = moments.map(m => m.timestamp_sec)

  if (moments.length < TARGET_MOMENTS && timeline) {
    const gapMoments = await extractGapThumbs(
      videoPath,
      timeline,
      existingTimes,
      clipExtractor,
      TARGET_MOMENTS - moments.length,
    )
    moments = [...moments, ...gapMoments].sort((a, b) => a.timestamp_sec - b.timestamp_sec)
  }

  if (moments.length < 4) {
    log.info(`[ScoutMoments] Skipping upload — only ${moments.length} moments (need ≥4)`)
    return
  }

  try {
    await upload(jobId, moments.slice(0, TARGET_MOMENTS))
    log.info(`[ScoutMoments] Uploaded ${Math.min(moments.length, TARGET_MOMENTS)} moments for job ${jobId}`)
  } catch (err) {
    log.warn('[ScoutMoments] Upload failed:', err)
  }
}
