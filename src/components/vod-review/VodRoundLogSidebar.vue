<script setup lang="ts">
import { plural } from '../../lib/plural'
import { uiV3 } from '../../lib/ui-v3'
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
<template v-if="uiV3">
  <div class="vod-round-log rl3">
    <div class="rl3-head">
      <div class="rl3-title">
        <span class="uf-label">Round log</span>
        <button type="button" class="rl3-ib" aria-label="Hide round log" title="Hide round log (B)" @click="roundLogCollapsed = true">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 20 20"><path stroke-width="1.75" d="m12.5 5.5-5 4.5 5 4.5"/></svg>
        </button>
      </div>
      <p v-if="roundRecord" class="rl3-score">
        <template v-if="matchScoreline"><span class="uf-d4">{{ matchScoreline.ally }}–{{ matchScoreline.enemy }}</span></template>
        <template v-else><span class="uf-d4" style="color: var(--uf-win)">{{ roundRecord.wins }}</span><span class="uf-d4" style="color: var(--uf-faint)">–</span><span class="uf-d4" style="color: var(--uf-loss)">{{ roundRecord.losses }}</span></template>
        <span class="uf-t4">{{ plural(roundRecord.total, 'round') }}</span>
      </p>
      <div class="rl3-filter" role="tablist" aria-label="Round log filter">
        <button type="button" role="tab" :aria-selected="roundLogFilter === 'mine'" :class="{ on: roundLogFilter === 'mine' }" @click="roundLogFilter = 'mine'">My moments</button>
        <button type="button" role="tab" :aria-selected="roundLogFilter === 'all'" :class="{ on: roundLogFilter === 'all' }" @click="roundLogFilter = 'all'">Full feed</button>
      </div>
    </div>

    <div ref="sidebarEl" class="rl3-list scrollbar-hide">
      <div
        v-for="round in roundGroups"
        :key="round.roundNumber"
        class="vod-round-card rl3-round"
        :class="{ 'rl3-round--on': activeRoundNumber === round.roundNumber, 'rl3-round--won': round.won, 'rl3-round--lost': !round.won }"
        :data-round-anchor="round.roundNumber"
      >
        <div class="rl3-row">
          <button type="button" class="rl3-num uf-num" :aria-label="`Jump to round ${round.roundNumber + 1}`" :title="`Jump to round ${round.roundNumber + 1}`" @click="seekToRound(round)">{{ round.roundNumber + 1 }}</button>
          <button type="button" class="rl3-what" :aria-expanded="expandedRoundNumber === round.roundNumber" @click="toggleRoundExpanded(round)">
            <span class="uf-t3">{{ roundOutcomeLabel(round) }}</span>
            <span class="uf-t4">{{ visibleRoundEvents(round).length }} {{ roundLogFilter === 'mine' ? 'moments' : 'events' }}</span>
          </button>
          <img v-if="roundOutcomeIcon(round)" :src="roundOutcomeIcon(round)!" class="rl3-icon" :title="roundOutcomeLabel(round)" alt="">
        </div>

        <div v-if="visibleRoundEvents(round).length && expandedRoundNumber !== round.roundNumber" class="vod-round-moment-strip rl3-strip">
          <button v-for="event in momentPreview(visibleRoundEvents(round))" :key="`${event.type}-${event.videoOffsetMs}-preview`" type="button" :aria-label="`Jump to ${formatMs(event.videoOffsetMs)}`" :title="`Jump to ${formatMs(event.videoOffsetMs)}`" @click.stop="seekToEvent(event)">
            <VodTimelineEventIcon :type="event.type" :game="timeline?.game" :first-blood="event.isFirstBlood" :source-image="getEventSourceImage(event)" size="xs" />
          </button>
          <span v-if="extraMomentCount(visibleRoundEvents(round))" class="uf-t4 uf-num">+{{ extraMomentCount(visibleRoundEvents(round)) }}</span>
        </div>

        <div v-if="expandedRoundNumber === round.roundNumber" class="rl3-events">
          <button
            v-for="event in visibleRoundEvents(round)"
            :key="`${event.type}-${event.videoOffsetMs}`"
            type="button"
            :data-round-event="`${round.roundNumber}-${event.videoOffsetMs}`"
            class="vod-round-event rl3-event"
            :class="nearEventHighlightClass(event)"
            @click="seekToEvent(event)"
          >
            <VodTimelineEventIcon :type="event.type" :game="timeline?.game" :first-blood="event.isFirstBlood" :source-image="getEventSourceImage(event)" size="sm" />
            <span class="rl3-ev-text">
              <template v-if="isSpikeEvent(event)">
                <span class="rl3-ev-main">{{ event.type === 'plant' ? (event.site ? `Plant ${event.site}` : 'Plant') : event.type === 'defuse' ? 'Defuse' : 'Detonate' }}</span>
                <span v-if="event.planter || event.defuser" class="uf-t4">{{ formatPlayerLabel(event.planter || event.defuser) }}</span>
              </template>
              <template v-else-if="event.type === 'neutral'">
                <span class="rl3-ev-main" style="color: var(--uf-muted)">{{ event.killerName || '?' }} → {{ event.victimName || '?' }}</span>
              </template>
              <template v-else>
                <span class="rl3-ev-main" :style="{ color: event.type === 'kill' ? 'var(--uf-bone)' : 'var(--uf-muted)' }">{{ event.type === 'kill' ? 'Killed' : 'Died to' }} {{ opponentName(event) }}</span>
                <span v-if="getKillSourceLabel(event)" class="uf-t4" style="text-transform: capitalize">{{ getKillSourceLabel(event) }}</span>
              </template>
            </span>
            <img v-if="!isSpikeEvent(event) && event.type !== 'neutral' && opponentAgent(event)" :src="getAgentImage(opponentAgent(event))" class="rl3-agent" alt="">
            <span class="uf-t4 uf-num">{{ formatMs(event.videoOffsetMs) }}</span>
          </button>
          <p v-if="!visibleRoundEvents(round).length" class="uf-t4" style="padding: 8px 0; margin: 0">No {{ roundLogFilter === 'mine' ? 'personal moments' : 'events' }} this round</p>
        </div>
      </div>

      <div v-if="!roundGroups.length" class="rl3-empty">
        <span class="uf-label">No timeline data</span>
        <p class="uf-t4">This match has no round events yet.</p>
      </div>
    </div>
  </div>
