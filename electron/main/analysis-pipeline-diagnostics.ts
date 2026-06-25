import type { UploadManager } from './upload-manager'
import type { RecordingsStore, PendingRecording } from './recordings-store'
import type { AnalysisPollStatus } from './analysis-poll'

export type PipelineStepState = 'pending' | 'active' | 'done' | 'error' | 'skipped'

export interface PipelineStep {
  id: string
  label: string
  description: string
  state: PipelineStepState
  detail: string | null
}

export interface AnalysisPipelineDiagnostics {
  summary: string
  mode: 'idle' | 'analyse' | 'archive'
  activePollJobId: string | null
  primaryJobId: string | null
  pendingJob: {
    job_id: string
    savedAt: number
    agent?: string
    map?: string
    game?: string
    ageMs: number
  } | null
  serverStatus: {
    status: string
    progress: number
    current_step: string | null
    error: string | null
    analysis_id: number | null
  } | null
  recording: {
    id: string
    map: string | null
    agent: string | null
    game: string
    pipelineStatus: string | null
    uploadProgress: number | null
    analysisProgress: number | null
    analysisStep: string | null
    jobId: string | null
    analysisId: number | null
    cloudArchived: boolean
    archiveId: string | null
    localFileExists: boolean
  } | null
  inFlightCount: number
  steps: PipelineStep[]
  recentEvents: Array<{ time: number; message: string }>
}

const ANALYSE_STEPS: Array<{ id: string; label: string; description: string }> = [
  { id: 'prepare', label: 'Prepare video', description: 'Compress or transcode OBS recording if needed' },
  { id: 'enrich', label: 'Match metadata', description: 'Riot stats, rank snapshot, coaching context' },
  { id: 'presign', label: 'Request upload URL', description: 'POST /api/desktop-submissions/presign' },
  { id: 's3', label: 'Upload VOD', description: 'Stream file to S3 (direct PUT)' },
  { id: 'complete', label: 'Confirm & queue', description: 'POST /complete — starts analysis job' },
  { id: 'queued', label: 'Queued', description: 'Waiting for analysis worker' },
  { id: 'processing', label: 'AI analysis', description: 'Server coaching pipeline' },
  { id: 'done', label: 'Complete', description: 'Results ready in dashboard' },
]

const ARCHIVE_STEPS: Array<{ id: string; label: string; description: string }> = [
  { id: 'prepare', label: 'Prepare video', description: 'Compress or transcode if needed' },
  { id: 'enrich', label: 'Match metadata', description: 'Riot stats and match context' },
  { id: 'presign', label: 'Request archive URL', description: 'POST /api/recordings/archive/presign' },
  { id: 's3', label: 'Upload VOD', description: 'Stream file to S3 (archive quota)' },
  { id: 'complete', label: 'Confirm archive', description: 'POST /archive/complete — no analysis queued' },
  { id: 'done', label: 'Saved to cloud', description: 'VOD playable from cloud library' },
]

const ANALYSIS_ACTIVITY_RE =
  /\b(upload|analys|analysis|compress|transcod|riot match|cloud save|archive|presign|pending recording|job )\b/i

function extractAnalysisId(result?: Record<string, unknown> | null): number | null {
  const raw = result?.analysis_id ?? result?.analysisId
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw)
  return null
}

function pickPrimaryRecording(
  recordings: PendingRecording[],
  jobId: string | null,
): PendingRecording | null {
  if (jobId) {
    const byJob = recordings.find((r) => r.jobId === jobId)
    if (byJob) return byJob
  }
  const inFlight = recordings.filter(
    (r) => r.pipelineStatus === 'uploading' || r.pipelineStatus === 'analysing',
  )
  if (inFlight.length === 0) return null
  return inFlight.sort((a, b) => b.recordedAt - a.recordedAt)[0]
}

function step(
  def: { id: string; label: string; description: string },
  state: PipelineStepState,
  detail: string | null = null,
): PipelineStep {
  return { ...def, state, detail }
}

