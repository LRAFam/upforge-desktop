import { app, BrowserWindow, shell } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import log from 'electron-log'
import type { AuthManager } from './auth-manager'
import { getFrontendBaseUrl } from './api-base'
import { showAppNotification } from './app-notifications'

const POLL_INTERVAL_MS = 60 * 1000
const COACH_NOTIFICATION_TYPES = new Set(['review_completed', 'review_requested', 'review_in_progress'])

export interface ApiNotification {
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

export type CoachNotificationTarget =
  | { kind: 'browser-reviews'; reviewId?: number }
  | { kind: 'vod-review'; analysisId: number; coachNotes: boolean; needsSeek: boolean }
  | { kind: 'my-coaches' }

const MAX_SHOWN_IDS = 500

/** Unread coach-type notifications that have not been surfaced yet. */
export function selectNewCoachNotifications(
  notifications: ApiNotification[],
  shownIds: ReadonlySet<number>,
): ApiNotification[] {
  return notifications.filter(
    n => !n.read && !shownIds.has(n.id) && COACH_NOTIFICATION_TYPES.has(n.type),
  )
}

/** Where a click on a surfaced coach notification should take the user. */
export function coachNotificationTarget(notification: ApiNotification): CoachNotificationTarget {
  const analysisId = notification.data?.analysis_id
  if (notification.type === 'review_requested') {
    return { kind: 'browser-reviews', reviewId: notification.data?.review_id }
  }
  if (analysisId) {
    const isCompleted = notification.type === 'review_completed'
    if (isCompleted || notification.type === 'review_in_progress') {
      return { kind: 'vod-review', analysisId, coachNotes: isCompleted, needsSeek: isCompleted }
    }
    return { kind: 'vod-review', analysisId, coachNotes: false, needsSeek: false }
  }
  return { kind: 'my-coaches' }
}

/** Parse the persisted shown-id list, keeping only finite integers. */
export function parseShownIds(raw: string): Set<number> {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((v): v is number => typeof v === 'number' && Number.isInteger(v)))
  } catch {
    return new Set()
  }
}

/** Keep the most recent ids (insertion order) for persistence. */
export function trimShownIds(ids: Set<number>, max = MAX_SHOWN_IDS): number[] {
  return [...ids].slice(-max)
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let polling = false

function statePath(): string {
  return join(app.getPath('userData'), 'coach-notifications-shown.json')
}

function loadShownIds(): Set<number> {
  try {
    return parseShownIds(readFileSync(statePath(), 'utf8'))
  } catch {
    return new Set()
  }
}

function saveShownIds(ids: Set<number>): void {
  try {
    writeFileSync(statePath(), JSON.stringify(trimShownIds(ids)))
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

    for (const notification of selectNewCoachNotifications(notifications, shown)) {
      shown.add(notification.id)
      changed = true

      const analysisId = notification.data?.analysis_id
      const onClick = () => {
        void markNotificationRead(deps.authManager, notification.id)
        const target = coachNotificationTarget(notification)
        if (target.kind === 'browser-reviews') {
          openCoachReviewsInBrowser(target.reviewId)
          return
        }
        if (target.kind === 'vod-review') {
          if (!target.needsSeek && !target.coachNotes) {
            openVodReviewForAnalysis(deps.getMainWindow(), target.analysisId)
            return
          }
          void (async () => {
            let seekMs: number | undefined
            if (target.needsSeek) {
              try {
                const res = await deps.authManager.getApi().get(`/api/analyses/${target.analysisId}/coach-review`)
                const review = res.data?.review ?? res.data
                const first = (review?.annotations as Array<{ video_offset_ms?: number | null }> | undefined)
                  ?.find(a => a.video_offset_ms != null && !Number.isNaN(a.video_offset_ms))
                if (first?.video_offset_ms != null) seekMs = first.video_offset_ms
              } catch {
                // Fall back to coachNotes-only deep link.
              }
            }
            openVodReviewForAnalysis(deps.getMainWindow(), target.analysisId, {
              coachNotes: target.coachNotes,
              seekMs,
            })
          })()
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