</template>
<template v-else>
  <div class="vod-round-log w-48 xl:w-52 flex-shrink-0 border-r border-white/[0.09] flex flex-col overflow-hidden">
    <div class="px-3 py-2.5 border-b border-white/[0.09] flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <div class="min-w-0 flex-1">
          <p class="text-[12px] font-black uppercase tracking-[0.2em] text-gray-400">Round log</p>
          <p v-if="roundRecord" class="text-[12px] text-gray-400 mt-0.5 tabular-nums">
            {{ roundRecord.total }} rounds
            <template v-if="matchScoreline">
              · <span class="text-white">{{ matchScoreline.ally }}–{{ matchScoreline.enemy }}</span>
            </template>
            <template v-else>
              ·
              <span class="text-emerald-400">{{ roundRecord.wins }}W</span>
              <span class="text-gray-400"> / </span>
              <span class="text-red-400">{{ roundRecord.losses }}L</span>
            </template>
          </p>
        </div>
        <button
          type="button"
          class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-gray-400 transition-colors hover:border-white/[0.14] hover:text-gray-200"
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
          class="flex-1 rounded-md px-2 py-1 text-[12px] font-bold uppercase tracking-wide transition-colors"
          :class="roundLogFilter === 'mine'
            ? 'bg-red-500/20 text-red-200'
            : 'text-gray-400 hover:text-gray-300'"
          @click="roundLogFilter = 'mine'"
        >My moments</button>
        <button
          type="button"
          class="flex-1 rounded-md px-2 py-1 text-[12px] font-bold uppercase tracking-wide transition-colors"
          :class="roundLogFilter === 'all'
            ? 'bg-white/[0.08] text-gray-200'
            : 'text-gray-400 hover:text-gray-300'"
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
              class="inline-flex h-7 min-w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-black/30 px-1.5 text-[12px] font-black tabular-nums transition-colors hover:border-white/[0.16] hover:bg-white/[0.06]"
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
              <p class="text-[13px] font-semibold text-gray-200 leading-tight truncate">
                {{ roundOutcomeLabel(round) }}
              </p>
              <p class="text-[12px] text-gray-400">
                {{ visibleRoundEvents(round).length }}
                {{ roundLogFilter === 'mine' ? 'moments' : 'events' }}
              </p>
            </button>
            <button
              v-if="visibleRoundEvents(round).length"
              type="button"
              class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-300"
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
              class="text-[13px] font-semibold text-gray-400 tabular-nums"
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
                    class="text-[12px] font-semibold leading-tight truncate"
                    :class="event.type === 'plant' ? 'text-orange-400' : event.type === 'defuse' ? 'text-cyan-400' : 'text-amber-400'"
                  >
                    {{ event.type === 'plant' ? (event.site ? `Plant ${event.site}` : 'Plant') : event.type === 'defuse' ? 'Defuse' : 'Detonate' }}
                  </p>
                  <p v-if="event.planter || event.defuser" class="text-[13px] text-gray-400 truncate">
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
                  <svg class="h-2 w-2 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  <p class="min-w-0 flex-1 text-[12px] text-gray-400 truncate">
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
                    class="text-[13px] leading-tight truncate"
                    :class="event.type === 'kill' ? 'text-gray-300 group-hover:text-white' : 'text-gray-400 group-hover:text-gray-300'"
                  >
                    {{ opponentName(event) }}
                  </p>
                  <p v-if="getKillSourceLabel(event)" class="text-[13px] text-gray-400 truncate capitalize">
                    {{ getKillSourceLabel(event) }}
                  </p>
                </div>
              </template>

              <span class="flex-shrink-0 text-[12px] tabular-nums text-gray-400">{{ formatMs(event.videoOffsetMs) }}</span>
            </button>

            <p
              v-if="!visibleRoundEvents(round).length"
              class="px-3 py-2 text-center text-[12px] text-gray-400"
            >
              No {{ roundLogFilter === 'mine' ? 'personal moments' : 'events' }} this round
            </p>
          </div>
        </div>
      </template>

      <div v-if="!roundGroups.length" class="px-3 py-4 text-center">
        <p class="text-xs text-gray-400">No timeline data</p>
      </div>
    </div>
  </div>
