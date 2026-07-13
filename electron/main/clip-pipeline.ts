/**
 * clip-pipeline.ts
 * Highlight clip extraction from match recordings.
 * Extracted from index.ts — encapsulates clutch detection, thumbnail generation,
 * and all clip-extraction entry points.
 *
 * Callers instantiate ClipPipeline with a context object that provides the
 * shared state refs it needs to operate (clipStore, hotkeyBookmarks, etc.).
 */

import fs from 'fs'
import log from 'electron-log'
import { showAppNotification } from './app-notifications'
import { ClipStore } from './clip-store'
import { ClipExtractor } from './clip-extractor'
import type { ExtractOptions } from './clip-extractor'
import { reportError } from './error-reporter'
import { shouldReportClipProbeFailure } from './ffmpeg-probe'
import type { MatchData, KillEvent } from './riot-types'
import { detectClutchRoundsForGame } from './demo-clutch'
import type { ClipGame } from './clip-game'
import type { ClipCaptureSettings } from './settings-manager'
import { ensureClipKillRounds } from './kill-clip-grouping'

function reportClipExtractError(prefix: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  // Per-clip failures are expected (bad seek, one kill off-timeline) — log locally only.
  log.warn(`${prefix}:`, msg)
}

function clipMatchMeta(
  timeline: MatchData | null,
  kill?: KillEvent | null,
): {
  matchId: string | null
  gameMode: string | null
  weapon: string | null
  abilitySlot: string | null
} {
  return {
    matchId: timeline?.matchId ?? null,
    gameMode: timeline?.gameMode ?? null,
    weapon: kill?.weapon ?? null,
    abilitySlot: kill?.abilitySlot ?? null,
  }
}

// Re-export for callers that imported from clip-pipeline.
export { detectClutchRounds } from './demo-clutch'

// ── Context ───────────────────────────────────────────────────────────────────

export interface ClipPipelineContext {
  clipStore: ClipStore
  clipExtractor: ClipExtractor
  /** Mutable array — pipeline reads and resets this after extracting hotkey clips. */
  hotkeyBookmarks: number[]
  getRecordingStartTime: () => number | null
  /** User preferences for which highlight clip types to auto-extract. */
  getClipCapture: () => ClipCaptureSettings
  logActivity: (msg: string) => void
  notifySilent: () => boolean
  /** Send an IPC event to the main window (null when window is not available). */
  notifyMainWindow: (channel: string, data?: unknown) => void
  /** Called after extraction completes to update the diagnostic clip count. */
  onClipsExtracted?: (count: number) => void
}

// ── ClipPipeline class ────────────────────────────────────────────────────────

export class ClipPipeline {
  constructor(private ctx: ClipPipelineContext) {}

  /** Extract a clip, clamping to VOD length and retrying with frame-accurate seek on failure. */
  private async safeExtract(
    opts: ExtractOptions,
    vodDurationMs: number | null,
  ): Promise<void> {
    const startMs = opts.startOffsetMs
    let durationMs = opts.durationMs
    if (vodDurationMs != null) {
      const remaining = vodDurationMs - startMs
      if (remaining <= 500) {
        throw new Error('Clip window is past end of recording')
      }
      durationMs = Math.min(durationMs, remaining)
    }

    const base = { ...opts, startOffsetMs: startMs, durationMs }
    try {
      await this.ctx.clipExtractor.extract(base)
    } catch (firstErr) {
      if (base.accurateSeek) throw firstErr
      log.info('[ClipExtract] Fast seek failed — retrying with accurate seek')
      await this.ctx.clipExtractor.extract({ ...base, accurateSeek: true })
    }
  }

  /** Extract a thumbnail, falling back to an alternative offset on failure. */
  private async safeThumb(
    sourcePath: string,
    offsetMs: number,
    fallbackMs: number,
    outputPath: string,
  ): Promise<string | null> {
    for (const ms of [offsetMs, fallbackMs]) {
      try {
        await this.ctx.clipExtractor.thumbnail({ sourcePath, offsetMs: ms, outputPath })
        return outputPath
      } catch {
        // try next offset
      }
    }
    log.warn('[ClipExtract] Thumbnail skipped — all seek offsets failed:', outputPath)
    return null
  }

