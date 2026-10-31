import { cs2DemoRetrievalStatus } from '../cs2-demo-retrieval'
import { duelMomentsForUpload } from '../moment-picker'
import {
  cs2PlayerIdentityMismatch,
  hasRichMatchData,
} from '../match-data-quality'
import type { AnalyseReadiness, GameAnalyseModule, ReadinessRecording } from './types'

export const cs2Module: GameAnalyseModule = {
  id: 'cs2',
  isReady(rec: ReadinessRecording): AnalyseReadiness {
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

    const retrieval = rec.id ? cs2DemoRetrievalStatus.get(rec.id) : undefined
    if (retrieval) {
      return {
        ready: false,
        state: retrieval.state,
        message: retrieval.message + (retrieval.nextRetryAt ? ' Automatic checks will retry.' : ''),
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
