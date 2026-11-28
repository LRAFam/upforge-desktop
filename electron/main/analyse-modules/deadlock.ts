import {
  DEADLOCK_REVIEW_REPLAY_HINT,
  deadlockDemoSyncMessage,
  demoSyncMaxMsForGame,
  hasDemoKillRows,
} from '../match-data-quality'
import type { AnalyseReadiness, GameAnalyseModule, ReadinessRecording } from './types'
import { recordingAgeMs } from './types'

/** Shown once the replay is reviewed: that review is the match's coaching. */
export const DEADLOCK_REVIEWED_MESSAGE = 'Replay reviewed. Deadlock coaching comes from Review replay; open the match to see it.'

/**
 * Deadlock has one analysis path: "Review replay" (the cloud reads the replay). The old video
 * "Analyse" was a second, text-only pass whose upload was never read (card #600), so Deadlock is
 * never `ready`: nothing auto-enqueues or uploads the video for it. A reviewed replay is terminal.
 */
export const deadlockModule: GameAnalyseModule = {
  id: 'deadlock',
  isReady(rec: ReadinessRecording): AnalyseReadiness {
    const ageMs = recordingAgeMs(rec)
    const withinSyncWindow = ageMs < demoSyncMaxMsForGame(rec.game)

    if (hasDemoKillRows(rec.timeline)) {
      return { ready: false, state: 'mode_unsupported', message: DEADLOCK_REVIEWED_MESSAGE, duelMomentCount: 0 }
    }

    if (withinSyncWindow) {
      return {
        ready: false,
        state: 'syncing',
        message: deadlockDemoSyncMessage(ageMs),
        duelMomentCount: 0,
      }
    }

    return {
      ready: false,
      state: 'waiting_match_data',
      message: DEADLOCK_REVIEW_REPLAY_HINT,
      duelMomentCount: 0,
    }
  },
}
