/**
 * Shared user-facing copy for post-match pause / wait / resume.
 * Keep activity log, toasts, and UI aligned across games.
 */

export const POST_MATCH_COPY = {
  pausedUntilGameEnds: 'Your previous analysis has been paused until you finish this game',
  pausedShort: 'Paused until you finish this game',
  pausedAnalyseBlocked: 'Paused until you finish this game — Analyse unlocks after the match',
  pausedDashboardChip: 'paused until this game ends',
  readyToResume: 'Ready to resume any paused upload or analysis',
  matchSavedAutoOff: 'Match saved — auto-analyse is off. Tap Analyse when you are ready',
  queuedUntilNotInMatch: 'Queued upload/analysis — will run when you are not in a match',
  compressPaused: 'Compress/upload paused for your next match — will resume when this game ends',
  uploadPaused: 'Upload paused for your next match — will resume when this game ends',
  saveVodNoAnalysis: 'Save VOD to cloud (no analysis)',
  analyseVsSaveHint: 'Analyse runs AI coaching (uses quota). Save to cloud backs up the VOD only.',
} as const

export type PostMatchCopyKey = keyof typeof POST_MATCH_COPY

type Gameish = string | null | undefined

function normalizeGame(game: Gameish): string {
  return (game ?? '').toLowerCase()
}

/** Short label for match-data source (Valorant Riot / CS2 demo / etc.). */
export function matchDataSourceLabel(game: Gameish): string {
  const g = normalizeGame(game)
  if (g === 'valorant') return 'Riot match stats'
  if (g === 'cs2') return 'CS2 demo / match stats'
  if (g === 'deadlock') return 'Deadlock replay / match stats'
  if (g === 'lol') return 'League match stats'
  return 'match stats'
}

export function waitingMatchDataBeforeAnalyse(game: Gameish): string {
  return `Waiting for ${matchDataSourceLabel(game)} before Analyse unlocks`
}

export function waitingMatchDataBeforeUpload(game: Gameish): string {
  return `Waiting for ${matchDataSourceLabel(game)} — upload starts when stats are ready`
}

export function waitingMatchDataSubtitle(game: Gameish): string {
  const g = normalizeGame(game)
  if (g === 'valorant') return 'Waiting for Riot match stats…'
  if (g === 'cs2') return 'Waiting for CS2 demo / match stats…'
  if (g === 'deadlock') return 'Waiting for Deadlock replay / match stats…'
  if (g === 'lol') return 'Waiting for League match stats…'
  return 'Waiting for match stats…'
}

export function matchDataReadyStartingUpload(game: Gameish): string {
  return `${matchDataSourceLabel(game)} ready — starting upload for analysis`
}

export function matchDataReadyUploading(game: Gameish): string {
  return `${matchDataSourceLabel(game)} ready — uploading for analysis`
}
