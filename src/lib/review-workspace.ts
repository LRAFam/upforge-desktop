export function boundedPanelWidth(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min
}

export function draggedPanelWidth(start: number, delta: number, container: number, reverse = false): number {
  if (!Number.isFinite(container) || container <= 0) return start
  return start + delta / container * 100 * (reverse ? -1 : 1)
}

export function comparisonPanelWidths(value: unknown): { videos: number; notebook: number } {
  const defaults = { videos: 50, notebook: 24 }
  if (!value || typeof value !== 'object') return defaults
  const v = value as Record<string, unknown>
  if (v.version !== 1) return defaults
  return {
    videos: typeof v.videos === 'number' && Number.isFinite(v.videos) ? boundedPanelWidth(v.videos, 35, 65) : defaults.videos,
    notebook: typeof v.notebook === 'number' && Number.isFinite(v.notebook) ? boundedPanelWidth(v.notebook, 20, 36) : defaults.notebook,
  }
}

/** A nearby event is context, not a claim that sparse events define round boundaries. */
export function nearbyReviewEvent<T extends { seconds: number }>(events: T[], time: number, radius = 4): T | null {
  if (!Number.isFinite(time)) return null
  const nearby = events.filter(event => Number.isFinite(event.seconds) && Math.abs(event.seconds - time) <= radius)
    .sort((a, b) => Math.abs(a.seconds - time) - Math.abs(b.seconds - time))
  if (!nearby.length || (nearby[1] && Math.abs(nearby[0].seconds - time) === Math.abs(nearby[1].seconds - time))) return null
  return nearby[0]
}
