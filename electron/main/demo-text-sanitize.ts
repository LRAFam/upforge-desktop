import fs from 'fs'
import { normalizeCs2MapKey } from './spatial/cs2-transforms'
import type { DemoHeaderPeek } from './demo-header-peek'

/** Valid CS2 map id from demo header, or fallback (e.g. recording map hint). */
export function sanitizeDemoMapName(
  raw: string | null | undefined,
  fallback?: string | null,
): string | null {
  return normalizeCs2MapKey(raw) ?? normalizeCs2MapKey(fallback)
}

/** Reject binary garbage from truncated demo headers. */
export function sanitizeDemoClientName(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > 32) return null
  if (/[\x00-\x08\x0e-\x1f\uFFFD]/.test(trimmed)) return null
  if (!/^[\p{L}\p{N}\s_\-.[\]|]+$/u.test(trimmed)) return null
  return trimmed
}

const MIN_DEMO_BYTES = 96 * 1024
/** Steam GOTV writes grow for minutes; unchanged files older than this are treated as complete. */
const DEMO_STABLE_MS = 10 * 60 * 1000

/** Heuristic: Steam GOTV downloads grow over time; tiny files rarely parse fully. */
export function isDemoLikelyIncomplete(demoPath: string, peek?: DemoHeaderPeek | null): boolean {
  try {
    const stat = fs.statSync(demoPath)
    const size = stat.size
    if (size < MIN_DEMO_BYTES) return true

    const ageSinceWriteMs = Date.now() - stat.mtimeMs
    if (ageSinceWriteMs >= DEMO_STABLE_MS && size >= MIN_DEMO_BYTES) return false

    const durationSec = peek?.playbackTime ?? 0
    if (durationSec > 120 && size < 512 * 1024) return true
    if (durationSec > 600 && size < 2 * 1024 * 1024) return true
  } catch {
    return true
  }
  return false
}
