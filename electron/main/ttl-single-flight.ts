/**
 * Share one async fetch between callers: results are reused for `ttlMs`, and
 * callers that arrive while a fetch is running join it instead of starting another.
 * Used to stop several in-match loops hitting the same local game API endpoint.
 */
export interface TtlSingleFlight<T> {
  get(): Promise<T>
  /** Drop the cached value; the next get() starts a fresh fetch. */
  invalidate(): void
}

export function createTtlSingleFlight<T>(
  fetcher: () => Promise<T>,
  ttlMs: number,
  now: () => number = Date.now,
): TtlSingleFlight<T> {
  let cached: { value: T; at: number } | null = null
  let inFlight: Promise<T> | null = null
  let generation = 0

  return {
    get(): Promise<T> {
      if (cached && now() - cached.at < ttlMs) return Promise.resolve(cached.value)
      if (inFlight) return inFlight
      const gen = generation
      const run: Promise<T> = fetcher().then(
        (value) => {
          if (gen === generation) {
            cached = { value, at: now() }
            inFlight = null
          }
          return value
        },
        (err: unknown) => {
          if (gen === generation) inFlight = null
          throw err
        },
      )
      inFlight = run
      return run
    },
    invalidate(): void {
      generation++
      cached = null
      inFlight = null
    },
  }
}
