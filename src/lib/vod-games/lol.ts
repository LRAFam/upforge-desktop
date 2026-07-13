import { getChampionImage } from '../lol'
import { tagStripLower, type VodGameAdapter, type VodPlayerLookup, type VodPlayerRef } from './types'

/**
 * LoL portraits resolve by name (the Live Client event feed has no puuids):
 *  - the local player is tagged "You" -> own champion (timeline.agent)
 *  - everyone else -> champion from the team roster by tag-stripped name
 */
export function championPortraitByName(ref: VodPlayerRef, lookup: VodPlayerLookup): string {
  if (ref.name === 'You') {
    return lookup.ownAgent ? getChampionImage(lookup.ownAgent) || '' : ''
  }
  const champ = ref.name ? lookup.bySummonerName.get(tagStripLower(ref.name)) ?? null : null
  return champ ? getChampionImage(champ) || '' : ''
}

export const lolVodAdapter: VodGameAdapter = {
  id: 'lol',
  label: 'League of Legends',
  // LoL has no rounds — the viewer renders one continuous match timeline.
  supportsRounds: false,
  timelineUnitLabel: 'Moment',
  // LoL offsets are anchored to the in-game clock in electron; no viewer nudge.
  defaultSyncMs: 0,
  extraEventKinds: ['dragon', 'baron', 'herald', 'tower', 'inhibitor', 'ace', 'multikill'],
  portraitImageFor: championPortraitByName,
  legend: [
    { kind: 'kill', label: 'Kill', dotClass: 'bg-emerald-500' },
    { kind: 'death', label: 'Death', dotClass: 'bg-red-500' },
    { kind: 'dragon', label: 'Dragon', dotClass: 'bg-orange-500' },
    { kind: 'baron', label: 'Baron', dotClass: 'bg-violet-500' },
    { kind: 'tower', label: 'Tower', dotClass: 'bg-amber-500' },
  ],
}
