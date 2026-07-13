import { computed, type Ref } from 'vue'
import {
  buildPlayerLookup,
  getVodAdapter,
  type VodGameAdapter,
  type VodPlayerLookup,
  type VodPlayerRef,
} from '../../lib/vod-games'

/** Minimal timeline shape needed to resolve portraits (decoupled from useVodReview). */
interface PortraitTimelineLike {
  game?: string | null
  agent?: string | null
  teamSnapshot?: Array<{ summonerName?: string | null; agent?: string | null; puuid?: string | null }>
}

/** Minimal event shape needed to resolve killer/victim portraits. */
interface PortraitEventLike {
  type?: string
  killerName?: string | null
  victimName?: string | null
  killerPuuid?: string | null
  victimPuuid?: string | null
}

/**
 * Game-aware portrait resolution for the VOD viewer.
 *
 * Valorant/CS2/Deadlock key portraits by puuid -> agent; LoL keys by name ->
 * champion (the Live Client feed has no puuids). All the game-specific logic
 * lives in the per-game adapter (see `src/lib/vod-games`).
 */
export function useVodPortraits(timeline: Ref<PortraitTimelineLike | null>) {
  const vodAdapter = computed<VodGameAdapter>(() => getVodAdapter(timeline.value?.game))
  const isRoundBased = computed(() => vodAdapter.value.supportsRounds)
  const playerLookup = computed<VodPlayerLookup>(() =>
    buildPlayerLookup(timeline.value?.teamSnapshot, timeline.value?.agent),
  )

  function portraitForRef(ref: VodPlayerRef): string {
    return vodAdapter.value.portraitImageFor(ref, playerLookup.value)
  }

  function eventKillerImage(event: PortraitEventLike): string {
    return portraitForRef({ name: event.killerName, puuid: event.killerPuuid })
  }

  function eventVictimImage(event: PortraitEventLike): string {
    return portraitForRef({ name: event.victimName, puuid: event.victimPuuid })
  }

  /** Portrait of the "other" player: victim for a kill, killer for a death, securer for an objective. */
  function eventOpponentImage(event: PortraitEventLike): string {
    if (event.type === 'kill') return eventVictimImage(event)
    if (event.type === 'death') return eventKillerImage(event)
    // Objectives (dragon/baron/etc.): show the champion that secured it, if resolvable.
    if (event.killerName) return eventKillerImage(event)
    return ''
  }

  return {
    vodAdapter,
    isRoundBased,
    playerLookup,
    portraitForRef,
    eventKillerImage,
    eventVictimImage,
    eventOpponentImage,
  }
}
