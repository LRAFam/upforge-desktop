/**
 * Buffered post-game UI state — renderer can sync on mount when IPC events were
 * emitted before Vue listeners were registered (common race on window open).
 */

import type { BrowserWindow } from 'electron'
import type { AnalysisErrorPayload } from '../../src/lib/analysis-failure-messages'

/** Local copy so this module stays free of window-manager/electron value imports (unit-testable). */
function whenWebContentsReady(win: BrowserWindow, fn: () => void): void {
  if (win.isDestroyed()) return
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', fn)
  } else {
    fn()
  }
}

export type PostGameUiPhase =
  | 'preparing'
  | 'uploading'
  | 'analysing'
  | 'ready'
  | 'error'
  | 'pending'
  | 'archived'
  | 'quota_required'

export type PostGameSessionSnapshot = {
  phase: PostGameUiPhase
  game?: string
  map?: string | null
  agent?: string | null
  uploadProgress: number
  compressing: boolean
  compressKind: 'remux' | 'transcode' | 'shrink' | null
  preparingSyncMessage: string | null
  ownerUserId: number | null
  recordingId: string | null
  archiveOnly: boolean
  analysisReadiness: { ready: boolean; state: string; message: string } | null
  pendingAnalysisReady: boolean
  pendingAnalysisMessage: string | null
  pendingAnalysisState: string | null
  matchDataStatus: string | null
  killsInTimeline: number
  analysisResult: Record<string, unknown> | null
  analysisError: string | AnalysisErrorPayload | null
  analysisProgress: number
  analysisStep: string | null
  analysisJobStatus: string
  analysisElapsedMs: number
  analysisLongRunning: boolean
  analysisDeferredReason: 'recording' | 'server' | null
  debriefLoading: boolean
  debriefText: string | null
  debriefFailed: boolean
  debriefDiscordLinked: boolean
  updatedAt: number
}

let session: PostGameSessionSnapshot | null = null

function baseSession(overrides?: Partial<PostGameSessionSnapshot>): PostGameSessionSnapshot {
  return {
    phase: 'preparing',
    uploadProgress: 0,
    compressing: false,
    compressKind: null,
    preparingSyncMessage: null,
    ownerUserId: null,
    recordingId: null,
    archiveOnly: false,
    analysisReadiness: null,
    pendingAnalysisReady: false,
    pendingAnalysisMessage: null,
    pendingAnalysisState: null,
    matchDataStatus: null,
    killsInTimeline: 0,
    analysisResult: null,
    analysisError: null,
    analysisProgress: 0,
    analysisStep: null,
    analysisJobStatus: 'processing',
    analysisElapsedMs: 0,
    analysisLongRunning: false,
    analysisDeferredReason: null,
    debriefLoading: false,
    debriefText: null,
    debriefFailed: false,
    debriefDiscordLinked: false,
    updatedAt: Date.now(),
    ...overrides,
  }
}

export function resetPostGameSession(
  game: string,
  map: string | null,
  agent: string | null,
  ownerUserId: number | null = null,
  recordingId: string | null = null,
): void {
  session = baseSession({ game, map, agent, ownerUserId, recordingId, phase: 'preparing' })
}

export function clearPostGameSession(): void {
  session = null
}

export function getPostGameSessionSnapshot(): PostGameSessionSnapshot | null {
  return session ? { ...session } : null
}

/** Only route live worker events into the modal that owns this recording. */
export function isPostGameSessionForRecording(
  recordingId: string,
  ownerUserId?: number | null,
): boolean {
  return session?.recordingId === recordingId
    && (ownerUserId == null || session.ownerUserId === ownerUserId)
}

/** True once upload flow has left the initial preparing phase. */
export function isPostGamePastPreparing(phase: PostGameUiPhase | null | undefined): boolean {
  return (
    phase === 'uploading'
    || phase === 'analysing'
    || phase === 'ready'
    || phase === 'error'
    || phase === 'pending'
    || phase === 'archived'
    || phase === 'quota_required'
  )
}

function patch(patch: Partial<PostGameSessionSnapshot>): void {
  if (!session) session = baseSession()
  Object.assign(session, patch, { updatedAt: Date.now() })
}

