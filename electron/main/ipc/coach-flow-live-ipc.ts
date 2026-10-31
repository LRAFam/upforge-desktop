/**
 * Production after-match coach flow wiring (not the dev demo): allowances, key-moment results,
 * and the background run started when a Valorant match finishes processing.
 */
import { app, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import log from 'electron-log'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { AuthManager } from '../auth-manager'
import { cutWithFfmpeg } from '../coach-flow-demo'
import { runLiveCoachFlow, type LiveUpdate } from '../coach-flow-live'

const MATCH_ID = /^[A-Za-z0-9_-]{6,80}$/
const running = new Set<string>()

function ffmpegPath(): string {
  const win = process.platform === 'win32'
  if (is.dev) return win ? 'ffmpeg.exe' : 'ffmpeg'
  return join(process.resourcesPath, 'ffmpeg', win ? 'ffmpeg.exe' : 'ffmpeg')
}

export function setupCoachFlowLiveHandlers(ipcMain: IpcMain, auth: AuthManager, isTrusted: (event: IpcMainInvokeEvent) => boolean): void {
  ipcMain.handle('coach:allowances', async (event) => {
    if (!isTrusted(event) || !auth.isAuthenticated()) return null
    const r = await auth.getApi().get('/api/coach/allowances', { validateStatus: () => true }).catch(() => null)
    return r?.status === 200 && r.data?.success ? r.data : null
  })
  ipcMain.handle('coach-flow:moments', async (event, matchId: unknown) => {
    if (!isTrusted(event) || !auth.isAuthenticated()) return null
    if (typeof matchId !== 'string' || !MATCH_ID.test(matchId)) return null
    const r = await auth.getApi().get(`/api/coach-flow/${matchId}/moments`, { validateStatus: () => true }).catch(() => null)
    return r?.status === 200 && r.data?.success ? { moments: r.data.moments ?? [], allowance: r.data.allowance ?? null } : null
  })
}

/**
 * Start the key-moment flow for a finished Valorant match, in the background. One run per match.
 * Never throws; every outcome is sent to the windows as `coach-flow:update`.
 */
export function startLiveCoachFlow(opts: {
  auth: AuthManager
  matchId: string | null | undefined
  videoPath: string | null | undefined
  matchData: Record<string, unknown> | undefined
  send: (update: LiveUpdate) => void
}): void {
  const { auth, matchId, videoPath, matchData } = opts
  if (!matchId || !MATCH_ID.test(matchId) || !videoPath || !matchData || !auth.isAuthenticated()) return
  if (running.has(matchId)) return
  running.add(matchId)
  const api = () => auth.getApi()
  void runLiveCoachFlow({
    get: url => api().get(url, { validateStatus: () => true, timeout: 20_000 }).then(r => ({ status: r.status, data: r.data })),
    postJson: (url, body) => api().post(url, body, { validateStatus: () => true, timeout: 40_000 }).then(r => ({ status: r.status, data: r.data })),
    postForm: (url, form) => api().post(url, form, { validateStatus: () => true, timeout: 180_000, maxBodyLength: 64 * 1024 * 1024 }).then(r => ({ status: r.status, data: r.data })),
    cut: cutWithFfmpeg(ffmpegPath()),
    readFile: p => readFile(p),
    makeTempDir: () => mkdtemp(join(app.getPath('temp'), 'upforge-coach-')),
    removeDir: d => rm(d, { recursive: true, force: true }),
    emit: u => { try { opts.send(u) } catch { /* window closed */ } },
    sleep: ms => new Promise(r => setTimeout(r, ms)),
  }, { matchId, videoPath, matchData })
    .then(u => log.info(`[CoachFlow] ${u.state}${u.reason ? ` (${u.reason})` : ''}: ${u.found} found`))
    .catch(() => log.warn('[CoachFlow] run failed'))
    .finally(() => running.delete(matchId))
}
