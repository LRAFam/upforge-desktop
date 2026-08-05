const DEFAULT_TIMEOUT_MS = 5000
const MIN_TIMEOUT_MS = 1000
const MAX_TIMEOUT_MS = 15_000
const DEFAULT_INTERVAL_MS = 250

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Resolve StartRecord arm timeout — env overrides settings, clamped 1–15s. */
export function resolveObsRecordVerifyMs(opts?: {
  envValue?: string | undefined
  settingsMs?: number | undefined
}): number {
  const envRaw = opts?.envValue ?? process.env.UPFORGE_OBS_RECORD_VERIFY_MS
  let ms = DEFAULT_TIMEOUT_MS
  if (envRaw?.trim()) {
    const parsed = Number.parseInt(envRaw.trim(), 10)
    if (Number.isFinite(parsed)) ms = parsed
  } else if (typeof opts?.settingsMs === 'number' && Number.isFinite(opts.settingsMs)) {
    ms = opts.settingsMs
  }
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, ms))
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
