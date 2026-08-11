import { demoSyncMaxMsForGame, hasRichMatchData } from '../match-data-quality'
import type { AnalyseReadiness, GameAnalyseModule, ReadinessRecording } from './types'
import { recordingAgeMs } from './types'

const WAIT_MESSAGE =
  'Waiting for Riot match stats — usually ready about a minute after the game ends.'

const NO_MATCH_MESSAGE =
  'Could not link this recording to a League match — keep UpForge open while you play'

const TIMEOUT_MESSAGE =
  'Riot match stats were not available in time. Wait about a minute after the game ends, then try Analyse again.'

const FETCH_FAILED_MESSAGE =
  'Riot match stats could not be loaded. Wait a minute after the game ends, then tap Retry sync.'

const NO_AUTH_MESSAGE = 'Link your Riot ID in Settings to load League match stats.'

function isTerminalLolEnrichStatus(status: string | undefined): boolean {
  return status === 'fetch_failed' || status === 'no_auth' || status === 'no_match_id'
}

/**
 * LoL strict ready bar A: Match-V5 enrich required; Live Client combat alone is not enough.
 */
export const lolModule: GameAnalyseModule = {
  id: 'lol',
  isReady(rec: ReadinessRecording): AnalyseReadiness {
    const timeline = rec.timeline
    const ageMs = recordingAgeMs(rec)
    const withinSyncWindow = ageMs < demoSyncMaxMsForGame(rec.game)
    const hasMatchId = Boolean(timeline?.matchId ?? rec.matchId)
    const enrichStatus = timeline?.lolEnrichStatus

    if (enrichStatus === 'fetched' && hasRichMatchData(timeline)) {
      return { ready: true, state: 'ready', message: '', duelMomentCount: 0 }
    }

    if (enrichStatus === 'no_auth') {
      return {
        ready: false,
        state: 'unavailable',
        message: NO_AUTH_MESSAGE,
        duelMomentCount: 0,
      }
    }

    if (enrichStatus === 'fetch_failed') {
      return {
        ready: false,
        state: 'unavailable',
        message: FETCH_FAILED_MESSAGE,
        duelMomentCount: 0,
      }
    }

    if (withinSyncWindow && hasMatchId && !isTerminalLolEnrichStatus(enrichStatus)) {
      return {
        ready: false,
        state: 'waiting_match_data',
        message: WAIT_MESSAGE,
        duelMomentCount: 0,
      }
    }

    if (withinSyncWindow && !hasMatchId && enrichStatus !== 'no_match_id') {
      return {
        ready: false,
        state: 'waiting_match_data',
        message: WAIT_MESSAGE,
        duelMomentCount: 0,
      }
    }

    if (!hasMatchId || enrichStatus === 'no_match_id') {
      return {
        ready: false,
        state: 'unavailable',
        message: NO_MATCH_MESSAGE,
        duelMomentCount: 0,
      }
    }

    return {
      ready: false,
      state: 'unavailable',
      message: TIMEOUT_MESSAGE,
      duelMomentCount: 0,
    }
  },
}