function buildAnalyseSteps(
  rec: PendingRecording | null,
  server: AnalysisPipelineDiagnostics['serverStatus'],
  activityMessages: string[],
): PipelineStep[] {
  const uploadPct = rec?.uploadProgress ?? null
  const pipeline = rec?.pipelineStatus ?? null
  const serverStatus = server?.status ?? null
  const failed = serverStatus === 'failed' || activityMessages.some((m) => /failed|error/i.test(m))

  const states: Record<string, PipelineStepState> = {
    prepare: 'pending',
    enrich: 'pending',
    presign: 'pending',
    s3: 'pending',
    complete: 'pending',
    queued: 'pending',
    processing: 'pending',
    done: 'pending',
  }
  const details: Record<string, string | null> = {}

  const hasActivity = (re: RegExp) => activityMessages.some((m) => re.test(m))
  const uploading = pipeline === 'uploading' || serverStatus === 'uploading'
  const analysing = pipeline === 'analysing' || serverStatus === 'queued' || serverStatus === 'processing'

  if (hasActivity(/compress|transcod|converting obs/i)) {
    states.prepare = 'active'
  } else if (uploadPct != null || uploading || analysing || serverStatus === 'completed') {
    states.prepare = 'done'
  }

  if (hasActivity(/riot match stats loaded/i)) {
    states.enrich = 'done'
    details.enrich = activityMessages.find((m) => /riot match stats/i.test(m)) ?? null
  } else if (uploadPct != null && uploadPct >= 3) {
    states.enrich = uploading && uploadPct <= 8 ? 'active' : 'done'
  }

  if (rec?.jobId || server) {
    states.presign = 'done'
    if (rec?.jobId) details.presign = `job_id: ${rec.jobId.slice(0, 8)}…`
  } else if (uploading && uploadPct != null && uploadPct >= 3 && uploadPct < 8) {
    states.presign = 'active'
  }

  if (uploadPct != null) {
    if (uploadPct >= 100) {
      states.s3 = 'done'
      details.s3 = '100%'
    } else if (uploadPct >= 8) {
      states.s3 = 'active'
      details.s3 = `${uploadPct}%`
    }
  } else if (serverStatus && serverStatus !== 'uploading') {
    states.s3 = 'done'
  }

  if (uploadPct != null && uploadPct >= 100) {
    states.complete = 'done'
  } else if (uploadPct != null && uploadPct >= 95) {
    states.complete = 'active'
  } else if (analysing || serverStatus === 'queued' || serverStatus === 'processing' || serverStatus === 'completed') {
    states.complete = 'done'
  }

  if (serverStatus === 'queued') {
    states.queued = 'active'
    details.queued = server?.current_step ?? 'Waiting for worker'
  } else if (serverStatus === 'processing') {
    states.queued = 'done'
    states.processing = 'active'
    details.processing = server?.current_step ?? `${server?.progress ?? 0}%`
  } else if (serverStatus === 'completed' || rec?.analysisId != null) {
    states.queued = 'done'
    states.processing = 'done'
    states.done = 'done'
    const id = rec?.analysisId ?? server?.analysis_id
    if (id != null) details.done = `analysis_id: ${id}`
  } else if (analysing && !serverStatus) {
    states.queued = 'active'
    details.queued = rec?.analysisStep ?? 'Polling server…'
  }

  if (rec?.analysisProgress != null && states.processing === 'pending') {
    states.queued = 'done'
    states.processing = 'active'
    details.processing = rec.analysisStep ?? `${rec.analysisProgress}%`
  }

  if (failed) {
    const failStep =
      serverStatus === 'failed' ? (states.processing === 'active' ? 'processing' : 'queued')
        : uploadPct != null && uploadPct < 100 ? 's3'
          : states.presign === 'active' ? 'presign' : 'processing'
    states[failStep] = 'error'
    details[failStep] = server?.error ?? activityMessages.find((m) => /failed/i.test(m)) ?? 'Failed'
  }

  return ANALYSE_STEPS.map((def) => step(def, states[def.id], details[def.id] ?? null))
}

