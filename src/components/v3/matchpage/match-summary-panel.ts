/**
 * Match page "Match summary" panel: rounds strip, match stats, enemy habits, AI round review and the
 * 2D replay sit in one collapsible section so the video gets the height. Closed by default; the
 * viewer's choice is remembered on this PC.
 */
export const SUMMARY_OPEN_KEY = 'uf.matchSummaryOpen'

type ReadStore = Pick<Storage, 'getItem'> | null | undefined
type WriteStore = Pick<Storage, 'setItem'> | null | undefined

/** Saved choice, else closed. A post-game "Review round N" link always opens it (the review lives here). */
export function initialSummaryOpen(storage: ReadStore, opts: { autoReview?: boolean } = {}): boolean {
  if (opts.autoReview) return true
  try {
    return storage?.getItem(SUMMARY_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

export function saveSummaryOpen(storage: WriteStore, open: boolean): void {
  try {
    storage?.setItem(SUMMARY_OPEN_KEY, open ? '1' : '0')
  } catch {
    // storage blocked: the panel still works, it just isn't remembered
  }
}

/**
 * "Rounds, match stats and enemy habits" from the sections that actually rendered (in order, no
 * repeats). Names come in sentence-middle case ("rounds", "AI round review"); the first is capitalised.
 */
export function summaryContents(names: Array<string | null | undefined>): string {
  const seen: string[] = []
  for (const n of names) {
    const v = n?.trim()
    if (v && !seen.includes(v)) seen.push(v)
  }
  if (!seen.length) return ''
  const text = seen.length === 1 ? seen[0] : `${seen.slice(0, -1).join(', ')} and ${seen[seen.length - 1]}`
  return text.charAt(0).toUpperCase() + text.slice(1)
}
