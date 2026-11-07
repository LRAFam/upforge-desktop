/**
 * One set of match facts for every v3 list (Matches, Coaching reviews, Cloud storage):
 * the match date, the date groups, the map name and the map art. Pure helpers, no data invented.
 */
import cs2CardArt from '../../../assets/games/cs2-card-bg.webp'
import { mapDisplayName } from '../games/display-names'
import { getCs2RadarUrl, isCs2Map, normalizeCs2MapKey } from '../../../lib/cs2-maps'
import { recordingMapImage, recordingMapLabel, recordingPlayerImage, resolveRecordingAgent } from '../../../lib/recording-display'
import { championSplashUrl } from '../../../lib/lol'
import type { PendingRecording } from '../../../env.d.ts'

/** A valid epoch-ms value from a number, an ISO string or nothing. */
function toMs(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const ms = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(ms) && ms > 0 ? ms : null
}

/**
 * The match date: the earliest timestamp we know for the match. A match is never played after it was
 * recorded, uploaded or analysed, so the earliest one is the closest to when it was played.
 * (The API's real `matches.match_date` is not sent to the desktop yet: see notes-audit-matches.md.)
 * Returns 0 when nothing is known.
 */
export function matchDateMs(...candidates: Array<number | string | null | undefined>): number {
  const valid = candidates.map(toMs).filter((ms): ms is number => ms != null)
  return valid.length ? Math.min(...valid) : 0
}

const DAY = 86_400_000

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Monday 00:00 of the week that holds `ms` (weeks start on Monday). */
function startOfWeek(ms: number): number {
  const d = new Date(startOfDay(ms))
  const back = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - back)
  return d.getTime()
}

/** Group label for a match date: Today · This week · Last week · "September" (· "September 2025" in other years). */
export function matchDateGroup(ms: number, now = Date.now()): string {
  if (!ms) return 'Date unknown'
  if (ms >= startOfDay(now)) return 'Today'
  const week = startOfWeek(now)
  if (ms >= week) return 'This week'
  if (ms >= week - 7 * DAY) return 'Last week'
  const d = new Date(ms)
  const month = d.toLocaleDateString('en-GB', { month: 'long' })
  return d.getFullYear() === new Date(now).getFullYear() ? month : `${month} ${d.getFullYear()}`
}

export interface MatchDateGroup<T> { label: string; items: T[] }

/** Groups items by match date (newest first), keeping one group per label in date order. */
export function groupByMatchDate<T>(items: readonly T[], dateOf: (item: T) => number, now = Date.now()): MatchDateGroup<T>[] {
  const sorted = [...items].sort((a, b) => dateOf(b) - dateOf(a))
  const groups: MatchDateGroup<T>[] = []
  for (const item of sorted) {
    const label = matchDateGroup(dateOf(item), now)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
}

/** Short date for a row: "Just now", "3h ago", "2d ago", then "5 Sept". Same on every tab. */
export function formatMatchDate(ms: number, now = Date.now()): string {
  if (!ms) return ''
  const mins = Math.round((now - ms) / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  const d = new Date(ms)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "de_vertigo" → "Vertigo" for CS2 maps the manifest doesn't list; known maps keep their display name. */
export function matchMapLabel(game: string | null | undefined, map: string | null | undefined): string {
  if (game === 'cs2' || normalizeCs2MapKey(map)) return mapDisplayName('cs2', map) || 'Unknown map'
  return recordingMapLabel({ game: game ?? 'unknown', map: map ?? null })
}

/** Map art for a row: the map's own art, else the game's card art for CS2 maps we have no art for. */
export function matchMapArt(game: string | null | undefined, map: string | null | undefined): string {
  if (game === 'cs2' || normalizeCs2MapKey(map)) return isCs2Map(map) ? getCs2RadarUrl(map) : cs2CardArt
  return recordingMapImage({ game: game ?? 'unknown', map: map ?? null })
}

interface DedupeLike { id: number; match_id?: string | null; overall_score: number | null; created_at: string }

/**
 * One row per match: re-runs of the same match (same match id) collapse to the newest scored analysis.
 * Analyses without a match id are kept as they are. Order is preserved.
 */
export function dedupeAnalysesByMatch<T extends DedupeLike>(list: readonly T[]): T[] {
  const best = new Map<string, T>()
  for (const a of list) {
    const key = a.match_id?.trim()
    if (!key) continue
    const cur = best.get(key)
    if (!cur) { best.set(key, a); continue }
    const better = (a.overall_score != null) !== (cur.overall_score != null)
      ? a.overall_score != null
      : Date.parse(a.created_at) > Date.parse(cur.created_at)
    if (better) best.set(key, a)
  }
  return list.filter(a => {
    const key = a.match_id?.trim()
    return !key || best.get(key) === a
  })
}

/**
 * Row artwork, like the web companion's Matches band: a wide backdrop that fills the row and,
 * for Valorant, the agent's full portrait standing in it. League uses the champion splash as the
 * backdrop (its map art is the same for every game). Other games keep their map art and icon.
 */
export function matchRowArt(rec: Pick<PendingRecording, 'game' | 'map' | 'agent' | 'timeline'>): {
  backdrop: string
  figure: string
  icon: string
} {
  const agent = resolveRecordingAgent(rec)
  if (rec.game === 'lol' && agent) {
    const splash = championSplashUrl(agent)
    if (splash) return { backdrop: splash, figure: '', icon: recordingPlayerImage(rec) }
  }
  const icon = recordingPlayerImage(rec)
  const valorant = rec.game === 'valorant' || rec.game === 'unknown'
  const figure = valorant && /\/displayicon\.png$/.test(icon) ? icon.replace(/\/displayicon\.png$/, '/fullportrait.png') : ''
  return { backdrop: matchMapArt(rec.game, rec.map), figure, icon: figure ? '' : icon }
}
