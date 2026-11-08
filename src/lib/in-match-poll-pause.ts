/**
 * Renderer side of the in-match poll pause: skip non-essential refresh timers (stats, squad)
 * while UpForge is recording a match. No catch-up — views reload on 'dashboard:refresh' after
 * the match, and a stale closure from an unmounted view must never run.
 */

import { PollPauseController } from './poll-pause'

let recording = false
let subscribed = false

export const rendererPollPause = new PollPauseController(() => recording)

/** Test / event hook — mirrors 'recording:status-changed'. */
export function setRendererRecording(on: boolean): void {
  recording = on
}

function ensureSubscribed(): void {
  if (subscribed || typeof window === 'undefined') return
  const api = (window as { api?: Window['api'] }).api
  if (!api?.on) return
  subscribed = true
  api.on('recording:status-changed', (...args: unknown[]) => {
    const data = args[0] as { recording?: boolean } | undefined
    setRendererRecording(data?.recording === true)
  })
  void api.app?.getStatus?.().then((s: { recording?: boolean }) => { if (s?.recording) setRendererRecording(true) }).catch(() => {})
}

/** Wrap a renderer poll so it does nothing while a match is being recorded. */
export function inMatchPollGuard(name: string, tick: () => void): () => void {
  ensureSubscribed()
  return rendererPollPause.guard(name, tick, { catchUp: false })
}
