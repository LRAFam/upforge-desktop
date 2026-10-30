/**
 * Read-only prefetch for the match page (UI v3).
 * Hovering or focusing a match row starts the same GETs the match page needs, so a click opens
 * a page that is already (or nearly) loaded. In-flight requests are shared, never repeated.
 * Memory only: timelines carry short-lived signed video URLs, so nothing is persisted.
 */
export const PREFETCH_TTL_MS = 90_000
export const PREFETCH_MAX = 8

interface Entry<T> { at: number; promise: Promise<T> }

export function createPrefetchCache<T, K extends string | number = number>(load: (id: K) => Promise<T>, ttlMs = PREFETCH_TTL_MS, max = PREFETCH_MAX) {
  const entries = new Map<K, Entry<T>>()
  function fresh(id: K, now: number): Entry<T> | undefined {
    const e = entries.get(id)
    if (e && now - e.at <= ttlMs) return e
    if (e) entries.delete(id)
    return undefined
  }
  return {
    /** Start (or join) a load. Failures are dropped so the next call retries. */
    prefetch(id: K, now = Date.now()): Promise<T> {
      const hit = fresh(id, now)
      if (hit) return hit.promise
      const promise = load(id)
      promise.catch(() => { if (entries.get(id)?.promise === promise) entries.delete(id) })
      entries.set(id, { at: now, promise })
      while (entries.size > max) entries.delete(entries.keys().next().value as K)
      return promise
    },
    /** A fresh prefetched (or in-flight) result, or undefined. Consumed: the page owns it now. */
    take(id: K, now = Date.now()): Promise<T> | undefined {
      const hit = fresh(id, now)
      if (hit) entries.delete(id)
      return hit?.promise
    },
    /** A fresh result without consuming it (e.g. the reviews detail pane shares the prefetch). */
    peek(id: K, now = Date.now()): Promise<T> | undefined {
      return fresh(id, now)?.promise
    },
    size: () => entries.size,
    clear: () => entries.clear(),
  }
}

type Timeline = Awaited<ReturnType<Window['api']['analyses']['getTimeline']>>
type Detail = Awaited<ReturnType<Window['api']['analyses']['getDetail']>>

type ArchiveReview = Awaited<ReturnType<Window['api']['archives']['review']>>

const timelines = createPrefetchCache<Timeline>(id => window.api.analyses.getTimeline(id))
// Read-only: never pass the `analyse` flag here (that POSTs an analysis request).
const archives = createPrefetchCache<ArchiveReview, string>(id => window.api.archives.review(id))
const ARCHIVE_ID = /^[0-9a-f-]{36}$/i
const details = createPrefetchCache<Detail>(id => window.api.analyses.getDetail(id).catch(() => null))

const validId = (id: unknown): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0

let listening = false
/** Account switch or expired session: drop the previous account's prefetched matches. */
function listenForAccountChange(): void {
  if (listening) return
  listening = true
  for (const event of ['session:user-changed', 'auth:session-expired']) {
    try { window.api.on(event, () => clearMatchPrefetch()) } catch { /* no bridge in tests */ }
  }
}

/** Warm the match page for an analysed match (hover / focus on a row). */
export function prefetchAnalysis(id: number | null | undefined): void {
  if (!validId(id)) return
  listenForAccountChange()
  void timelines.prefetch(id).catch(() => null)
  void details.prefetch(id)
}

/** Warm the match page for a cloud recording (hover / focus on a row). */
export function prefetchArchive(archiveId: string | null | undefined): void {
  if (typeof archiveId !== 'string' || !ARCHIVE_ID.test(archiveId)) return
  listenForAccountChange()
  void archives.prefetch(archiveId)
    .then((r) => { const id = r.ok ? r.timeline.analysisId : null; if (validId(id)) void details.prefetch(id) })
    .catch(() => null)
}

export function takeArchive(archiveId: string): Promise<ArchiveReview> | undefined {
  return ARCHIVE_ID.test(archiveId) ? archives.take(archiveId) : undefined
}

export function takeTimeline(id: number): Promise<Timeline> | undefined {
  return validId(id) ? timelines.take(id) : undefined
}

export function takeDetail(id: number): Promise<Detail> | undefined {
  return validId(id) ? details.take(id) : undefined
}

/** Coaching detail for a prefetched match, shared with the match page (not consumed). */
export function peekDetail(id: number): Promise<Detail> | undefined {
  return validId(id) ? details.peek(id) : undefined
}

/** Drop everything (account switch / sign-out). */
export function clearMatchPrefetch(): void {
  archives.clear()
  timelines.clear()
  details.clear()
}
