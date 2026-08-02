const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_INTERVAL_MS = 250

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Poll OBS outputActive until armed or timeout. */
export async function waitForObsRecordArmed(opts: {
  getOutputActive: () => Promise<boolean>
  timeoutMs?: number
  intervalMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}): Promise<{ armed: true } | { armed: false; timedOut: true }> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? defaultSleep

  const deadline = now() + timeoutMs

  while (now() < deadline) {
    if (await opts.getOutputActive()) {
      return { armed: true }
    }
    const remaining = deadline - now()
    if (remaining <= 0) break
    await sleep(Math.min(intervalMs, remaining))
  }

  return { armed: false, timedOut: true }
}
