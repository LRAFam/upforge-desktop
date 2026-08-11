import { duelMomentsForUpload } from '../moment-picker'
import { demoSyncMaxMsForGame, hasRichMatchData } from '../match-data-quality'
import type { AnalyseReadiness, GameAnalyseModule, ReadinessRecording } from './types'
import { recordingAgeMs, resolveGameMode } from './types'

export const COACHING_UNSUPPORTED_MODES = new Set(['DEATHMATCH', 'TEAMDEATHMATCH'])

export const valorantModule: GameAnalyseModule = {
  id: 'valorant',
  isReady(rec: ReadinessRecording): AnalyseReadiness {
    if (COACHING_UNSUPPORTED_MODES.has(resolveGameMode(rec))) {
      return {
        ready: false,
        state: 'mode_unsupported',
        message: 'Duel coaching is not available for Deathmatch or Team Deathmatch',
        duelMomentCount: 0,
      }
    }

    const timeline = rec.timeline
    const hasMatchId = Boolean(timeline?.matchId ?? rec.matchId)
    const ageMs = recordingAgeMs(rec)
    const withinSyncWindow = ageMs < demoSyncMaxMsForGame(rec.game)

    if (!hasRichMatchData(timeline)) {
      if (withinSyncWindow && hasMatchId) {
        return {
          ready: false,
          state: 'syncing',
          message: 'Still getting Riot match data. Analyse unlocks when ready (usually about a minute). Keep Valorant / Riot Client open.',
          duelMomentCount: 0,
        }
      }
      if (hasMatchId) {
        return {
          ready: false,
          state: 'waiting_match_data',
          message: 'Still getting Riot match data. Analyse unlocks when ready (usually about a minute). Keep Valorant / Riot Client open.',
          duelMomentCount: 0,
        }
      }
      return {
        ready: false,
        state: 'unavailable',
        message: 'Could not link this recording to a Riot match — keep UpForge open while you play',
        duelMomentCount: 0,
      }
    }

    const duelMomentCount = duelMomentsForUpload(timeline).length
    if (duelMomentCount > 0) {
      return { ready: true, state: 'ready', message: '', duelMomentCount }
    }

    const deaths = timeline?.playerDeaths?.length ?? 0
    const deathsWithOffset = timeline?.playerDeaths?.filter(
      (d) => d.videoOffsetMs != null && d.videoOffsetMs >= 0,
    ).length ?? 0

    if (deaths === 0) {
      return {
        ready: false,
        state: 'no_deaths',
        message: 'No deaths in this match — coaching reviews your death moments, not kills',
        duelMomentCount: 0,
      }
    }

    if (deathsWithOffset === 0 && withinSyncWindow) {
      return {
        ready: false,
        state: 'syncing',
        message: 'Syncing death timestamps for coaching…',
        duelMomentCount: 0,
      }
    }

    return {
      ready: false,
      state: 'unavailable',
      message: 'Could not build reviewable death moments for this match',
      duelMomentCount: 0,
    }
  },
}
