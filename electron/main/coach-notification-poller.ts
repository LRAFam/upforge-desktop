import { app, BrowserWindow, shell } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import log from 'electron-log'
import type { AuthManager } from './auth-manager'
import { getFrontendBaseUrl } from './api-base'
import { showAppNotification } from './app-notifications'

const POLL_INTERVAL_MS = 60 * 1000
const COACH_NOTIFICATION_TYPES = new Set(['review_completed', 'review_requested', 'review_in_progress'])

interface ApiNotification {
  id: number
  type: string
  title: string
  message: string
  read: boolean
  data?: {
    analysis_id?: number
    review_id?: number
    source?: string
  }
}

interface PollerDeps {
  authManager: AuthManager
  getMainWindow: () => BrowserWindow | null
  notifySilent: () => boolean
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let polling = false

function statePath(): string {
  return join(app.getPath('userData'), 'coach-notifications-shown.json')
}

function loadShownIds(): Set<number> {
  try {
    const raw = readFileSync(statePath(), 'utf8')
    const parsed = JSON.parse(raw) as number[]
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function saveShownIds(ids: Set<number>): void {
  try {
    const trimmed = [...ids].slice(-500)
    writeFileSync(statePath(), JSON.stringify(trimmed))
  } catch (err) {
    log.warn('[CoachNotify] Failed to persist shown notification ids:', err)
  }
}

function openVodReviewForAnalysis(
  mainWindow: BrowserWindow | null,
  analysisId: number,
  opts?: { coachNotes?: boolean; seekMs?: number },
): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.show()
  mainWindow.focus()
  const query: Record<string, string> = { timelineId: String(analysisId) }
  if (opts?.coachNotes) query.coachNotes = '1'
  if (opts?.seekMs != null && !Number.isNaN(opts.seekMs) && opts.seekMs >= 0) {
    query.seekMs = String(Math.round(opts.seekMs))
  }
  mainWindow.webContents.send('app:navigate', {
    path: '/vod-review',
    query,
  })
}

function openCoachReviewsInBrowser(reviewId?: number): void {
  const base = `${getFrontendBaseUrl()}/coach-dashboard/reviews/feed`
  const url = reviewId ? `${base}?review=${reviewId}` : base
  void shell.openExternal(url)
}

async function markNotificationRead(authManager: AuthManager, id: number): Promise<void> {
  try {
    await authManager.getApi().post(`/api/notifications/${id}/mark-as-read`)
  } catch {
    // Non-fatal — desktop already surfaced the alert.
  }
}

async function pollOnce(deps: PollerDeps): Promise<void> {
  if (polling || !deps.authManager.isAuthenticated()) return
  polling = true
  try {
    const res = await deps.authManager.getApi().get('/api/notifications')
    const notifications = (res.data?.data?.notifications ?? []) as ApiNotification[]
    const shown = loadShownIds()
    let changed = false

    for (const notification of notifications) {
      if (notification.read || shown.has(notification.id)) continue
      if (!COACH_NOTIFICATION_TYPES.has(notification.type)) continue

      shown.add(notification.id)
      changed = true

      const analysisId = notification.data?.analysis_id
      const reviewId = notification.data?.review_id
      const isCoachRequest = notification.type === 'review_requested'
      const isReviewInProgress = notification.type === 'review_in_progress'
      const onClick = () => {
        void markNotificationRead(deps.authManager, notification.id)
        if (isCoachRequest) {
          openCoachReviewsInBrowser(reviewId)
          return
        }
        if (isReviewInProgress || notification.type === 'review_completed') {
          if (analysisId) {
            void (async () => {
              let seekMs: number | undefined
              if (notification.type === 'review_completed') {
                try {
                  const res = await deps.authManager.getApi().get(`/api/analyses/${analysisId}/coach-review`)
                  const review = res.data?.review ?? res.data
                  const first = (review?.annotations as Array<{ video_offset_ms?: number | null }> | undefined)
                    ?.find(a => a.video_offset_ms != null && !Number.isNaN(a.video_offset_ms))
                  if (first?.video_offset_ms != null) seekMs = first.video_offset_ms
                } catch {
                  // Fall back to coachNotes-only deep link.
                }
              }
              openVodReviewForAnalysis(deps.getMainWindow(), analysisId, {
                coachNotes: notification.type === 'review_completed',
                seekMs,
              })
            })()
            return
          }
        }
        if (analysisId) {
          openVodReviewForAnalysis(deps.getMainWindow(), analysisId)
          return
        }
        void shell.openExternal(`${getFrontendBaseUrl()}/my-coaches`)
      }

      showAppNotification({
        title: notification.title,
        body: notification.message,
        silent: deps.notifySilent(),
        onClick,
      })

      log.info('[CoachNotify] Surfaced notification', {
        id: notification.id,
        type: notification.type,
        analysisId,
      })
    }

    if (changed) saveShownIds(shown)
  } catch (err) {
    log.debug('[CoachNotify] Poll skipped:', err instanceof Error ? err.message : err)
  } finally {
    polling = false
  }
}

export function startCoachNotificationPoller(deps: PollerDeps): void {
  stopCoachNotificationPoller()
  if (!deps.authManager.isAuthenticated()) return

  void pollOnce(deps)
  pollTimer = setInterval(() => {
    void pollOnce(deps)
  }, POLL_INTERVAL_MS)
}

export function stopCoachNotificationPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