  /**
   * Extract all highlight clips from a completed match recording.
   * Handles: hotkey bookmarks, individual kills, 3K/4K/ace combined clips, clutch clips.
   */
  async extractMatchClips(
    videoPath: string,
    timeline: MatchData | null,
    analysisJobId: string | null,
    game: ClipGame = 'valorant',
  ): Promise<void> {
    const { clipStore, clipExtractor, hotkeyBookmarks, logActivity, notifySilent } = this.ctx
    const capture = this.ctx.getClipCapture()

    if (!fs.existsSync(videoPath)) {
      log.warn('[ClipExtract] Source video not found — skipping:', videoPath)
      logActivity('Clip extraction skipped — recording file not found')
      return
    }

    const probe = await clipExtractor.probeWithRetry(videoPath)
    if (!probe.ok) {
      log.warn('[ClipExtract] Recording is unreadable — skipping all clip extraction:', probe.reason)
      logActivity('Clip extraction skipped — recording was incomplete (app or ffmpeg quit before the file was finalised)')
      if (shouldReportClipProbeFailure(probe.reason)) {
        reportError({
          message: `[ClipExtract] Recording unreadable, skipping extraction: ${probe.reason}`,
          component: 'desktop:ClipExtract',
        })
      }
      return
    }

    const vodDurationMs = await clipExtractor.probeDurationMs(videoPath)

    ensureClipKillRounds(timeline)

    const recordingStart = this.ctx.getRecordingStartTime() ?? 0
    const map = timeline?.map ?? null
    const agent = timeline?.agent ?? null
    const baseMeta = clipMatchMeta(timeline)
    const extractedClipIds: string[] = []

    if (timeline?.playerKills && timeline.playerKills.length > 0) {
      const sample = timeline.playerKills.slice(0, 5).map(k =>
        `R${(k.round ?? -1) + 1}@${k.videoOffsetMs != null ? `${(k.videoOffsetMs / 1000).toFixed(1)}s` : 'null'}`
      ).join(', ')
      log.info(`[ClipExtract] kills=${timeline.playerKills.length} first5_offsets=[${sample}] videoPath=${videoPath}`)
    }

    // ── Hotkey bookmarks → 30s manual clips ───────────────────────────────
    for (const bookmarkedAt of hotkeyBookmarks) {
      const offsetMs = bookmarkedAt - recordingStart
      const startMs = Math.max(0, offsetMs - 25_000)
      try {
        const rec = clipStore.add({ path: '', thumbPath: null, trigger: 'hotkey', map, agent, durationSeconds: 30, round: null, killCount: null, analysisJobId, game, ...baseMeta })
        const clipPath = ClipExtractor.clipPath(rec.id)
        const thumbPath = ClipExtractor.thumbPath(rec.id)
        await this.safeExtract({ sourcePath: videoPath, startOffsetMs: startMs, durationMs: 30_000, outputPath: clipPath }, vodDurationMs)
        const resolvedThumb = await this.safeThumb(videoPath, offsetMs, startMs, thumbPath)
        clipStore.update(rec.id, { path: clipPath, thumbPath: resolvedThumb, momentOffsetMs: offsetMs })
        extractedClipIds.push(rec.id)
        logActivity(`Saved hotkey clip (${map ?? 'unknown map'})`)
      } catch (err) {
        reportClipExtractError('[ClipExtract] Hotkey clip failed', err)
      }
    }

    // ── Kill clips from timeline ───────────────────────────────────────────
    if (timeline?.playerKills && timeline.playerKills.length > 0) {
      const killsByRound = new Map<number, typeof timeline.playerKills>()
      for (const kill of timeline.playerKills) {
        const r = kill.round ?? -1
        if (!killsByRound.has(r)) killsByRound.set(r, [])
        killsByRound.get(r)!.push(kill)
      }

      const clutchRounds = detectClutchRoundsForGame(timeline)

      const combinedRounds = new Map<number, { kills: typeof timeline.playerKills; trigger: 'ace' | 'multikill'; killCount: number }>()
      for (const [round, kills] of killsByRound.entries()) {
        if (clutchRounds.has(round)) continue
        if (kills.length >= 5) combinedRounds.set(round, { kills, trigger: 'ace', killCount: kills.length })
        else if (kills.length >= 3) combinedRounds.set(round, { kills, trigger: 'multikill', killCount: kills.length })
      }

      const topKills = capture.singleKills
        ? timeline.playerKills
            .filter(k => {
              const r = k.round ?? -1
              return !clutchRounds.has(r) && !combinedRounds.has(r) && k.videoOffsetMs != null
            })
            .slice(0, 6)
        : []

      for (const kill of topKills) {
        const offsetMs = kill.videoOffsetMs!
        const startMs = Math.max(0, offsetMs - 8_000)
        try {
          const rec = clipStore.add({
            path: '', thumbPath: null, trigger: 'kill', map, agent, durationSeconds: 13,
            round: kill.round ?? null, killCount: null, analysisJobId, game, ...clipMatchMeta(timeline, kill),
          })
          const clipPath = ClipExtractor.clipPath(rec.id)
          const thumbPath = ClipExtractor.thumbPath(rec.id)
          await this.safeExtract({ sourcePath: videoPath, startOffsetMs: startMs, durationMs: 13_000, outputPath: clipPath }, vodDurationMs)
          const resolvedThumb = await this.safeThumb(videoPath, offsetMs, startMs, thumbPath)
          clipStore.update(rec.id, { path: clipPath, thumbPath: resolvedThumb, momentOffsetMs: offsetMs })
          extractedClipIds.push(rec.id)
        } catch (err) {
          reportClipExtractError('[ClipExtract] Kill clip failed', err)
        }
      }

      for (const [round, { kills: roundKills, trigger, killCount }] of combinedRounds.entries()) {
        if (trigger === 'ace' ? !capture.aces : !capture.multiKills) continue
        const validKills = roundKills.filter(k => k.videoOffsetMs != null)
        if (validKills.length === 0) continue
        const first = validKills.reduce((a, b) => a.videoOffsetMs! < b.videoOffsetMs! ? a : b)
        const last  = validKills.reduce((a, b) => a.videoOffsetMs! > b.videoOffsetMs! ? a : b)
        const preBuffer  = trigger === 'ace' ? 10_000 : 8_000
        const postBuffer = trigger === 'ace' ? 20_000 : 18_000
        const startMs   = Math.max(0, first.videoOffsetMs! - preBuffer)
        const durationMs = Math.min(last.videoOffsetMs! - first.videoOffsetMs! + postBuffer, 120_000)
        try {
          const rec = clipStore.add({
            path: '', thumbPath: null, trigger, map, agent, durationSeconds: durationMs / 1000, round, killCount, analysisJobId, game,
            ...clipMatchMeta(timeline, first),
          })
          const clipPath = ClipExtractor.clipPath(rec.id)
          const thumbPath = ClipExtractor.thumbPath(rec.id)
          await this.safeExtract({ sourcePath: videoPath, startOffsetMs: startMs, durationMs, outputPath: clipPath }, vodDurationMs)
          const resolvedThumb = await this.safeThumb(videoPath, first.videoOffsetMs!, startMs, thumbPath)
          clipStore.update(rec.id, { path: clipPath, thumbPath: resolvedThumb, momentOffsetMs: first.videoOffsetMs! })
          extractedClipIds.push(rec.id)
          logActivity(`${trigger === 'ace' ? 'Ace' : `${killCount}K`} clip saved — Round ${round + 1} (${map ?? 'unknown'})`)
        } catch (err) {
          reportClipExtractError(`[ClipExtract] ${trigger} clip failed`, err)
        }
      }

      if (capture.clutches) {
        for (const round of clutchRounds) {
          const clutchKills = timeline.playerKills.filter(k => (k.round ?? -1) === round && k.videoOffsetMs != null)
          if (clutchKills.length === 0) continue
          const first = clutchKills.reduce((a, b) => a.videoOffsetMs! < b.videoOffsetMs! ? a : b)
          const last  = clutchKills.reduce((a, b) => a.videoOffsetMs! > b.videoOffsetMs! ? a : b)
          const startMs    = Math.max(0, first.videoOffsetMs! - 15_000)
          const durationMs = Math.min(last.videoOffsetMs! - first.videoOffsetMs! + 20_000, 120_000)
          try {
            const rec = clipStore.add({
              path: '', thumbPath: null, trigger: 'clutch', map, agent, durationSeconds: durationMs / 1000, round,
              killCount: clutchKills.length, analysisJobId, game, ...clipMatchMeta(timeline, first),
            })
            const clipPath = ClipExtractor.clipPath(rec.id)
            const thumbPath = ClipExtractor.thumbPath(rec.id)
            await this.safeExtract({ sourcePath: videoPath, startOffsetMs: startMs, durationMs, outputPath: clipPath }, vodDurationMs)
            const resolvedThumb = await this.safeThumb(videoPath, first.videoOffsetMs!, startMs, thumbPath)
            clipStore.update(rec.id, { path: clipPath, thumbPath: resolvedThumb, momentOffsetMs: first.videoOffsetMs! })
            extractedClipIds.push(rec.id)
            logActivity(`Clutch clip saved — Round ${round + 1} (${map ?? 'unknown'})`)
          } catch (err) {
            reportClipExtractError('[ClipExtract] Clutch clip failed', err)
          }
        }
      }
    }

    this._finalizeExtraction(extractedClipIds, timeline, map, notifySilent)

    hotkeyBookmarks.length = 0
    this.ctx.onClipsExtracted?.(extractedClipIds.length)
  }

