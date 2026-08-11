import { hasRichMatchData } from '../match-data-quality'
import { cs2Module } from './cs2'
import { deadlockModule } from './deadlock'
import { lolModule } from './lol'
import type { AnalyseReadiness, GameAnalyseModule, ReadinessRecording } from './types'
import { valorantModule } from './valorant'

const modules: Record<GameAnalyseModule['id'], GameAnalyseModule> = {
  valorant: valorantModule,
  cs2: cs2Module,
  deadlock: deadlockModule,
  lol: lolModule,
}

function unknownGameIsReady(rec: ReadinessRecording): AnalyseReadiness {
  if (hasRichMatchData(rec.timeline)) {
    return { ready: true, state: 'ready', message: '', duelMomentCount: 0 }
  }
  return {
    ready: false,
    state: 'unavailable',
    message: 'Match replay not linked. Analyse stays locked until match stats are available',
    duelMomentCount: 0,
  }
}

export function getAnalyseModule(game: string): { isReady(rec: ReadinessRecording): AnalyseReadiness } {
  const mod = modules[game as GameAnalyseModule['id']]
  if (mod) return mod
  return { isReady: unknownGameIsReady }
}
