<script setup lang="ts">
import { useVodReview } from '../../composables/useVodReview'
import { getAgentImage } from '../../lib/valorant'
import VodTimelineEventIcon from './VodTimelineEventIcon.vue'

const {
  activeRoundNumber,
  agentByPuuid,
  expandedRoundNumber,
  formatMs,
  formatPlayerLabel,
  getEventSourceImage,
  getKillSourceLabel,
  isSpikeEvent,
  matchScoreline,
  nearEventHighlightClass,
  roundGroups,
  roundLogCollapsed,
  roundLogFilter,
  roundOutcomeIcon,
  roundOutcomeLabel,
  roundRecord,
  seekToEvent,
  seekToRound,
  sidebarEl,
  timeline,
  toggleRoundExpanded,
  visibleRoundEvents,
} = useVodReview()

const previewLimit = 6

function momentPreview(events: ReturnType<typeof visibleRoundEvents>) {
  return events.slice(0, previewLimit)
}

function extraMomentCount(events: ReturnType<typeof visibleRoundEvents>) {
  return Math.max(0, events.length - previewLimit)
}

function opponentAgent(event: { type: string; killerPuuid?: string; victimPuuid?: string }) {
  if (event.type === 'kill') return agentByPuuid(event.victimPuuid)
  if (event.type === 'death') return agentByPuuid(event.killerPuuid)
  return null
}

function opponentName(event: { type: string; killerName?: string; victimName?: string }) {
  if (event.type === 'kill') return event.victimName
  if (event.type === 'death') return event.killerName
  return null
}
</script>