function buildArchiveSteps(
  rec: PendingRecording | null,
  activityMessages: string[],
): PipelineStep[] {
  const uploadPct = rec?.uploadProgress ?? null
  const pipeline = rec?.pipelineStatus ?? null
  const states: Record<string, PipelineStepState> = {
    prepare: 'pending',
    enrich: 'pending',
    presign: 'pending',
    s3: 'pending',
    complete: 'pending',
    done: 'pending',
  }
  const details: Record<string, string | null> = {}

  const hasActivity = (re: RegExp) => activityMessages.some((m) => re.test(m))
  const uploading = pipeline === 'uploading'

  if (hasActivity(/compress|transcod/i)) states.prepare = 'active'
  else if (uploadPct != null || rec?.cloudArchived) states.prepare = 'done'

  if (hasActivity(/riot match stats/i) || uploadPct != null) states.enrich = 'done'

  if (rec?.archiveId) {
    states.presign = 'done'
    states.s3 = 'done'
    states.complete = 'done'
    states.done = 'done'
    details.done = `archive_id: ${rec.archiveId.slice(0, 8)}…`
  } else if (uploading) {
    if (uploadPct != null && uploadPct < 8) states.presign = 'active'
    else if (uploadPct != null && uploadPct < 100) {
      states.presign = 'done'
      states.s3 = 'active'
      details.s3 = `${uploadPct}%`
    } else if (uploadPct === 100) {
      states.presign = 'done'
      states.s3 = 'done'
      states.complete = 'active'
    }
  }

  if (hasActivity(/cloud save failed/i)) {
    const failAt = uploadPct != null && uploadPct < 100 ? 's3' : 'complete'
    states[failAt] = 'error'
    details[failAt] = activityMessages.find((m) => /cloud save failed/i.test(m)) ?? null
  }

  return ARCHIVE_STEPS.map((def) => step(def, states[def.id], details[def.id] ?? null))
}

function buildSummary(
  mode: AnalysisPipelineDiagnostics['mode'],
  rec: PendingRecording | null,
  server: AnalysisPipelineDiagnostics['serverStatus'],
  activePollJobId: string | null,
): string {
  if (mode === 'idle') {
    return 'Idle — no VOD upload or analysis in progress. Trigger Analyse from the dashboard or post-game screen.'
  }

  if (mode === 'archive') {
    if (rec?.cloudArchived) return 'Cloud archive complete — VOD saved without analysis.'
    if (rec?.pipelineStatus === 'uploading') {
      return `Saving to cloud${rec.uploadProgress != null ? ` (${rec.uploadProgress}%)` : ''}…`
    }
    return 'Cloud archive in progress…'
  }

  if (rec?.pipelineStatus === 'uploading') {
    const pct = rec.uploadProgress
    if (pct != null && pct < 8) return 'Requesting presigned upload URL…'
    if (pct != null && pct < 100) return `Uploading VOD to cloud (${pct}%)…`
    return 'Upload finishing — confirming with API…'
  }

  if (server?.status === 'queued') {
    return `Analysis queued on server${server.current_step ? ` — ${server.current_step}` : ''}`
  }
  if (server?.status === 'processing') {
    return `AI analysis running (${server.progress}%)${server.current_step ? ` — ${server.current_step}` : ''}`
  }
  if (server?.status === 'failed') {
    return `Analysis failed: ${server.error ?? 'unknown error'}`
  }
  if (server?.status === 'completed' || rec?.analysisId != null) {
    return `Analysis complete${rec?.analysisId != null ? ` (id ${rec.analysisId})` : ''}`
  }
  if (rec?.pipelineStatus === 'analysing') {
    const step = rec.analysisStep ?? (rec.analysisProgress != null ? `${rec.analysisProgress}%` : null)
    return `Polling analysis status${step ? ` — ${step}` : ''}${activePollJobId ? '' : ' (poll not active — may resume on refresh)'}`
  }

  return 'VOD analysis pipeline active'
}

