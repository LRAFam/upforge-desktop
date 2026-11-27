/**
 * `recordings:list-all` is called by several views at once and again on every `recordings:updated`
 * push. Each call used to re-scan the recordings folder synchronously, which stalled the main
 * process after matches ([MainLag] main stall + list-all reload bursts). This loader:
 *  - shares one in-flight build between concurrent callers with the same key,
 *  - reuses the last result while the store revision is unchanged (for at most `ttlMs`),
 *  - throttles the forced orphan-folder rescan to once per `rescanIntervalMs`.
 * The call-rate diagnostic still counts every IPC call, so bursts keep showing in main.log.
 */
export interface ListAllLoaderOptions<T> {
  /** Builds the list. `rescan` is true when the orphan-folder rescan is due. */
  build: (key: string, rescan: boolean) => Promise<T>
  /** Changes whenever the recordings catalogue changes (new, edited or deleted recordings). */
  revision: () => number | string
  ttlMs?: number
  rescanIntervalMs?: number
  now?: () => number
}

export interface ListAllLoader<T> {
  get: (key: string) => Promise<T>
  /** Drop cached lists (e.g. account switch); the next call rebuilds. */
  invalidate: () => void
}

export function createListAllLoader<T>(opts: ListAllLoaderOptions<T>): ListAllLoader<T> {
  const ttlMs = opts.ttlMs ?? 2_000
  const rescanIntervalMs = opts.rescanIntervalMs ?? 15_000
  const now = opts.now ?? (() => Date.now())
  const inFlight = new Map<string, Promise<T>>()
  const cache = new Map<string, { revision: number | string; at: number; value: T }>()
  let lastRescanAt = Number.NEGATIVE_INFINITY
  let generation = 0

  function get(key: string): Promise<T> {
    const running = inFlight.get(key)
    if (running) return running
    const hit = cache.get(key)
    const t = now()
    if (hit && hit.revision === opts.revision() && t - hit.at < ttlMs) return Promise.resolve(hit.value)

    const rescan = t - lastRescanAt >= rescanIntervalMs
    if (rescan) lastRescanAt = t
    const gen = generation
    // Revision read before the build: a change that lands mid-build makes the next call rebuild.
    const revision = opts.revision()
    const p: Promise<T> = opts.build(key, rescan).then((value) => {
      if (gen === generation) cache.set(key, { revision, at: now(), value })
      return value
    }).finally(() => {
      if (inFlight.get(key) === p) inFlight.delete(key)
    })
    inFlight.set(key, p)
    return p
  }

  return {
    get,
    invalidate() { generation++; cache.clear(); inFlight.clear() },
  }
}

let changeCount = 0
/** Bumped by every `recordings:updated` request (before coalescing), so cached lists never outlive a change. */
export function markRecordingsChanged(): void { changeCount++ }
export function recordingsChangeCount(): number { return changeCount }