<template>
  <div class="vod-round-log w-48 xl:w-52 flex-shrink-0 border-r border-white/[0.09] flex flex-col overflow-hidden">
    <div class="px-3 py-2.5 border-b border-white/[0.09] flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <div class="min-w-0 flex-1">
          <p class="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Round log</p>
          <p v-if="roundRecord" class="text-[10px] text-gray-600 mt-0.5 tabular-nums">
            {{ roundRecord.total }} rounds
            <template v-if="matchScoreline">
              · <span class="text-white">{{ matchScoreline.ally }}–{{ matchScoreline.enemy }}</span>
            </template>
            <template v-else>
              ·
              <span class="text-emerald-400">{{ roundRecord.wins }}W</span>
              <span class="text-gray-700"> / </span>
              <span class="text-red-400">{{ roundRecord.losses }}L</span>
            </template>
          </p>
        </div>
        <button
          type="button"
          class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-gray-500 transition-colors hover:border-white/[0.14] hover:text-gray-200"
          title="Hide round log (B)"
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
          :class="roundLogFilter === 'mine'
            ? 'bg-red-500/20 text-red-200'
            : 'text-gray-500 hover:text-gray-300'"
          @click="roundLogFilter = 'mine'"
        >My moments</button>
        <button
          type="button"
          class="flex-1 rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-wide transition-colors"
          :class="roundLogFilter === 'all'
            ? 'bg-white/[0.08] text-gray-200'
            : 'text-gray-500 hover:text-gray-300'"
          @click="roundLogFilter = 'all'"
        >Full feed</button>
      </div>
    </div>

    <div ref="sidebarEl" class="flex-1 overflow-y-auto scrollbar-hide scroll-smooth space-y-1 px-1.5 py-2">
      <template v-for="round in roundGroups" :key="round.roundNumber">
        <div
          class="vod-round-card rounded-xl border transition-all"
          :data-round-anchor="round.roundNumber"
          :class="activeRoundNumber === round.roundNumber
            ? 'border-white/[0.14] bg-white/[0.07] shadow-[0_8px_24px_rgba(0,0,0,0.28)]'
            : 'border-transparent bg-transparent hover:border-white/[0.08] hover:bg-white/[0.03]'"
          :style="activeRoundNumber === round.roundNumber
            ? { borderLeftColor: round.won ? 'rgba(52, 211, 153, 0.65)' : 'rgba(248, 113, 113, 0.65)' }
            : undefined"
        >
          <div class="flex items-center gap-1.5 px-2 py-2">
            <img
              v-if="roundOutcomeIcon(round)"
              :src="roundOutcomeIcon(round)!"
              class="h-6 w-6 flex-shrink-0 object-contain opacity-90"
              :title="roundOutcomeLabel(round)"
              alt=""
            >
            <button
              type="button"
              class="inline-flex h-7 min-w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-black/30 px-1.5 text-[10px] font-black tabular-nums transition-colors hover:border-white/[0.16] hover:bg-white/[0.06]"
              :class="round.won ? 'text-emerald-300' : 'text-red-300'"
              :title="`Jump to round ${round.roundNumber + 1}`"
              @click="seekToRound(round)"
            >
              {{ round.roundNumber + 1 }}
            </button>
            <button
              type="button"
              class="min-w-0 flex-1 text-left"
              @click="toggleRoundExpanded(round)"
            >
              <p class="text-[11px] font-semibold text-gray-200 leading-tight truncate">
                {{ roundOutcomeLabel(round) }}
              </p>
              <p class="text-[9px] text-gray-600">
                {{ visibleRoundEvents(round).length }}
                {{ roundLogFilter === 'mine' ? 'moments' : 'events' }}
              </p>
            </button>
            <button
              v-if="visibleRoundEvents(round).length"
              type="button"
              class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-white/[0.06] hover:text-gray-300"
              :title="expandedRoundNumber === round.roundNumber ? 'Collapse' : 'Expand moments'"
              @click.stop="toggleRoundExpanded(round)"
            >
              <svg
                class="h-3.5 w-3.5 transition-transform"
                :class="expandedRoundNumber === round.roundNumber ? 'rotate-180' : ''"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
          </div>

          <div
            v-if="visibleRoundEvents(round).length && expandedRoundNumber !== round.roundNumber"
            class="vod-round-moment-strip flex flex-wrap items-center gap-1 px-2 pb-2"
          >
            <button
              v-for="event in momentPreview(visibleRoundEvents(round))"
              :key="`${event.type}-${event.videoOffsetMs}-preview`"
              type="button"
              class="rounded transition-transform hover:scale-110"
              :title="`Jump to ${formatMs(event.videoOffsetMs)}`"
              @click.stop="seekToEvent(event)"
            >
              <VodTimelineEventIcon
                :type="event.type"
                :game="timeline?.game"
                :first-blood="event.isFirstBlood"
                :source-image="getEventSourceImage(event)"
                size="xs"
              />
            </button>
            <span
              v-if="extraMomentCount(visibleRoundEvents(round))"
              class="text-[8px] font-semibold text-gray-600 tabular-nums"
            >+{{ extraMomentCount(visibleRoundEvents(round)) }}</span>
          </div>

          <div v-if="expandedRoundNumber === round.roundNumber" class="border-t border-white/[0.05] pb-1">
            <button
              v-for="event in visibleRoundEvents(round)"
              :key="`${event.type}-${event.videoOffsetMs}`"
              :data-round-event="`${round.roundNumber}-${event.videoOffsetMs}`"
              class="vod-round-event w-full flex items-center gap-2 px-2 py-1.5 pl-2.5 text-left transition-colors hover:bg-white/[0.05] group"
              :class="nearEventHighlightClass(event)"
              @click="seekToEvent(event)"
            >
              <VodTimelineEventIcon
                :type="event.type"
                :game="timeline?.game"
                :first-blood="event.isFirstBlood"
                :source-image="getEventSourceImage(event)"
                size="sm"
              />

              <template v-if="isSpikeEvent(event)">
                <div class="min-w-0 flex-1">
                  <p
                    class="text-[10px] font-semibold leading-tight truncate"
                    :class="event.type === 'plant' ? 'text-orange-400' : event.type === 'defuse' ? 'text-cyan-400' : 'text-amber-400'"
                  >
                    {{ event.type === 'plant' ? (event.site ? `Plant ${event.site}` : 'Plant') : event.type === 'defuse' ? 'Defuse' : 'Detonate' }}
                  </p>
                  <p v-if="event.planter || event.defuser" class="text-[8px] text-gray-600 truncate">
                    {{ formatPlayerLabel(event.planter || event.defuser) }}
                  </p>
                </div>
              </template>

              <template v-else-if="event.type === 'neutral'">
                <div class="flex min-w-0 flex-1 items-center gap-1">
                  <div class="h-5 w-5 flex-shrink-0 overflow-hidden rounded bg-white/[0.03] ring-1 ring-white/10">
                    <img
                      v-if="agentByPuuid(event.killerPuuid)"
                      :src="getAgentImage(agentByPuuid(event.killerPuuid))"
                      class="h-full w-full object-contain opacity-50"
                      alt=""
                    >
                  </div>
                  <svg class="h-2 w-2 flex-shrink-0 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
                  </svg>
                  <div class="h-5 w-5 flex-shrink-0 overflow-hidden rounded bg-white/[0.03] ring-1 ring-white/10">
                    <img
                      v-if="agentByPuuid(event.victimPuuid)"
                      :src="getAgentImage(agentByPuuid(event.victimPuuid))"
                      class="h-full w-full object-contain opacity-40"
                      alt=""
                    >
                  </div>
                  <p class="min-w-0 flex-1 text-[9px] text-gray-600 truncate">
                    {{ event.killerName || '?' }} → {{ event.victimName || '?' }}
                  </p>
                </div>
              </template>

              <template v-else>
                <div
                  class="h-6 w-6 flex-shrink-0 overflow-hidden rounded-md bg-white/[0.04] ring-1"
                  :class="event.type === 'kill' ? 'ring-teal-500/30' : 'ring-red-500/30'"
                >
                  <img
                    v-if="opponentAgent(event)"
                    :src="getAgentImage(opponentAgent(event))"
                    class="h-full w-full object-contain opacity-90"
                    alt=""
                  >
                </div>
                <div class="min-w-0 flex-1">
                  <p
                    class="text-[11px] leading-tight truncate"
                    :class="event.type === 'kill' ? 'text-gray-300 group-hover:text-white' : 'text-gray-500 group-hover:text-gray-300'"
                  >
                    {{ opponentName(event) }}
                  </p>
                  <p v-if="getKillSourceLabel(event)" class="text-[8px] text-gray-600 truncate capitalize">
                    {{ getKillSourceLabel(event) }}
                  </p>
                </div>
              </template>

              <span class="flex-shrink-0 text-[9px] tabular-nums text-gray-600">{{ formatMs(event.videoOffsetMs) }}</span>
            </button>

            <p
              v-if="!visibleRoundEvents(round).length"
              class="px-3 py-2 text-center text-[10px] text-gray-600"
            >
              No {{ roundLogFilter === 'mine' ? 'personal moments' : 'events' }} this round
            </p>
          </div>
        </div>
      </template>

      <div v-if="!roundGroups.length" class="px-3 py-4 text-center">
        <p class="text-xs text-gray-600">No timeline data</p>
      </div>
    </div>
  </div>
</template>
