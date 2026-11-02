/**
 * Run an async reload at most once at a time. Calls made while it runs collapse into one more run
 * afterwards, so the latest data still lands but a burst of events cannot stack parallel reloads
 * (the post-match `recordings:updated` burst stacked dozens of full recordings-list fetches).
 */
export function singleFlight(fn: () => Promise<void>): () => Promise<void> {
  let current: Promise<void> | null = null
  let again = false
  const start = (): Promise<void> => {
    current = (async () => {
      try {
        do {
          again = false
          await fn().catch(() => {})
        } while (again)
      } finally {
        current = null
      }
    })()
    return current
  }
  return () => {
    if (current) {
      again = true
      return current
    }
    return start()
  }
}
