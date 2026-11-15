import { duelMomentsForUpload } from '../moment-picker'
import {
  DEADLOCK_REVIEW_REPLAY_HINT,
  deadlockDemoSyncMessage,
  demoSyncMaxMsForGame,
  hasDemoKillRows,
} from '../match-data-quality'
import type { AnalyseReadiness, GameAnalyseModule, ReadinessRecording } from './types'
import { recordingAgeMs } from './types'

export const deadlockModule: GameAnalyseModule = {
  id: 'deadlock',
  isReady(rec: ReadinessRecording): AnalyseReadiness {
    const ageMs = recordingAgeMs(rec)
    const withinSyncWindow = ageMs < demoSyncMaxMsForGame(rec.game)

    if (hasDemoKillRows(rec.timeline)) {
      const duelMomentCount = duelMomentsForUpload(rec.timeline ?? null).length
      return { ready: true, state: 'ready', message: '', duelMomentCount }
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
      message: `Analyse needs match stats from the replay. ${DEADLOCK_REVIEW_REPLAY_HINT}`,
      duelMomentCount: 0,
    }
  },
}
