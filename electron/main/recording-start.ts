import { withTimeout } from './promise-timeout'

/** Bound readiness plus recording startup as one operation. */
export async function startRecordingWhenReady(options: {
  ensureReady: () => Promise<void>
  start: (signal: AbortSignal) => Promise<void>
  timeoutMs: number
  signal?: AbortSignal
}): Promise<void> {
  const controller = new AbortController()
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
  let rejectCancelled!: () => void
  const cancelled = new Promise<never>((_resolve, reject) => {
    rejectCancelled = () => reject(new Error('OBS recording startup cancelled.'))
    signal.addEventListener('abort', rejectCancelled, { once: true })
  })
  try {
    await withTimeout(Promise.race([
      (async () => {
        if (signal.aborted) throw new Error('OBS recording startup cancelled.')
        await options.ensureReady()
        // Readiness cannot be cancelled, but its late result cannot start capture.
        if (signal.aborted) return
        await options.start(signal)
      })(),
      cancelled,
    ]),
      options.timeoutMs,
      'OBS start timed out — OBS may be frozen. Restart OBS from Settings → Recording.',
      () => { controller.abort() },
    )
  } finally {
    signal.removeEventListener('abort', rejectCancelled)
  }
}