  /**
   * Extract only kill-based clips (3K/4K/ace/clutch) — used by the late-retry path
   * when match details weren't available at match end.
   */
  async extractKillClipsOnly(
    videoPath: string,
    timeline: MatchData,
    analysisJobId: string | null,
    game: ClipGame = 'valorant',
  ): Promise<void> {
    const { clipStore, clipExtractor, logActivity, notifySilent } = this.ctx
    const capture = this.ctx.getClipCapture()

    if (!fs.existsSync(videoPath)) {
      log.warn('[LateClipExtract] Source video not found — skipping:', videoPath)
      logActivity('Late clip extraction skipped — recording file not found')
      return
    }

    const probe = await clipExtractor.probeWithRetry(videoPath)
    if (!probe.ok) {
      log.warn('[LateClipExtract] Recording is unreadable — skipping all clip extraction:', probe.reason)
      logActivity('Late clip extraction skipped — recording was incomplete (app or ffmpeg quit before the file was finalised)')
      if (shouldReportClipProbeFailure(probe.reason)) {
        reportError({
          message: `[LateClipExtract] Recording unreadable, skipping extraction: ${probe.reason}`,
          component: 'desktop:ClipExtract',
        })
      }
      return
    }

    if (!timeline.playerKills || timeline.playerKills.length === 0) {
      log.warn('[LateClipExtract] No player kills in timeline — nothing to clip')
      return
    }

    const vodDurationMs = await clipExtractor.probeDurationMs(videoPath)

    ensureClipKillRounds(timeline)

    const map = timeline.map ?? null
    const agent = timeline.agent ?? null
    const extractedClipIds: string[] = []

    const killsByRound = new Map<number, typeof timeline.playerKills>()
    for (const kill of timeline.playerKills) {
      const r = kill.round ?? -1
      if (!killsByRound.has(r)) killsByRound.set(r, [])
      killsByRound.get(r)!.push(kill)
    }

    const clutchRounds = detectClutchRoundsForGame(timeline)
    const combinedRounds = new Map<number, { kills: KillEvent[]; trigger: 'ace' | 'multikill'; killCount: number }>()
    for (const [round, kills] of killsByRound.entries()) {
      if (clutchRounds.has(round)) continue
      if (kills.length >= 5) combinedRounds.set(round, { kills, trigger: 'ace', killCount: kills.length })
      else if (kills.length >= 3) combinedRounds.set(round, { kills, trigger: 'multikill', killCount: kills.length })
    }

    for (const [round, { kills: roundKills, trigger, killCount }] of combinedRounds.entries()) {
      if (trigger === 'ace' ? !capture.aces : !capture.multiKills) continue
      const validKills = roundKills.filter(k => k.videoOffsetMs != null)
      if (validKills.length === 0) continue
      const first = validKills.reduce((a, b) => a.videoOffsetMs! < b.videoOffsetMs! ? a : b)
      const last  = validKills.reduce((a, b) => a.videoOffsetMs! > b.videoOffsetMs! ? a : b)
      const preBuffer  = trigger === 'ace' ? 10_000 : 8_000
      const postBuffer = trigger === 'ace' ? 20_000 : 18_000
      const startMs    = Math.max(0, first.videoOffsetMs! - preBuffer)
      const durationMs = Math.min(last.videoOffsetMs! - first.videoOffsetMs! + postBuffer, 120_000)
      try {
        const rec = clipStore.add({
          path: '', thumbPath: null, trigger, map, agent, durationSeconds: durationMs / 1000, round, killCount, analysisJobId, game,
          ...clipMatchMeta(timeline, first),
        })
        const clipPath = ClipExtractor.clipPath(rec.id)
        const thumbPath = ClipExtractor.thumbPath(rec.id)
        await this.safeExtract({ sourcePath: videoPath, startOffsetMs: startMs, durationMs, outputPath: clipPath }, vodDurationMs)
        const resolvedThumb = await this.safeThumb(videoPath, first.videoOffsetMs!, startMs, thumbPath)
        clipStore.update(rec.id, { path: clipPath, thumbPath: resolvedThumb, momentOffsetMs: first.videoOffsetMs! })
        extractedClipIds.push(rec.id)
        logActivity(`${trigger === 'ace' ? 'Ace' : `${killCount}K`} clip saved (late extract) — Round ${round + 1} (${map ?? 'unknown'})`)
      } catch (err) {
        reportClipExtractError(`[LateClipExtract] ${trigger} clip failed`, err)
      }
    }

    for (const round of capture.clutches ? clutchRounds : []) {
      const clutchKills = timeline.playerKills.filter(k => (k.round ?? -1) === round && k.videoOffsetMs != null)
      if (clutchKills.length === 0) continue
      const first = clutchKills.reduce((a, b) => a.videoOffsetMs! < b.videoOffsetMs! ? a : b)
      const last  = clutchKills.reduce((a, b) => a.videoOffsetMs! > b.videoOffsetMs! ? a : b)
      const startMs    = Math.max(0, first.videoOffsetMs! - 15_000)
      const durationMs = Math.min(last.videoOffsetMs! - first.videoOffsetMs! + 20_000, 120_000)
      try {
        const rec = clipStore.add({
          path: '', thumbPath: null, trigger: 'clutch', map, agent, durationSeconds: durationMs / 1000, round,
          killCount: clutchKills.length, analysisJobId, game, ...clipMatchMeta(timeline, first),
        })
        const clipPath = ClipExtractor.clipPath(rec.id)
        const thumbPath = ClipExtractor.thumbPath(rec.id)
        await this.safeExtract({ sourcePath: videoPath, startOffsetMs: startMs, durationMs, outputPath: clipPath }, vodDurationMs)
        const resolvedThumb = await this.safeThumb(videoPath, first.videoOffsetMs!, startMs, thumbPath)
        clipStore.update(rec.id, { path: clipPath, thumbPath: resolvedThumb, momentOffsetMs: first.videoOffsetMs! })
        extractedClipIds.push(rec.id)
        logActivity(`Clutch clip saved (late extract) — Round ${round + 1} (${map ?? 'unknown'})`)
      } catch (err) {
        reportClipExtractError('[LateClipExtract] Clutch clip failed', err)
      }
    }

    if (extractedClipIds.length > 0) {
      logActivity(`${extractedClipIds.length} late-extracted clip${extractedClipIds.length === 1 ? '' : 's'} saved`)
      this.ctx.notifyMainWindow('clips:new', extractedClipIds)
      this.ctx.onClipsExtracted?.(extractedClipIds.length)
      showAppNotification({
        title: 'UpForge — Clips Ready',
        body: `${extractedClipIds.length} highlight clip${extractedClipIds.length === 1 ? '' : 's'} saved from your match!`,
        silent: notifySilent(),
      })
    }
  }

