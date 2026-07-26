/**
 * Per-match ops telemetry session (sector times, DNF, correlation id).
 * Snapshots must never include absolute file paths.
 */

import { randomUUID } from 'crypto'
import type { HardwareBucket } from './machine-profile'

export type RecordingEndReason =
  | 'clean'
  | 'interrupted'
  | 'crash_suspected'
  | 'manual'
  | 'too_short'
  | 'discarded'
  | 'start_failed'
  | 'path_unresolved'

export type RecordingDnfReason =
  | 'obs_not_ready'
  | 'advanced_output'
  | 'disk_critical'
  | 'mode_filtered'
  | 'path_fallback'
  | 'settle_timeout'
  | 'probe_failed'
  | 'remux_failed'
  | 'upload_abort'
  | 'quota'
  | 'too_short'
  | 'capture_retarget_failed'
  | 'unowned_obs_recording'
  | 'other'

export type SectorName =
  | 'detect_to_record_start'
  | 'end_to_file_ready'
  | 'remux_compress'
  | 'upload'
  | 'analysis_accepted'
  | 'lap_end_to_analysis'

export interface RecordingFacts {
  resolution: string | null
  targetFps: number | null
  encoder: string | null
  bitrateKbps: number | null
  outputFormat: string | null
  outputMode: string | null
  durationSec: number | null
  fileSizeMb: number | null
}

export interface ObsHealthSample {
  at: number
  outputFps: number | null
  targetFps: number | null
  skippedFrames: number | null
  laggedFrames: number | null
  cpuPercent: number | null
  freeDiskGb: number | null
  reconnectCount: number | null
  backgroundAborted: boolean | null
}

export interface CaptureTargetFacts {
  method: string | null
  title: string | null
  monitorIndex: number | null
}

export interface OpsRecordingLap {
  event: 'ops_recording_lap'
  match_correlation_id: string
  game: string
  machine_bucket: HardwareBucket
  app_version: string
  obs_version: string | null
  encoder: string | null
  sectors_ms: Partial<Record<SectorName, number>>
  dnf: RecordingDnfReason | null
  dnf_detail: string | null
  end_reason: RecordingEndReason | null
  path_fallback: boolean
  audio_tracks: number | null
  capture_method: string | null
  capture_title: string | null
  monitor_index: number | null
  recording_facts: Partial<RecordingFacts>
  obs_sample_count: number
  obs_skipped_frames_max: number | null
  obs_lagged_frames_max: number | null
  checksum_prefix: string | null
  duels_after_vod: boolean | null
}

type MachineBits = {
  bucket: HardwareBucket
  encoder: string | null
  obsVersion: string | null
  appVersion: string
}

export class MatchTelemetrySession {
  readonly correlationId: string
  readonly game: string
  private readonly machine: MachineBits
  private readonly sectorStarts = new Map<SectorName, number>()
  private readonly sectorsMs: Partial<Record<SectorName, number>> = {}
  private dnf: RecordingDnfReason | null = null
  private dnfDetail: string | null = null
  private endReason: RecordingEndReason | null = null
  private pathFallback = false
  private audioTracks: number | null = null
  private capture: CaptureTargetFacts = { method: null, title: null, monitorIndex: null }
  private facts: Partial<RecordingFacts> = {}
  private samples: ObsHealthSample[] = []
  private checksumPrefix: string | null = null
  private duelsAfterVod: boolean | null = null
  private lapEmitted = false

  constructor(game: string, machine: MachineBits, correlationId?: string) {
    this.game = game
    this.machine = machine
    this.correlationId = correlationId ?? randomUUID()
  }

  mark(sector: SectorName, at: number = Date.now()): void {
    this.sectorsMs[sector] = at
  }

  startSector(sector: SectorName, at: number = Date.now()): void {
    this.sectorStarts.set(sector, at)
  }

  endSector(sector: SectorName, at: number = Date.now()): void {
    const start = this.sectorStarts.get(sector)
    if (start == null) return
    this.sectorsMs[sector] = Math.max(0, at - start)
    this.sectorStarts.delete(sector)
  }

  setDnf(reason: RecordingDnfReason, detail?: string): void {
    this.dnf = reason
    this.dnfDetail = detail?.slice(0, 200) ?? null
  }

  setEndReason(reason: RecordingEndReason): void {
    this.endReason = reason
  }

  setRecordingFacts(facts: Partial<RecordingFacts>): void {
    this.facts = { ...this.facts, ...facts }
  }

  addObsSample(sample: ObsHealthSample): void {
    this.samples.push(sample)
  }

  setPathFallback(used: boolean): void {
    this.pathFallback = used
  }

  setAudioTracks(count: number | null): void {
    this.audioTracks = count
  }

  setCaptureTarget(target: CaptureTargetFacts): void {
    this.capture = { ...target }
  }

  setChecksumPrefix(prefix: string | null): void {
    this.checksumPrefix = prefix ? prefix.slice(0, 12) : null
  }

  setDuelsAfterVod(value: boolean): void {
    this.duelsAfterVod = value
  }

  hasEmittedLap(): boolean {
    return this.lapEmitted
  }

  markLapEmitted(): void {
    this.lapEmitted = true
  }

  snapshot(): OpsRecordingLap {
    let skippedMax: number | null = null
    let laggedMax: number | null = null
    for (const s of this.samples) {
      if (s.skippedFrames != null) {
        skippedMax = skippedMax == null ? s.skippedFrames : Math.max(skippedMax, s.skippedFrames)
      }
      if (s.laggedFrames != null) {
        laggedMax = laggedMax == null ? s.laggedFrames : Math.max(laggedMax, s.laggedFrames)
      }
    }

    return {
      event: 'ops_recording_lap',
      match_correlation_id: this.correlationId,
      game: this.game,
      machine_bucket: this.machine.bucket,
      app_version: this.machine.appVersion,
      obs_version: this.machine.obsVersion,
      encoder: this.machine.encoder,
      sectors_ms: { ...this.sectorsMs },
      dnf: this.dnf,
      dnf_detail: this.dnfDetail,
      end_reason: this.endReason,
      path_fallback: this.pathFallback,
      audio_tracks: this.audioTracks,
      capture_method: this.capture.method,
      capture_title: this.capture.title,
      monitor_index: this.capture.monitorIndex,
      recording_facts: { ...this.facts },
      obs_sample_count: this.samples.length,
      obs_skipped_frames_max: skippedMax,
      obs_lagged_frames_max: laggedMax,
      checksum_prefix: this.checksumPrefix,
      duels_after_vod: this.duelsAfterVod,
    }
  }
}
