import type { VodGameAdapter } from './types'
import { agentPortraitByPuuid } from './valorant'

export const deadlockVodAdapter: VodGameAdapter = {
  id: 'deadlock',
  label: 'Deadlock',
  // Deadlock is a continuous match, not round-based (see game-config.ts).
  supportsRounds: false,
  timelineUnitLabel: 'Moment',
  defaultSyncMs: 0,
  extraEventKinds: [],
  portraitImageFor: agentPortraitByPuuid,
  legend: [
    { kind: 'kill', label: 'Kill', dotClass: 'bg-emerald-500' },
    { kind: 'death', label: 'Death', dotClass: 'bg-red-500' },
  ],
}
