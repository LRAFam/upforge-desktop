import { demoSyncMaxMsForGame, hasRichMatchData } from '../match-data-quality'
import type { AnalyseReadiness, GameAnalyseModule, ReadinessRecording } from './types'
import { recordingAgeMs } from './types'

/**
 * LoL readiness stub: preserves pre-Task-4 soft unlock behavior until strict Match-V5 gate lands.
 */
export const lolModule: GameAnalyseModule = {
  id: 'lol',
  isReady(rec: ReadinessRecording): AnalyseReadiness {
    const timeline = rec.timeline
    const ageMs = recordingAgeMs(rec)
    const withinSyncWindow = ageMs < demoSyncMaxMsForGame(rec.game)

    if (hasRichMatchData(timeline)) {
      return { ready: true, state: 'ready', message: '', duelMomentCount: 0 }
    }

    const hasMatchId = Boolean(timeline?.matchId ?? rec.matchId)
    if (withinSyncWindow && hasMatchId) {
      return {
        ready: false,
        state: 'waiting_match_data',
        message: 'Waiting for Riot match stats — usually ready about a minute after the game ends.',
        duelMomentCount: 0,
      }
    }

    if (hasMatchId) {
      return {
        ready: true,
        state: 'ready',
        message: 'VOD ready — match stats may still be syncing on the server.',
        duelMomentCount: 0,
      }
    }

    return {
      ready: false,
      state: 'unavailable',
      message: 'Could not link this recording to a League match — keep UpForge open while you play',
      duelMomentCount: 0,
    }
  },
}
