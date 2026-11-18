/**
 * Poll a CS2 / Deadlock demo job until the API finishes it.
 *
 * The API's ProcessCS2Demo / ProcessDeadlock jobs run up to 3 tries of 10 minutes each with 30 s and 90 s
 * backoff (~32 min) plus queue wait, so the desktop keeps checking for 40 minutes. Polls start 10 s apart
 * and back off to once a minute. When time runs out the job may still be running: callers say
 * "still analysing", never "failed".
 */
export const DEMO_POLL_MAX_MS = 40 * 60 * 1000
const FIRST_WAIT_MS = 10_000
const MAX_WAIT_MS = 60_000
/** One status request may take at most this long (or the time left), so a stalled one can't stall the loop. */
export const DEMO_POLL_REQUEST_MAX_MS = 45_000

/** Settle with poll()'s result, or reject after `ms` if it is still pending. */
function withinMs<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Status check took longer than ${ms} ms`)), ms)
  })
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer))
}

export type DemoPollResult =
  | { status: 'completed' }
  | { status: 'failed'; error: string | null }
  | { status: 'timeout' }

export async function pollDemoJob(opts: {
  poll: () => Promise<{ status: string; error?: string | null }>
  onPollError?: (err: unknown) => void
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  maxMs?: number
}): Promise<DemoPollResult> {
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const maxMs = opts.maxMs ?? DEMO_POLL_MAX_MS
  const start = now()
  let wait = FIRST_WAIT_MS

  while (now() - start < maxMs) {
    await sleep(wait)
    wait = Math.min(Math.round(wait * 1.5), MAX_WAIT_MS)
    try {
      const left = Math.max(1, maxMs - (now() - start))
      const { status, error } = await withinMs(opts.poll(), Math.min(DEMO_POLL_REQUEST_MAX_MS, left))
      if (status === 'completed') return { status: 'completed' }
      if (status === 'failed') return { status: 'failed', error: error ?? null }
    } catch (err) {
      opts.onPollError?.(err)
    }
  }
  return { status: 'timeout' }
}
