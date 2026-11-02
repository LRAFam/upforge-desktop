/**
 * Background VOD probe sweep for the recordings list.
 *
 * `recordings:get` used to start a fresh probe loop over every row on every call, and each loop sent
 * `recordings:updated` when a row changed. The renderer reloads the list on that event, which started
 * another loop: after a match (probe cache cold, post-game "pending" listening) this fed back into a
 * storm of list reloads that froze the app for minutes. One sweep runs at a time here; calls made while
 * it runs only queue one follow-up sweep, and change notifications go through a coalesced sender.
 */
export interface VodProbeSweepDeps<R> {
  /** Readiness label for a row; a change after probing means the renderer should refresh. */
  readiness: (row: R) => string
  probe: (row: R) => Promise<void>
  notify: () => void
}

export interface VodProbeSweep<R> {
  /** Probe these rows in the background. Returns at once. */
  request: (rows: R[]) => void
  /** True while a sweep is running (tests and diagnostics). */
  readonly running: boolean
}

export function createVodProbeSweep<R>(deps: VodProbeSweepDeps<R>): VodProbeSweep<R> {
  let running = false
  let queued: R[] | null = null

  const run = async (rows: R[]): Promise<void> => {
    running = true
    try {
      let next: R[] | null = rows
      while (next) {
        queued = null
        for (const row of next) {
          const before = deps.readiness(row)
          try {
            await deps.probe(row)
          } catch { /* a failed probe is cached as unreadable by the probe itself */ }
          // Publish each change; one slow old VOD must not hold every row at "finalizing".
          if (deps.readiness(row) !== before) deps.notify()
        }
        next = queued
      }
    } finally {
      running = false
      queued = null
    }
  }

  return {
    request(rows: R[]) {
      if (!rows.length) return
      if (running) {
        queued = rows // latest list wins; rows already probed hit the cache
        return
      }
      void run(rows)
    },
    get running() { return running },
  }
}

/**
 * Trailing coalescer: many calls inside `waitMs` become one `send`. The first call schedules the send,
 * so a single event is delayed by at most `waitMs`.
 */
export function createCoalescedNotifier(send: () => void, waitMs = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return () => {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      send()
    }, waitMs)
  }
}
