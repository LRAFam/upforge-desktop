import type { AnalysisItem, PendingRecording } from '../env.d.ts'
import type { PrimaryGame } from './games'
import { usesAsyncDemoSync } from './recording-demo-status'

/** Activity feed / notification badge after analysis completes. */
export function analysisCompleteBadge(
  game: PrimaryGame,
  overallScore: number | null | undefined,
): string | undefined {
  if (overallScore == null) return undefined
  const score = Math.round(overallScore)
  if (game === 'valorant') return `+${score * 2} RR`
  return `${score} / 100`
}

export function inferAnalysisGame(a: AnalysisItem): PrimaryGame {
  if (a.cs2_source) return 'cs2'
  if (a.game_mode === 'DEADLOCK') return 'deadlock'
  const blob = `${a.map ?? ''} ${a.game_mode ?? ''} ${a.agent ?? ''}`.toLowerCase()
  if (/de_|mirage|inferno|nuke|dust|anubis|ancient|overpass|vertigo/.test(blob)) return 'cs2'
  if (/deadlock/.test(blob)) return 'deadlock'
  return 'valorant'
}

/** Contextual tip under a failed pending recording row. */
export function pendingRecordingFailureHint(rec: PendingRecording): string | null {
  if (rec.lastAnalysisErrorHint) return rec.lastAnalysisErrorHint
  const message = rec.lastAnalysisError
  if (!message) return null

  if (usesAsyncDemoSync(rec.game)) {
    if (/demo|replay|sync|gotv|steam/i.test(message)) {
      return 'Tip: demos come from Steam — keep UpForge open or rescan from the dashboard after 5–15 min.'
    }
    if (/timed out/i.test(message)) return 'Tip: try again — off-peak hours are usually faster.'
    if (rec.lastAnalysisCreditRefunded) return 'Your coaching credit was refunded — you can try again.'
    return null
  }

  if (/late|unclear|sync/i.test(message)) {
    return 'Tip: UpForge will enable Analyse once Riot stats finish syncing.'
  }
  if (/timed out/i.test(message)) return 'Tip: try again — off-peak hours are usually faster.'
  if (/throttled|slow down/i.test(message)) return 'Tip: wait a minute, then tap Retry.'
  if (/incomplete|moov|finished saving/i.test(message)) {
    return 'Tip: let OBS finish writing after the match ends.'
  }
  if (rec.lastAnalysisCreditRefunded) return 'Your coaching credit was refunded — you can try again.'
  return null
}
