/**
 * Matches without a recording. The free match report exists for every synced Valorant match, but
 * Matches only listed recordings, so a match that was not recorded could not be found again.
 * These rules add one plain row per such match (it opens the report) to the same dated list.
 */
import type { LibraryRecording } from '../../../lib/footage-library'
import { modeQueueLabel } from '../../../lib/game-queue'
import { matchScore, type MatchScoreDisplay } from '../../../lib/upforge-score'
import { formatMatchDate, groupByMatchDate, matchMapLabel, type MatchDateGroup } from './match-meta'
import { getRecordedModesForGame, isModeFilteredOut, VALORANT_RECORDABLE_MODES } from '../../../../electron/main/recorded-modes-filter'

/** One stored match report as GET /api/match-reports lists it. */
export interface MatchReportRow {
  match_id: string
  played_at: string | null
  map: string | null
  agent: string | null
  won: boolean | null
  score: { ally: number; enemy: number } | null
  headline: string | null
  notes_source: string | null
  game_mode?: string | null
  queue?: string | null
  upforge_score?: number | null
}

export type MatchListItem =
  | { kind: 'recording'; key: string; rec: LibraryRecording }
  | { kind: 'report'; key: string; report: MatchReportRow }

const MATCH_ID = /^[A-Za-z0-9_-]{1,64}$/

/** Reports of matches the library has no recording for (a recorded match keeps its recording row). */
export function reportOnlyRows(
  reports: readonly MatchReportRow[],
  recordings: ReadonlyArray<Pick<LibraryRecording, 'matchId'>>,
): MatchReportRow[] {
  const recorded = new Set(recordings.map(r => r.matchId).filter((id): id is string => typeof id === 'string' && id !== ''))
  const seen = new Set<string>()
  return reports.filter((r) => {
    if (typeof r?.match_id !== 'string' || !MATCH_ID.test(r.match_id)) return false
    if (recorded.has(r.match_id) || seen.has(r.match_id)) return false
    seen.add(r.match_id)
    return true
  })
}

/**
 * Report rows are Valorant matches on the main account with no footage, so they only belong in the
 * unfiltered view: a footage status ("On this PC", "In cloud"…), another game, the alts-only
 * filter or select-to-delete mode never shows them.
 */
export function showReportRows(view: { game: string; status: string; account: string; selecting: boolean }): boolean {
  return !view.selecting && view.status === 'all' && view.account !== 'alt' && (view.game === 'all' || view.game === 'valorant')
}

export function reportPlayedAt(report: Pick<MatchReportRow, 'played_at'>): number {
  const ms = report.played_at ? Date.parse(report.played_at) : NaN
  return Number.isFinite(ms) ? ms : 0
}

/** Recordings and report-only matches in one list, newest first, grouped by match date. */
export function matchListGroups(
  recordings: readonly LibraryRecording[],
  reports: readonly MatchReportRow[],
  recordingDate: (rec: LibraryRecording) => number,
  now = Date.now(),
): MatchDateGroup<MatchListItem>[] {
  const items: MatchListItem[] = [
    ...recordings.map((rec): MatchListItem => ({ kind: 'recording', key: `rec:${rec.id}`, rec })),
    ...reports.map((report): MatchListItem => ({ kind: 'report', key: `report:${report.match_id}`, report })),
  ]
  return groupByMatchDate(items, item => (item.kind === 'recording' ? recordingDate(item.rec) : reportPlayedAt(item.report)), now)
}

export interface ReportRowView {
  tone: 'win' | 'loss' | 'none'
  resultWord: string
  score: string
  mapLabel: string
  /** "Jett · 2d ago · Unrated" */
  meta: string
  score1000: MatchScoreDisplay | null
  /** The coach's headline, or a plain line when the report has facts only. */
  line: string
}

export function reportRowView(report: MatchReportRow, now = Date.now()): ReportRowView {
  const score = report.score && Number.isFinite(report.score.ally) && Number.isFinite(report.score.enemy)
    ? `${report.score.ally}–${report.score.enemy}` : ''
  const tone = report.won === true ? 'win' : report.won === false ? 'loss' : 'none'
  const date = formatMatchDate(reportPlayedAt(report), now)
  return {
    tone,
    resultWord: tone === 'win' ? 'Victory' : tone === 'loss' ? 'Defeat' : score ? 'Draw' : '',
    score,
    mapLabel: matchMapLabel('valorant', report.map),
    meta: [report.agent, date, modeQueueLabel('valorant', report.game_mode)].filter(Boolean).join(' · '),
    score1000: matchScore({ upforge_score: report.upforge_score }),
    line: report.headline?.trim() || 'Match facts',
  }
}

/** Why a synced match has no recording, and where to change it. Only says what we can see today. */
export interface NotRecordedReason {
  text: string
  fix: { label: string; path: string }
}

export interface RecordingSettingsLike {
  recordedModes?: string[]
  recordedModesByGame?: { valorant?: string[] } | null
}

export function notRecordedReason(gameMode: string | null | undefined, settings: RecordingSettingsLike | null | undefined): NotRecordedReason {
  const fix = { label: 'Recording settings', path: '/settings?tab=recording' }
  const key = gameMode?.trim().toUpperCase().replace(/[\s-]+/g, '_') || null
  if (settings && key) {
    const modes = getRecordedModesForGame(settings.recordedModesByGame as Parameters<typeof getRecordedModesForGame>[0], 'valorant', settings.recordedModes)
    if (isModeFilteredOut(modes, key, VALORANT_RECORDABLE_MODES)) {
      const name = modeQueueLabel('valorant', key).split(' · ')[0] || key
      return { text: `${name} isn't in your recorded modes`, fix: { label: 'Change recorded modes', path: fix.path } }
    }
  }
  // We can't see what happened at match time, so this stays a "may".
  return { text: 'UpForge or OBS may not have been running', fix }
}
