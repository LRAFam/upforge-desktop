/**
 * Logs when the main process event loop stalls. A stalled main process freezes every window
 * (no clicks, no IPC replies), and the log otherwise just goes quiet, so a stall looks like
 * "nothing happened". Grep main.log for `[MainLag]`.
 */
export interface LagMonitorOptions {
  intervalMs?: number
  /** Log when a tick lands this much later than scheduled. */
  warnMs?: number
  now?: () => number
}

export function startMainLoopLagMonitor(
  warn: (message: string, lagMs: number) => void,
  opts: LagMonitorOptions = {},
): () => void {
  const intervalMs = opts.intervalMs ?? 1000
  const warnMs = opts.warnMs ?? 1000
  const now = opts.now ?? (() => Date.now())
  let expected = now() + intervalMs
  const timer = setInterval(() => {
    const t = now()
    const lag = t - expected
    expected = t + intervalMs
    if (lag >= warnMs) warn(`[MainLag] main process was blocked for ~${Math.round(lag)} ms`, Math.round(lag))
  }, intervalMs)
  timer.unref?.()
  return () => clearInterval(timer)
}

/** Counts calls and logs a summary when a window of `windowMs` saw at least `threshold` calls. */
export function createCallRateLogger(
  label: string,
  warn: (message: string, burst: { callCount: number; windowS: number }) => void,
  opts: { windowMs?: number; threshold?: number; now?: () => number } = {},
): () => void {
  const windowMs = opts.windowMs ?? 60_000
  const threshold = opts.threshold ?? 30
  const now = opts.now ?? (() => Date.now())
  let windowStart = now()
  let count = 0
  return () => {
    const t = now()
    if (t - windowStart >= windowMs) {
      if (count >= threshold) {
        const windowS = Math.round((t - windowStart) / 1000)
        warn(`[MainLag] ${label} called ${count} times in ${windowS} s`, { callCount: count, windowS })
      }
      windowStart = t
      count = 0
    }
    count++
  }
}