export interface BuildAnalysisPipelineDiagnosticsOpts {
  uploadManager: UploadManager
  recordingsStore: RecordingsStore
  activePollJobId: string | null
  pendingJob: { job_id: string; savedAt: number; agent?: string; map?: string; game?: string } | null
  activityLog: Array<{ time: number; message: string }>
  localFileExists: (path: string) => boolean
}

export async function buildAnalysisPipelineDiagnostics(
  opts: BuildAnalysisPipelineDiagnosticsOpts,
): Promise<AnalysisPipelineDiagnostics> {
  const uniqueInFlight = opts.recordingsStore.listInFlightPipelines()

  const primaryJobId =
    opts.activePollJobId
    ?? opts.pendingJob?.job_id
    ?? uniqueInFlight.find((r) => r.jobId)?.jobId
    ?? null

  const recording = pickPrimaryRecording(uniqueInFlight, primaryJobId)

  const recentEvents = opts.activityLog
    .filter((e) => ANALYSIS_ACTIVITY_RE.test(e.message))
    .slice(-12)

  const activityMessages = recentEvents.map((e) => e.message)

  const archiveMode =
    recording?.cloudArchived === true
    || (
      recording?.pipelineStatus === 'uploading'
      && !recording?.analysed
      && activityMessages.some((m) => /saving recording to cloud|saved to cloud|cloud save/i.test(m))
      && !activityMessages.some((m) => /ai analysis|analys/i.test(m))
    )

  let serverStatus: AnalysisPipelineDiagnostics['serverStatus'] = null
  if (primaryJobId && !archiveMode) {
    try {
      const status: AnalysisPollStatus = await opts.uploadManager.pollStatus(primaryJobId)
      serverStatus = {
        status: status.status,
        progress: typeof status.progress === 'number' ? Math.round(status.progress) : 0,
        current_step: status.current_step ?? null,
        error: status.error ?? null,
        analysis_id: extractAnalysisId(status.result),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      serverStatus = {
        status: 'poll_error',
        progress: 0,
        current_step: null,
        error: msg,
        analysis_id: null,
      }
    }
  }

  const mode: AnalysisPipelineDiagnostics['mode'] =
    uniqueInFlight.length === 0 && !primaryJobId && !opts.activePollJobId
      ? 'idle'
      : archiveMode
        ? 'archive'
        : 'analyse'

  const steps =
    mode === 'archive'
      ? buildArchiveSteps(recording, activityMessages)
      : mode === 'idle'
        ? ANALYSE_STEPS.map((def) => step(def, 'pending', null))
        : buildAnalyseSteps(recording, serverStatus, activityMessages)

  const summary = buildSummary(mode, recording, serverStatus, opts.activePollJobId)

  return {
    summary,
    mode,
    activePollJobId: opts.activePollJobId,
    primaryJobId,
    pendingJob: opts.pendingJob
      ? {
          ...opts.pendingJob,
          ageMs: Date.now() - opts.pendingJob.savedAt,
        }
      : null,
    serverStatus,
    recording: recording
      ? {
          id: recording.id,
          map: recording.map,
          agent: recording.agent,
          game: recording.game,
          pipelineStatus: recording.pipelineStatus ?? null,
          uploadProgress: recording.uploadProgress ?? null,
          analysisProgress: recording.analysisProgress ?? null,
          analysisStep: recording.analysisStep ?? null,
          jobId: recording.jobId ?? null,
          analysisId: recording.analysisId ?? null,
          cloudArchived: recording.cloudArchived ?? false,
          archiveId: recording.archiveId ?? null,
          localFileExists: recording.path ? opts.localFileExists(recording.path) : false,
        }
      : null,
    inFlightCount: uniqueInFlight.length,
    steps,
    recentEvents,
  }
}