</template>
</template>

<style scoped>
.rl3 { width: 236px; flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden; border-right: 1px solid var(--uf-line); background: var(--uf-bg); }
.rl3-head { display: flex; flex-direction: column; gap: 10px; padding: 16px 16px 12px 20px; border-bottom: 1px solid var(--uf-line); }
.rl3-title { display: flex; align-items: center; justify-content: space-between; }
.rl3-score { display: flex; align-items: baseline; gap: 4px; margin: 0; }
.rl3-score .uf-t4 { margin-left: 8px; }
.rl3-ib { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; background: none; border: 0; color: var(--uf-faint); cursor: pointer; }
.rl3-ib:hover { color: var(--uf-bone); background: var(--uf-hover); }
.rl3-filter { display: flex; border-bottom: 1px solid var(--uf-line); }
.rl3-filter button { flex: 1; height: 30px; background: none; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; color: var(--uf-faint); cursor: pointer; font: 600 12px/1 var(--uf-body); letter-spacing: 0.08em; text-transform: uppercase; }
.rl3-filter button:hover { color: var(--uf-bone); }
.rl3-filter button.on { color: var(--uf-bone); border-bottom-color: var(--uf-red); }
.rl3-list { flex: 1; overflow-y: auto; scroll-behavior: smooth; }
.rl3-round { border-bottom: 1px solid var(--uf-line); box-shadow: inset 3px 0 0 transparent; }
.rl3-round--won { box-shadow: inset 3px 0 0 rgba(34, 169, 155, 0.35); }
.rl3-round--lost { box-shadow: inset 3px 0 0 rgba(232, 80, 91, 0.35); }
.rl3-round--on { background: var(--uf-raised); }
.rl3-round--on.rl3-round--won { box-shadow: inset 3px 0 0 var(--uf-win); }
.rl3-round--on.rl3-round--lost { box-shadow: inset 3px 0 0 var(--uf-loss); }
.rl3-row { display: flex; align-items: center; gap: 8px; padding: 8px 12px 8px 14px; }
.rl3-num { width: 30px; height: 30px; flex: none; background: none; border: 1px solid var(--uf-line); color: var(--uf-bone); cursor: pointer; font: 600 15px/1 var(--uf-body); font-variant-numeric: tabular-nums; }
.rl3-num:hover { border-color: var(--uf-line-2); background: var(--uf-hover); }
.rl3-what { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; text-align: left; background: none; border: 0; padding: 0; cursor: pointer; }
.rl3-what .uf-t3 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rl3-icon { width: 20px; height: 20px; object-fit: contain; opacity: 0.75; flex: none; }
.rl3-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 0 12px 10px 52px; }
.rl3-strip button { background: none; border: 0; padding: 0; cursor: pointer; }
.rl3-events { padding: 0 0 6px; }
.rl3-event { width: 100%; display: flex; align-items: center; gap: 8px; padding: 6px 12px 6px 18px; text-align: left; background: none; border: 0; border-top: 1px solid var(--uf-line); cursor: pointer; }
.rl3-event:hover { background: var(--uf-hover); }
.rl3-ev-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.rl3-ev-main { font: 400 13px/1.35 var(--uf-body); color: var(--uf-bone); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rl3-agent { width: 22px; height: 22px; object-fit: contain; flex: none; }
.rl3-empty { display: flex; flex-direction: column; gap: 6px; padding: 18px 20px; }
.rl3-empty p { margin: 0; }
</style>
