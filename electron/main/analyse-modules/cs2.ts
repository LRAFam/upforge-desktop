import { duelMomentsForUpload } from '../moment-picker'
import {
  cs2DemoSyncMessage,
  cs2PlayerIdentityMismatch,
  demoSyncMaxMsForGame,
  hasRichMatchData,
} from '../match-data-quality'
import type { AnalyseReadiness, GameAnalyseModule, ReadinessRecording } from './types'
import { recordingAgeMs } from './types'

export const cs2Module: GameAnalyseModule = {
  id: 'cs2',
  isReady(rec: ReadinessRecording): AnalyseReadiness {
    const ageMs = recordingAgeMs(rec)
    const withinSyncWindow = ageMs < demoSyncMaxMsForGame(rec.game)

    if (hasRichMatchData(rec.timeline)) {
      const duelMomentCount = duelMomentsForUpload(rec.timeline ?? null).length
      if (cs2PlayerIdentityMismatch(rec.timeline)) {
        return {
          ready: true,
          state: 'ready',
          message: 'Demo linked — set your CS2 Steam name in Settings → Recording to tag your kills',
          duelMomentCount,
        }
      }
      return { ready: true, state: 'ready', message: '', duelMomentCount }
    }

    if (withinSyncWindow) {
      return {
        ready: false,
        state: 'syncing',
        message: cs2DemoSyncMessage(ageMs),
        duelMomentCount: 0,
      }
    }

    return {
      ready: false,
      state: 'waiting_match_data',
      message: 'Attach the CS2 GOTV demo (.dem) to unlock Analyse. Coaching needs kill timeline from the demo.',
      duelMomentCount: 0,
    }
  },
}
