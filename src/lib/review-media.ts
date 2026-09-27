/** Media-time coordinates only; event offsets must already be resolved by the caller. */
export function boundedMediaTime(seconds: number, duration: number): number | null {
  if (!Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) return null
  return Math.max(0, Math.min(duration, seconds))
}

export const EVENT_PRE_ROLL_SECONDS = 2
export const DEATH_PRE_ROLL_SECONDS = 4

/** Preserve the event timestamp for labels; seek early enough to review the action. */
export function reviewEventStart(seconds: number, type: string): number | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null
  const leadIn = type === 'death' ? DEATH_PRE_ROLL_SECONDS : type === 'kill' ? EVENT_PRE_ROLL_SECONDS : 0
  return Math.max(0, seconds - leadIn)
}

export function reviewVideoUrl(path: string | null | undefined): string {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  const normalized = path.replace(/\\/g, '/')
  return normalized.startsWith('/') ? encodeURI(`file://${normalized}`) : encodeURI(`file:///${normalized}`)
}

/** Accept seconds, m:ss or h:mm:ss, with up to millisecond precision. */
export function parseReviewTime(value: string): number | null {
  const text = value.trim()
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(text)) return null
  const parts = text.split(':').map(Number)
  if (parts.length > 1 && parts.slice(1).some(part => part >= 60)) return null
  const seconds = parts.reduce((total, part) => total * 60 + part, 0)
  return Number.isFinite(seconds) ? seconds : null
}
