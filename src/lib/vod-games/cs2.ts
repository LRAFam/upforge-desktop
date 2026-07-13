import type { VodGameAdapter } from './types'
import { agentPortraitByPuuid } from './valorant'

export const cs2VodAdapter: VodGameAdapter = {
  id: 'cs2',
  label: 'CS2',
  supportsRounds: true,
  timelineUnitLabel: 'Round',
  defaultSyncMs: 0,
  extraEventKinds: ['plant', 'defuse', 'detonation'],
  // CS2 has no agent portraits; puuid lookup returns '' and the UI shows initials.
  portraitImageFor: agentPortraitByPuuid,
  legend: [
    { kind: 'kill', label: 'Kill', dotClass: 'bg-emerald-500' },
    { kind: 'death', label: 'Death', dotClass: 'bg-red-500' },
    { kind: 'plant', label: 'Plant', dotClass: 'bg-orange-500' },
    { kind: 'defuse', label: 'Defuse', dotClass: 'bg-cyan-500' },
  ],
}
