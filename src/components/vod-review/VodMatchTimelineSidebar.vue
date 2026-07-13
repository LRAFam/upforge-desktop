<script setup lang="ts">
import { computed } from 'vue'
import { useVodReview } from '../../composables/useVodReview'
import VodTimelineEventIcon from './VodTimelineEventIcon.vue'

/**
 * Flat, continuous match-event feed for games without rounds (LoL, Deadlock).
 * Mirrors the round-log sidebar chrome but lists every moment in one timeline.
 */
const {
  allTimelineEvents,
  eventOpponentImage,
  formatMs,
  getKillSourceLabel,
  nearEventHighlightClass,
  roundLogCollapsed,
  roundLogFilter,
  seekToEvent,
  timeline,
} = useVodReview()

type FlatEvent = (typeof allTimelineEvents)['value'][number]

const OBJECTIVE_KINDS = new Set(['dragon', 'baron', 'herald', 'tower', 'inhibitor', 'ace', 'multikill'])

const events = computed<FlatEvent[]>(() => {
  const all = allTimelineEvents.value
  if (roundLogFilter.value === 'mine') {
    return all.filter(e => e.type === 'kill' || e.type === 'death')
  }
  return all
})

function eventTitle(event: FlatEvent): string {
  if (event.type === 'kill') return event.victimName || 'Kill'
  if (event.type === 'death') return event.killerName || 'Death'
  if (event.type === 'neutral') return `${event.killerName || '?'} → ${event.victimName || '?'}`
  if (OBJECTIVE_KINDS.has(event.type)) {
    const name = event.type.charAt(0).toUpperCase() + event.type.slice(1)
    let label = event.detail ? `${name} · ${event.detail}` : name
    if (event.stolen) label += ' (Stolen)'
    return label
  }
  return 'Event'
}

function titleClass(event: FlatEvent): string {
  if (event.type === 'kill') return 'text-gray-200 group-hover:text-white'
  if (event.type === 'death') return 'text-gray-400 group-hover:text-gray-200'
  return 'text-gray-500 group-hover:text-gray-300'
}
</script>

<template>
  <div class="vod-round-log w-48 xl:w-52 flex-shrink-0 border-r border-white/[0.09] flex flex-col overflow-hidden">
    <div class="px-3 py-2.5 border-b border-white/[0.09] flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <div class="min-w-0 flex-1">
          <p class="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Match timeline</p>
          <p class="text-[10px] text-gray-600 mt-0.5 tabular-nums">
            {{ events.length }} {{ roundLogFilter === 'mine' ? 'moments' : 'events' }}
          </p>
        </div>
        <button
          type="button"
          class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-gray-500 transition-colors hover:border-white/[0.14] hover:text-gray-200"
          title="Hide timeline (B)"
          @click="roundLogCollapsed = true"
        >
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 20 20">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="m12.5 5.5-5 4.5 5 4.5"/>
          </svg>
        </button>
      </div>

      <div class="flex items-center gap-1 p-0.5 rounded-lg bg-black/30 border border-white/[0.06]">
        <button
          type="button"
          class="flex-1 rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-wide transition-colors"
          :class="roundLogFilter === 'mine' ? 'bg-red-500/20 text-red-200' : 'text-gray-500 hover:text-gray-300'"
          @click="roundLogFilter = 'mine'"
        >My moments</button>
        <button
          type="button"
          class="flex-1 rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-wide transition-colors"
          :class="roundLogFilter === 'all' ? 'bg-white/[0.08] text-gray-200' : 'text-gray-500 hover:text-gray-300'"
          @click="roundLogFilter = 'all'"
        >Full feed</button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto scrollbar-hide scroll-smooth space-y-0.5 px-1.5 py-2">
      <button
        v-for="event in events"
        :key="`${event.type}-${event.videoOffsetMs}`"
        class="vod-round-event w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05] group"
        :class="nearEventHighlightClass(event)"
        @click="seekToEvent(event)"
      >
        <VodTimelineEventIcon
          :type="event.type"
          :game="timeline?.game"
          :first-blood="event.isFirstBlood"
          :source-image="eventOpponentImage(event) || undefined"
          size="sm"
        />
        <div class="min-w-0 flex-1">
          <p class="text-[11px] leading-tight truncate" :class="titleClass(event)">
            {{ eventTitle(event) }}
          </p>
          <p v-if="getKillSourceLabel(event)" class="text-[8px] text-gray-600 truncate capitalize">
            {{ getKillSourceLabel(event) }}
          </p>
        </div>
        <span class="flex-shrink-0 text-[9px] tabular-nums text-gray-600">{{ formatMs(event.videoOffsetMs) }}</span>
      </button>

      <div v-if="!events.length" class="px-3 py-4 text-center">
        <p class="text-xs text-gray-600">No timeline data</p>
      </div>
    </div>
  </div>
</template>
