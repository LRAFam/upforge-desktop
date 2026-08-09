import type { PendingRecording } from '../env.d.ts'
import { canWatchRawRecording } from './recording-demo-status'
import { canRetryRiotMatchStats } from './match-stats-retry'
import { recordingStatusBadge } from './recording-status'

export type RecordingLibraryChip = 'all' | 'needs_attention' | 'ready' | 'analysed' | 'cloud'
export type RecordingDateGroupLabel = 'Today' | 'Yesterday' | 'This Week' | 'This Month' | 'Older'
export interface RecordingDateGroup {
  label: RecordingDateGroupLabel
  items: PendingRecording[]
}
export type RecordingDeleteChoice = 'remove' | 'localOnly' | 'cancel'

export function recordingNeedsAttention(rec: PendingRecording): boolean {
  if (rec.lastAnalysisError) return true
  const badge = recordingStatusBadge(rec)
  if (badge.label === 'Failed') return true
  if (badge.label === 'Syncing') return true
  if (!canWatchRawRecording(rec) && rec.analysisId == null) return true
  if (canRetryRiotMatchStats(rec) && !rec.analysisReadiness?.ready) return true
  return false
}

export function matchesRecordingLibraryChip(rec: PendingRecording, chip: RecordingLibraryChip): boolean {
  if (chip === 'all') return true
  if (chip === 'needs_attention') return recordingNeedsAttention(rec)
  if (chip === 'analysed') return recordingStatusBadge(rec).label === 'Analysed'
  if (chip === 'cloud') return recordingStatusBadge(rec).label === 'Cloud'
  if (chip === 'ready') {
    return (
      rec.analysisId == null
      && !rec.pipelineStatus
      && !recordingNeedsAttention(rec)
      && Boolean(rec.analysisReadiness?.ready)
    )
  }
  return false
}

export function groupRecordingsByDate(items: PendingRecording[], nowMs = Date.now()): RecordingDateGroup[] {
  const DAY = 86_400_000
  const today = new Date(nowMs)
  today.setHours(0, 0, 0, 0)
  const todayMs = today.getTime()
  const buckets: Record<RecordingDateGroupLabel, PendingRecording[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    'This Month': [],
    Older: [],
  }
  for (const r of items) {
    const at = r.recordedAt ?? 0
    const diff = nowMs - at
    if (at >= todayMs) buckets.Today.push(r)
    else if (at >= todayMs - DAY) buckets.Yesterday.push(r)
    else if (diff < 7 * DAY) buckets['This Week'].push(r)
    else if (diff < 30 * DAY) buckets['This Month'].push(r)
    else buckets.Older.push(r)
  }
  return (Object.keys(buckets) as RecordingDateGroupLabel[])
    .filter(label => buckets[label].length > 0)
    .map(label => ({ label, items: buckets[label] }))
}

export function visibleGroupItems<T>(items: T[], showAll: boolean, limit = 12): { shown: T[]; hiddenCount: number } {
  if (showAll || items.length <= limit) return { shown: items, hiddenCount: 0 }
  return { shown: items.slice(0, limit), hiddenCount: items.length - limit }
}

export function recordingDeleteOptions(rec: PendingRecording): Array<'remove' | 'localOnly'> {
  const hasLocal = Boolean(rec.hasLocalFile || (rec.path && rec.path.length > 0))
  const cloud = Boolean(rec.cloudUploaded || rec.jobId || rec.analysisId != null || rec.archiveId)
  if (hasLocal && cloud) return ['remove', 'localOnly']
  return ['remove']
}

export function formatRecordingBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
