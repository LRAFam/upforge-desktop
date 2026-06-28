import type { AnalysisItem, PendingRecording } from '../env.d.ts'
import { normalizeCombatScoreToAcs } from './valorant'

export interface MatchRowStats {
  won: boolean | null
  kills: number | null
  deaths: number | null
  assists: number | null
  combat_score: number | null
  hs_pct: number | null
}

const EMPTY_ROW_STATS: MatchRowStats = {
  won: null,
  kills: null,
  deaths: null,
  assists: null,
  combat_score: null,
  hs_pct: null,
}

function resolveTimelineWon(timeline: PendingRecording['timeline']): boolean | null {
  if (!timeline) return null
  if (timeline.finalStats?.won != null) return timeline.finalStats.won
  const finalScore = timeline.finalScore
  if (finalScore) {
    if (finalScore.allyScore === finalScore.enemyScore) return null
    return finalScore.allyScore > finalScore.enemyScore
  }
  const rounds = timeline.roundScores
  if (rounds?.length) {
    const last = rounds[rounds.length - 1]
    if (last.allyScore === last.enemyScore) return null
    return last.allyScore > last.enemyScore
  }
  return null
}

export function analysisRounds(a: AnalysisItem): number | null {
  if (a.rounds_won != null && a.rounds_lost != null) return a.rounds_won + a.rounds_lost
  return null
}

export function displayAcs(a: AnalysisItem): number | null {
  return normalizeCombatScoreToAcs(a.combat_score, analysisRounds(a))
}

export function isAnalysisProcessing(a: AnalysisItem): boolean {
  if (a.game_mode === 'DEADLOCK' || a.game_mode === 'CS2') {
    return a.status === 'pending' || a.status === 'processing' || a.status === 'uploading'
  }
  return ['queued', 'processing', 'pending'].includes(a.status)
}

export function recordingRowStats(rec: PendingRecording): MatchRowStats {
  const fs = rec.timeline?.finalStats
  if (!fs) return EMPTY_ROW_STATS
  const summaryRounds = rec.timeline?.roundSummaries?.length ?? 0
  const scoreRounds = (rec.timeline?.finalScore?.allyScore ?? 0) + (rec.timeline?.finalScore?.enemyScore ?? 0)
  const rounds = summaryRounds > 0 ? summaryRounds : (scoreRounds > 0 ? scoreRounds : null)
  return {
    won: resolveTimelineWon(rec.timeline),
    kills: fs.kills ?? null,
    deaths: fs.deaths ?? null,
    assists: fs.assists ?? null,
    combat_score: normalizeCombatScoreToAcs(fs.score, rounds),
    hs_pct: fs.headshotPct ?? null,
  }
}

export function isRecordingInFlight(
  rec: PendingRecording,
  _uploadProgressByRecordingId: Record<string, number>,
): boolean {
  if (rec.clipsOnly) return false
  if (rec.pipelineDeferReason === 'recording') return false
  if (rec.lastAnalysisError) return false
  return rec.pipelineStatus === 'uploading' || rec.pipelineStatus === 'analysing'
}

export function isRecordingDeferred(rec: PendingRecording): boolean {
  return rec.pipelineDeferReason === 'recording' && !rec.clipsOnly
}

export function recordingPipelineLabel(
  rec: PendingRecording,
  uploadProgressByRecordingId: Record<string, number>,
): string | null {
  if (rec.clipsOnly) {
    if (rec.clipOnlyReason === 'clips_only_mode') return 'Highlights only'
    return 'Highlights saved'
  }
  if (rec.pipelineDeferReason === 'recording') {
    return 'Paused — match recording'
  }
  if (rec.pipelineStatus === 'uploading') {
    const pct = uploadProgressByRecordingId[rec.id] ?? rec.uploadProgress
    const prefix = rec.pipelineArchiveOnly ? 'Saving to cloud' : 'Uploading'
    return pct != null ? `${prefix} ${pct}%` : `${prefix}…`
  }
  if (rec.pipelineStatus === 'analysing') {
    return rec.analysisStep?.trim() || 'Analysing…'
  }
  return null
}

export function recordingUploadProgress(
  rec: PendingRecording,
  uploadProgressByRecordingId: Record<string, number>,
): number | null {
  if (rec.pipelineStatus !== 'uploading') return null
  const pct = uploadProgressByRecordingId[rec.id] ?? rec.uploadProgress
  return pct != null ? Math.min(100, Math.max(0, pct)) : null
}

export function formatRelativeTime(d: string): string {
  const diff = Date.now() - new Date(d).getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  if (bytes >= 1024 * 1024) return Math.round(bytes / (1024 * 1024)) + ' MB'
  return Math.round(bytes / 1024) + ' KB'
}
