export interface ActivityLogEntry { time: number; message: string; game?: string }

/** Same cap as the main process in-memory activity log (MAX_LOG_ENTRIES). */
export const ACTIVITY_LOG_MAX_ENTRIES = 30

/** Append one pushed entry (main sends only the new entry, not the whole log). */
export function appendActivityEntry(
  list: ActivityLogEntry[],
  entry: ActivityLogEntry,
  max = ACTIVITY_LOG_MAX_ENTRIES,
): ActivityLogEntry[] {
  const next = [...list, entry]
  return next.length > max ? next.slice(next.length - max) : next
}