export function applyPostGameChannelEvent(channel: string, payload: unknown): void {
  switch (channel) {
    case 'post-game:preparing': {
      const data = payload as { game: string; map: string | null; agent: string | null; calmSave?: boolean }
      // Late window-load "preparing" must not clobber a flow that already advanced
      // (prep-step / pending / upload). That race falsely tripped upload_failed safety nets.
      if (isPostGamePastPreparing(session?.phase)) {
        patch({
          game: data.game ?? session?.game,
          map: data.map ?? session?.map ?? null,
          agent: data.agent ?? session?.agent ?? null,
        })
        break
      }
      patch({
        phase: 'preparing',
        game: data.game,
        map: data.map,
        agent: data.agent,
        uploadProgress: 0,
        compressing: false,
        compressKind: null,
        preparingSyncMessage: data.calmSave === false
          ? null
          : 'Saving your match recording…',
      })
      break
    }
    case 'post-game:prep-step': {
      const data = (payload ?? {}) as {
        recordingId?: string
        game?: string
        map?: string | null
        agent?: string | null
      }
      patch({
        phase: 'uploading',
        recordingId: data.recordingId ?? session?.recordingId ?? null,
        game: data.game ?? session?.game,
        map: data.map ?? session?.map ?? null,
        agent: data.agent ?? session?.agent ?? null,
        uploadProgress: 0,
        compressing: false,
        compressKind: null,
        analysisResult: null,
        analysisError: null,
        analysisProgress: 0,
        analysisStep: null,
        analysisJobStatus: 'processing',
        analysisElapsedMs: 0,
        analysisLongRunning: false,
        analysisDeferredReason: null,
      })
      break
    }
    case 'post-game:compress-start': {
      const data = (payload ?? {}) as { sizeGB?: string }
      let compressKind: PostGameSessionSnapshot['compressKind'] = 'shrink'
      if (data.sizeGB === 'remux') compressKind = 'remux'
      else if (data.sizeGB === 'transcode') compressKind = 'transcode'
      patch({ phase: 'uploading', compressing: true, compressKind, uploadProgress: 0 })
      break
    }
    case 'post-game:compress-progress':
      patch({
        phase: 'uploading',
        uploadProgress: typeof payload === 'number' ? payload : session?.uploadProgress ?? 0,
        compressing: true,
      })
      break
    case 'post-game:upload-start': {
      const data = payload as {
        game: string
        map: string | null
        agent: string | null
        matchDetailsStatus?: string
        killsInTimeline?: number
        archiveOnly?: boolean
      }
      patch({
        phase: 'uploading',
        game: data.game,
        map: data.map,
        agent: data.agent,
        uploadProgress: 0,
        compressing: false,
        compressKind: null,
        archiveOnly: !!data.archiveOnly,
        matchDataStatus: data.matchDetailsStatus ?? session?.matchDataStatus ?? null,
        killsInTimeline: data.killsInTimeline ?? session?.killsInTimeline ?? 0,
        analysisResult: null,
        analysisError: null,
        analysisProgress: 0,
        analysisStep: null,
        analysisJobStatus: 'processing',
        analysisElapsedMs: 0,
        analysisLongRunning: false,
        analysisDeferredReason: null,
      })
      break
    }
    case 'post-game:upload-progress':
      patch({
        phase: 'uploading',
        uploadProgress: typeof payload === 'number' ? payload : session?.uploadProgress ?? 0,
        compressing: false,
      })
      break
    case 'post-game:upload-complete': {
      const data = (payload ?? {}) as { archiveOnly?: boolean }
      patch({
        phase: data.archiveOnly ? 'archived' : 'analysing',
        uploadProgress: 100,
        compressing: false,
        archiveOnly: !!data.archiveOnly,
        analysisProgress: 0,
        analysisStep: null,
        analysisJobStatus: 'processing',
        analysisElapsedMs: 0,
        analysisLongRunning: false,
        analysisDeferredReason: null,
      })
      break
    }
    case 'post-game:analysis-progress': {
      const data = (payload ?? {}) as {
        progress?: number
        current_step?: string | null
        status?: string
        elapsed_ms?: number
      }
      patch({
        phase: 'analysing',
        analysisProgress: typeof data.progress === 'number'
          ? Math.min(100, Math.max(0, Math.round(data.progress)))
          : session?.analysisProgress ?? 0,
        analysisStep: data.current_step ?? session?.analysisStep ?? null,
        analysisJobStatus: data.status ?? session?.analysisJobStatus ?? 'processing',
        analysisElapsedMs: typeof data.elapsed_ms === 'number'
          ? Math.max(0, data.elapsed_ms)
          : session?.analysisElapsedMs ?? 0,
      })
      break
    }
    case 'post-game:analysis-long-running':
      patch({ analysisLongRunning: true })
      break
    case 'post-game:analysis-deferred': {
      const data = (payload ?? {}) as { reason?: 'recording' | 'server' }
      patch({
        analysisLongRunning: true,
        analysisDeferredReason: data.reason ?? 'server',
      })
      break
    }
    case 'post-game:upload-deferred': {
      const data = (payload ?? {}) as { reason?: 'recording' | 'server' }
      patch({
        analysisLongRunning: true,
        analysisDeferredReason: data.reason ?? 'recording',
      })
      break
    }
    case 'post-game:analysis-ready': {
      const data = (payload ?? {}) as Record<string, unknown> & { recording_id?: string | null }
      patch({
        phase: 'ready',
        uploadProgress: 100,
        compressing: false,
        recordingId: data.recording_id ?? session?.recordingId ?? null,
        analysisResult: data,
        analysisError: null,
        analysisProgress: 100,
        analysisLongRunning: false,
        analysisDeferredReason: null,
      })
      break
    }
    case 'post-game:pending': {
      const data = payload as {
        recordingId: string
        game: string
        map: string | null
        agent: string | null
        analysisReadiness?: { ready: boolean; state: string; message: string }
      }
      patch({
        phase: 'pending',
        recordingId: data.recordingId,
        game: data.game,
        map: data.map,
        agent: data.agent,
        analysisReadiness: data.analysisReadiness ?? null,
        pendingAnalysisReady: data.analysisReadiness?.ready ?? false,
        pendingAnalysisMessage: data.analysisReadiness?.message ?? null,
        pendingAnalysisState: data.analysisReadiness?.state ?? null,
      })
      break
    }
    case 'post-game:upload-error': {
      const data = (payload ?? {}) as AnalysisErrorPayload
      patch({
        // Upgrade/quota presentation is carried by the full error payload. The
        // renderer has one error phase for both ordinary and upgrade failures.
        phase: 'error',
        recordingId: data.recordingId ?? session?.recordingId ?? null,
        compressing: false,
        analysisError: data,
        analysisResult: null,
      })
      break
    }
    case 'post-game:analysis-readiness': {
      const readiness = payload as { ready: boolean; state: string; message: string }
      const inFlow = session?.phase === 'preparing' || session?.phase === 'uploading'
      patch({
        analysisReadiness: readiness,
        pendingAnalysisReady: readiness.ready,
        pendingAnalysisMessage: readiness.message,
        pendingAnalysisState: readiness.state,
        ...(inFlow ? { preparingSyncMessage: readiness.message } : {}),
        ...(session?.phase === 'pending'
          ? {
              pendingAnalysisReady: readiness.ready,
              pendingAnalysisMessage: readiness.message,
              pendingAnalysisState: readiness.state,
            }
          : {}),
      })
      break
    }
    case 'post-game:debrief-loading':
      patch({ debriefLoading: true, debriefFailed: false, debriefText: null })
      break
    case 'post-game:debrief': {
      const data = payload as {
        debrief?: string
        discordLinked?: boolean
      } | null
      if (data?.debrief) {
        patch({
          debriefText: data.debrief,
          debriefLoading: false,
          debriefFailed: false,
          debriefDiscordLinked: data.discordLinked ?? false,
        })
      } else {
        patch({
          debriefLoading: false,
          debriefFailed: true,
          debriefText: null,
        })
      }
      break
    }
    default:
      break
  }
}

/** Record state and deliver to the post-game window when its renderer is ready. */
export function sendPostGameEvent(
  win: BrowserWindow | null | undefined,
  channel: string,
  payload?: unknown,
): void {
  if (channel.startsWith('post-game:')) {
    applyPostGameChannelEvent(channel, payload)
  }
  if (!win || win.isDestroyed()) return
  whenWebContentsReady(win, () => {
    try {
      win.webContents.send(channel, payload)
    } catch {
      /* window destroyed between ready check and send */
    }
  })
}

/**
 * Record and deliver an event only when the live modal owns this recording.
 * Background jobs must not mutate the single buffered modal session.
 */
export function sendPostGameEventForRecording(
  win: BrowserWindow | null | undefined,
  recordingId: string,
  channel: string,
  payload?: unknown,
  ownerUserId?: number | null,
): boolean {
  if (!isPostGameSessionForRecording(recordingId, ownerUserId)) return false
  sendPostGameEvent(win, channel, payload)
  return true
}
