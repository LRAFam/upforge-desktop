import type { PendingRecording } from '../env.d.ts'

export type RecordingStatusLabel =
  | 'Local'
  | 'Cloud'
  | 'Syncing'
  | 'Uploading'
  | 'Analysing'
  | 'Analysed'
  | 'Failed'

export interface RecordingStatusBadge {
  label: RecordingStatusLabel
  class: string
}

const CLASSES: Record<RecordingStatusLabel, string> = {
  Analysed: 'bg-green-500/15 text-green-300 ring-green-500/25',
  Analysing: 'bg-blue-500/15 text-blue-300 ring-blue-500/25',
  Uploading: 'bg-blue-500/15 text-blue-300 ring-blue-500/25',
  Failed: 'bg-red-500/15 text-red-300 ring-red-500/25',
  Syncing: 'bg-amber-500/15 text-amber-300 ring-amber-500/25',
  Cloud: 'bg-white/10 text-gray-300 ring-white/15',
  Local: 'bg-white/10 text-gray-300 ring-white/15',
}

export function recordingStatusBadge(rec: PendingRecording): RecordingStatusBadge {
  if (rec.analysisId != null) return { label: 'Analysed', class: CLASSES.Analysed }
  if (rec.pipelineStatus === 'analysing') return { label: 'Analysing', class: CLASSES.Analysing }
  if (rec.pipelineStatus === 'uploading') return { label: 'Uploading', class: CLASSES.Uploading }
  if (rec.lastAnalysisError) return { label: 'Failed', class: CLASSES.Failed }
  const state = rec.analysisReadiness?.state
  if (state === 'syncing' || state === 'waiting_match_data' || state === 'finalizing') {
    return { label: 'Syncing', class: CLASSES.Syncing }
  }
  if (rec.cloudUploaded) return { label: 'Cloud', class: CLASSES.Cloud }
  if (rec.hasLocalFile) return { label: 'Local', class: CLASSES.Local }
  return { label: 'Local', class: CLASSES.Local }
}
