/**
 * quit-guard.ts
 * Decides whether quitting would interrupt a recording, remux or upload, and
 * runs the Quit / Cancel / Quit when finished flow from `before-quit`.
 * Pure apart from timers; the dialog lives in quit-dialog.ts.
 */

export interface QuitActivity {
  recording: boolean
  remuxing: boolean
  /** OBS has stopped but the match is still being saved (hash, timeline, clips) — not yet in the catalogue. */
  finalizing: boolean
  /** One entry per upload in progress; null when progress is unknown. */
  uploadPercents: Array<number | null>
}

export interface QuitActivitySources {
  recording: boolean
  finalizing?: boolean
  /** Post-game session: true while OBS output is being remuxed/compressed for upload. */
  session: { compressing: boolean; recordingId: string | null } | null
  recordings: Array<{ id: string; pipelineStatus?: string | null; uploadProgress?: number | null }>
  jobStages: string[]
}

/** Gather what quitting would interrupt. Server-side analysis is not included: it survives a quit. */
export function buildQuitActivity(src: QuitActivitySources): QuitActivity {
  const remuxing = Boolean(src.session?.compressing) || src.jobStages.includes('remux')
  const preparingId = src.session?.compressing ? src.session.recordingId : null
  const uploadPercents = src.recordings
    .filter((r) => r.pipelineStatus === 'uploading' && r.id !== preparingId)
    .map((r) => (typeof r.uploadProgress === 'number' ? r.uploadProgress : null))
  return { recording: src.recording, remuxing, finalizing: Boolean(src.finalizing), uploadPercents }
}

export type QuitDecision =
  | { action: 'quit' }
  | { action: 'confirm'; message: string; detail: string }

export type QuitChoice = 'quit' | 'cancel' | 'wait'

/** Button order shown by the dialog; index maps through choiceFromButton. */
export const QUIT_BUTTONS = ['Quit anyway', 'Cancel', 'Quit when finished'] as const
export const QUIT_CANCEL_INDEX = 1

export function choiceFromButton(index: number): QuitChoice {
  if (index === 0) return 'quit'
  if (index === 2) return 'wait'
  return 'cancel'
}

function uploadPhrase(percents: Array<number | null>): string | null {
  if (percents.length === 0) return null
  if (percents.length > 1) return `${percents.length} uploads in progress`
  const pct = percents[0]
  return typeof pct === 'number' && Number.isFinite(pct) ? `Upload ${Math.round(pct)}%` : 'An upload is in progress'
}

export function decideQuit(activity: QuitActivity): QuitDecision {
  const reasons: string[] = []
  const losses: string[] = []
  if (activity.recording) {
    reasons.push('A match is recording')
    losses.push('the recording stops now and the match may not be analysed')
  }
  if (activity.finalizing && !activity.recording) {
    reasons.push('A finished match is being saved')
    losses.push('the match may be left out of your recordings')
  }
  if (activity.remuxing) {
    reasons.push(reasons.length ? 'a recording is being prepared for upload' : 'A recording is being prepared for upload')
    losses.push('preparing the recording starts again next launch')
  }
  const upload = uploadPhrase(activity.uploadPercents)
  if (upload) {
    reasons.push(reasons.length ? upload.charAt(0).toLowerCase() + upload.slice(1) : upload)
    losses.push('the upload is paused until you open UpForge again')
  }
  if (reasons.length === 0) return { action: 'quit' }
  const joined = reasons.length === 1
    ? reasons[0]
    : `${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]}`
  return {
    action: 'confirm',
    message: `${joined} — quit anyway?`,
    detail: `If you quit now, ${losses.join('; ')}. "Quit when finished" closes UpForge once this work is done.`,
  }
}

export interface QuitGuardDeps {
  getActivity: () => QuitActivity
  ask: (decision: Extract<QuitDecision, { action: 'confirm' }>) => Promise<QuitChoice>
  /** Re-issue the quit (app.quit). */
  quit: () => void
  /** True when the quit must never be blocked (update install, already quitting). */
  bypass?: () => boolean
  pollMs?: number
  log?: (message: string) => void
}

export interface QuitGuard {
  /** Call first in `before-quit`. Returns true when the quit was blocked. */
  handleBeforeQuit: (event: { preventDefault: () => void }) => boolean
  isAsking: () => boolean
  isWaiting: () => boolean
  /**
   * For quits that bypass before-quit (update install destroys windows and starts the
   * installer first): ask up front, run `proceed` on Quit / when finished, never on Cancel.
   */
  confirmThen: (proceed: () => void) => void
}

export function createQuitGuard(deps: QuitGuardDeps): QuitGuard {
  const pollMs = deps.pollMs ?? 2000
  let approved = false
  let asking = false
  let waitTimer: ReturnType<typeof setInterval> | null = null

  const stopWaiting = (): void => {
    if (waitTimer) clearInterval(waitTimer)
    waitTimer = null
  }
  const approveAndQuit = (): void => {
    stopWaiting()
    approved = true
    deps.quit()
  }

  return {
    handleBeforeQuit(event) {
      if (approved || deps.bypass?.()) return false
      if (asking) {
        event.preventDefault()
        return true
      }
      const decision = decideQuit(deps.getActivity())
      if (decision.action === 'quit') return false
      event.preventDefault()
      asking = true
      void deps.ask(decision)
        .catch(() => 'cancel' as QuitChoice)
        .then((choice) => {
          asking = false
          deps.log?.(`[QuitGuard] ${decision.message} → ${choice}`)
          if (choice === 'quit') return approveAndQuit()
          stopWaiting()
          if (choice !== 'wait') return
          waitTimer = setInterval(() => {
            if (decideQuit(deps.getActivity()).action === 'quit') approveAndQuit()
          }, pollMs)
        })
      return true
    },
    isAsking: () => asking,
    isWaiting: () => waitTimer !== null,
    confirmThen(proceed) {
      if (asking) return
      const decision = decideQuit(deps.getActivity())
      if (decision.action === 'quit') return proceed()
      asking = true
      void deps.ask(decision)
        .catch(() => 'cancel' as QuitChoice)
        .then((choice) => {
          asking = false
          deps.log?.(`[QuitGuard] (update) ${decision.message} → ${choice}`)
          stopWaiting()
          if (choice === 'quit') return proceed()
          if (choice !== 'wait') return
          waitTimer = setInterval(() => {
            if (decideQuit(deps.getActivity()).action === 'quit') { stopWaiting(); proceed() }
          }, pollMs)
        })
    },
  }
}
