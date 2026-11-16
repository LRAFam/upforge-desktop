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

/** Waits between start attempts while the match is still live (DA-05: one failed start lost the match). */
export const RECORDING_START_RETRY_DELAYS_MS = [10_000, 30_000] as const

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done, { once: true })
  })
}

/**
 * Retry a failed recording start during the match. Stops retrying when the match ends
 * (`signal` aborts / `isCancelled`), when the error is not retryable, or after the last delay;
 * then the last error is thrown as before.
 */
export async function startRecordingWithRetry(options: {
  attempt: () => Promise<void>
  isRetryable: (message: string) => boolean
  isCancelled: () => boolean
  signal?: AbortSignal
  delaysMs?: readonly number[]
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  onRetry?: (attemptNumber: number, delayMs: number, message: string) => void
}): Promise<void> {
  const delays = options.delaysMs ?? RECORDING_START_RETRY_DELAYS_MS
  const sleep = options.sleep ?? abortableSleep
  for (let i = 0; ; i++) {
    try {
      await options.attempt()
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const delay = delays[i]
      if (delay === undefined || options.isCancelled() || options.signal?.aborted || !options.isRetryable(message)) throw err
      options.onRetry?.(i + 2, delay, message)
      await sleep(delay, options.signal)
      if (options.isCancelled() || options.signal?.aborted) throw err
    }
  }
}
