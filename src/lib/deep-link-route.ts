/** Where a taken upforge:// action goes in the renderer. Pure, so it can be tested without a router. */
import type { PrimaryGame } from './games'

export type DeepLinkTarget =
  | { type: 'route'; location: { path: string; query: Record<string, string> } }
  | { type: 'web'; path: string }
  /** An analysis result: opened in the app by `openDeepLinkAnalysis` (match page, League report or Coaching reviews). */
  | { type: 'analysis'; game: PrimaryGame; analysisId: number }

const GAMES: readonly string[] = ['valorant', 'cs2', 'deadlock', 'lol']
const validId = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0 && id <= 9_999_999_999

export function deepLinkRoute(action: unknown, uiV3: boolean): DeepLinkTarget | null {
  const a = action as { kind?: unknown; coachId?: unknown; game?: unknown; analysisId?: unknown } | null | undefined
  if (!a) return null
  // Cloud retention warnings (notification / email): the Cloud storage page exists in both designs.
  if (a.kind === 'open-cloud-storage') return { type: 'route', location: { path: '/cloud-storage', query: {} } }
  if (a.kind === 'open-analysis') {
    if (typeof a.game !== 'string' || !GAMES.includes(a.game) || !validId(a.analysisId)) return null
    // In-app in both designs: the website is never the default for a result.
    return { type: 'analysis', game: a.game as PrimaryGame, analysisId: a.analysisId }
  }
  if (a.kind !== 'roster-join') return null
  const id = a.coachId
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || id > 999_999_999) return null
  // v3 joins in-app (Coaches looks the coach up and asks before joining); the old UI uses the web invite page.
  return uiV3
    ? { type: 'route', location: { path: '/rosters', query: { join: '1', invite: String(id) } } }
    : { type: 'web', path: `/coaches/${id}#join-roster` }
}
