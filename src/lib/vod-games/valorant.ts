import { getAgentImage } from '../valorant'
import type { VodGameAdapter, VodPlayerLookup, VodPlayerRef } from './types'

/** Portrait resolution shared by the puuid-keyed, agent-portrait games. */
export function agentPortraitByPuuid(ref: VodPlayerRef, lookup: VodPlayerLookup): string {
  const agent = ref.puuid ? lookup.byPuuid.get(ref.puuid) ?? null : null
  return agent ? getAgentImage(agent) || '' : ''
}

export const valorantVodAdapter: VodGameAdapter = {
  id: 'valorant',
  label: 'Valorant',
  supportsRounds: true,
  timelineUnitLabel: 'Round',
  defaultSyncMs: -8_000,
  extraEventKinds: ['plant', 'defuse', 'detonation'],
  portraitImageFor: agentPortraitByPuuid,
  legend: [
    { kind: 'kill', label: 'Kill', dotClass: 'bg-emerald-500' },
    { kind: 'death', label: 'Death', dotClass: 'bg-red-500' },
    { kind: 'plant', label: 'Plant', dotClass: 'bg-orange-500' },
    { kind: 'defuse', label: 'Defuse', dotClass: 'bg-cyan-500' },
  ],
}
