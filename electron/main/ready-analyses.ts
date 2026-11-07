import fs from 'fs'
import path from 'path'

/**
 * Finished analyses the player hasn't opened yet.
 *
 * Players said they couldn't find their coaching after it finished: the only signal was an OS toast
 * (dropped mid-match) and the post-game window (closed by the next match). This list drives the
 * Matches badge and the Home "Coaching ready" line until the player opens the analysis.
 */
export interface ReadyAnalysis {
  analysisId: number
  game: string
  /** Agent / champion / game name, e.g. "Jett". */
  label: string
  map: string | null
  readyAt: string
}

const MAX_READY = 10
const MAX_AGE_DAYS = 7

const validId = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0

/** Drop entries older than a week or malformed (from older settings files). */
export function pruneReady(list: unknown, now = Date.now()): ReadyAnalysis[] {
  if (!Array.isArray(list)) return []
  const cutoff = now - MAX_AGE_DAYS * 86_400_000
  return list.filter((r): r is ReadyAnalysis => {
    if (!r || typeof r !== 'object' || !validId((r as ReadyAnalysis).analysisId)) return false
    const at = Date.parse((r as ReadyAnalysis).readyAt)
    return Number.isFinite(at) && at >= cutoff
  })
}

/** Newest first, one entry per analysis, capped. */
export function addReady(list: unknown, item: ReadyAnalysis, now = Date.now()): ReadyAnalysis[] {
  if (!validId(item.analysisId)) return pruneReady(list, now)
  const rest = pruneReady(list, now).filter(r => r.analysisId !== item.analysisId)
  return [item, ...rest].slice(0, MAX_READY)
}

export function removeReady(list: unknown, analysisId: number, now = Date.now()): ReadyAnalysis[] {
  return pruneReady(list, now).filter(r => r.analysisId !== analysisId)
}

// ---- storage: its own per-account file, so settings saves from other screens can't wipe it ----

export function readReadyFile(file: string, now = Date.now()): ReadyAnalysis[] {
  try {
    return pruneReady(JSON.parse(fs.readFileSync(file, 'utf-8')), now)
  } catch {
    return []
  }
}

export function writeReadyFile(file: string, list: ReadyAnalysis[]): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(list))
  } catch { /* best effort: the badge is a convenience */ }
}