  private _finalizeExtraction(
    extractedClipIds: string[],
    timeline: MatchData | null,
    map: string | null,
    notifySilent: () => boolean,
  ): void {
    if (extractedClipIds.length > 0) {
      this.ctx.logActivity(`${extractedClipIds.length} clip${extractedClipIds.length === 1 ? '' : 's'} saved from match`)
      this.ctx.notifyMainWindow('clips:new', extractedClipIds)
      showAppNotification({
        title: 'UpForge — Clips Ready',
        body: `${extractedClipIds.length} highlight clip${extractedClipIds.length === 1 ? '' : 's'} saved`,
        silent: notifySilent(),
      })
    } else {
      const killCount  = timeline?.playerKills?.length ?? 0
      const hotkeyCount = this.ctx.hotkeyBookmarks.length
      if (killCount === 0 && hotkeyCount === 0) {
        this.ctx.logActivity('No clips extracted — no kills in timeline (MatchDetails may not be ready yet) and no hotkey bookmarks')
      } else if (killCount === 0) {
        this.ctx.logActivity('No kill clips extracted — no kills in timeline; hotkey clips may have been saved')
      } else {
        this.ctx.logActivity('No clips extracted — all kills lacked video timestamps')
      }
      log.info(`[ClipExtract] 0 clips produced — kills=${killCount} hotkeys=${hotkeyCount} timeline=${!!timeline}`)
    }
  }
}
