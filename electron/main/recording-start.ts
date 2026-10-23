import { withTimeout } from './promise-timeout'

/** Bound readiness plus recording startup as one operation. */
export async function startRecordingWhenReady(options: {
  ensureReady: () => Promise<void>
  start: () => Promise<void>
  timeoutMs: number
}): Promise<void> {
  let expired = false
  await withTimeout(
    (async () => {
      await options.ensureReady()
      // A timeout abandons the promise; it cannot cancel OBS readiness itself.
      // Do not let its late completion start an untracked recording.
      if (expired) return
      await options.start()
    })(),
    options.timeoutMs,
    'OBS start timed out — OBS may be frozen. Restart OBS from Settings → Recording.',
    () => { expired = true },
  )
}
