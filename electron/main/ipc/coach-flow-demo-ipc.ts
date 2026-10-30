/**
 * Dev-only IPC for "Replay a real match" (see coach-flow-demo.ts). Not registered in packaged builds.
 * Reads the player's own analyses from production (read-only) and talks to a LOCAL AI service.
 */
import { app, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AuthManager } from '../auth-manager'
import { CoachFlowCachedReplay, CoachFlowDemoRun, readCachedRun, RUN_BUDGET_USD, type FlowEvent } from '../coach-flow-demo'
import { resolveCloudFirstPlaybackUrl } from '../recording-playback'

const AI_URL = (process.env['COACH_FLOW_AI_URL'] || 'http://127.0.0.1:8011').replace(/\/$/, '')

export function setupCoachFlowDemoHandlers(ipcMain: IpcMain, auth: AuthManager, isTrusted: (event: IpcMainInvokeEvent) => boolean): void {
  let current: CoachFlowDemoRun | CoachFlowCachedReplay | null = null
  // Dev cache: clips, stills and the event log per match, so design iterations replay at $0.
  const cacheDir = join(app.getPath('userData'), 'coach-flow-cache')
  const hasCache = (id: number) => existsSync(join(cacheDir, String(id), 'events.json'))

  ipcMain.handle('coach-flow-demo:info', () => ({ aiUrl: AI_URL, budgetUsd: RUN_BUDGET_USD }))

  ipcMain.handle('coach-flow-demo:list', async () => {
    const rows = await auth.fetchAnalyses(12, 'valorant')
    return rows.map(a => ({
      id: a.id, map: a.map ?? null, agent: a.agent ?? null, created_at: a.created_at ?? null,
      rounds_won: a.rounds_won ?? null, rounds_lost: a.rounds_lost ?? null, status: a.status ?? null,
      cached: hasCache(a.id),
    }))
  })

  ipcMain.handle('coach-flow-demo:run', async (event, analysisId: unknown, opts: unknown) => {
    if (!isTrusted(event)) return { ok: false, error: 'Not allowed' }
    const id = Number(analysisId)
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Invalid match' }
    if (!auth.getToken()) return { ok: false, error: 'Sign in first' }
    await current?.dispose()
    const sender = event.sender
    const emit = (e: FlowEvent) => { if (!sender.isDestroyed()) sender.send('coach-flow-demo:event', e) }
    if ((opts as { cached?: unknown } | null)?.cached === true) {
      const cached = await readCachedRun(cacheDir, id)
      if (!cached) return { ok: false, error: 'No cached run for this match yet' }
      const saved = new CoachFlowCachedReplay(cached, emit)
      current = saved
      if ((opts as { instant?: unknown }).instant === true) saved.showFinished()
      else void saved.run()
      return { ok: true, cached: true }
    }
    current = new CoachFlowDemoRun({
      api: auth.getApi(),
      playbackUrl: async (a) => (await resolveCloudFirstPlaybackUrl({
        auth,
        jobId: typeof a.job_id === 'string' ? a.job_id : null,
        analysisId: id,
        archiveId: typeof a.archive_id === 'string' ? a.archive_id : null,
        inlineRecordingUrl: a.recording_url,
      })).url,
      aiUrl: AI_URL,
      aiKey: process.env['COACH_FLOW_AI_KEY'] || null,
      ffmpeg: process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
      emit,
      cacheDir,
      habits: async () => (await auth.fetchRecurringInsights(5))
        ?.filter(h => h.text)
        .map(h => (h.occurrences > 1 ? `${h.text} (flagged in ${h.occurrences} matches)` : h.text)) ?? null,
    })
    void current.run(id)
    return { ok: true }
  })

  ipcMain.handle('coach-flow-demo:review-round', async (event) => {
    if (!isTrusted(event)) return { ok: false, error: 'Not allowed' }
    if (!current) return { ok: false, error: 'Replay a match first' }
    void current.reviewRound()
    return { ok: true }
  })

  ipcMain.handle('coach-flow-demo:clip', async (event, key: unknown) => {
    if (!isTrusted(event) || !current || typeof key !== 'string' || !/^[\w-]{1,80}$/.test(key)) return null
    return current.clipBytes(key)
  })
}
