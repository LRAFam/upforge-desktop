<script setup lang="ts">
import { useVodReview } from '../../composables/useVodReview'

const {
  activeRoundNumber,
  agentAccentStyle,
  agentImageUrl,
  canTrimLocalVod,
  displayGameMode,
  hasCoachFeedback,
  hasSpatialIntel,
  mapPosterUrl,
  matchScoreline,
  openVodTrim,
  roundGroups,
  roundLogCollapsed,
  roundRecord,
  router,
  showInsightsPanel,
  showShortcuts,
  spatialMapVisible,
  theaterMode,
  timeline,
  toggleSidePanelTab,
  toggleTheaterMode,
} = useVodReview()
</script>

<template>
<!-- Broadcast command bar -->
    <div class="vod-command-bar flex-shrink-0 border-b border-white/[0.08]">
      <div class="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          class="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors text-xs flex-shrink-0"
          @click="$router.back()"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
          Back
        </button>

        <div class="flex items-center gap-2.5 flex-1 min-w-0">
          <div
            class="relative h-11 w-11 flex-shrink-0 rounded-xl overflow-hidden border border-white/[0.1] bg-black/40"
            :style="agentAccentStyle"
          >
            <img
              v-if="mapPosterUrl"
              :src="mapPosterUrl"
              class="absolute inset-0 h-full w-full object-cover opacity-25"
              alt=""
            />
            <img
              v-if="agentImageUrl"
              :src="agentImageUrl"
              class="relative h-full w-full object-contain p-1"
              alt=""
            />
          </div>
          <div class="min-w-0">
            <p class="text-[9px] font-black uppercase tracking-[0.28em] text-red-400/90">Session Review</p>
            <p class="text-sm font-bold text-white truncate leading-tight">
              {{ timeline?.agent || 'Match replay' }}<span v-if="timeline?.map" class="text-gray-500 font-medium"> · {{ timeline.map }}</span>
            </p>
            <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span
                v-if="displayGameMode"
                class="text-[9px] font-bold px-1.5 py-px rounded border border-white/[0.08] bg-white/[0.04] text-gray-500 uppercase tracking-wide"
              >{{ displayGameMode }}</span>
              <span v-if="matchScoreline" class="text-[9px] text-gray-600 tabular-nums">{{ matchScoreline.ally }}–{{ matchScoreline.enemy }}</span>
              <span v-else-if="roundRecord" class="text-[9px] text-gray-600 tabular-nums">{{ roundRecord.wins }}W · {{ roundRecord.losses }}L</span>
            </div>
          </div>
        </div>

        <div
          v-if="matchScoreline || timeline?.finalStats"
          class="hidden sm:flex items-center gap-2.5 flex-shrink-0 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-1.5"
        >
          <template v-if="matchScoreline">
            <span class="text-lg font-black tabular-nums" :class="matchScoreline.ally > matchScoreline.enemy ? 'text-green-400' : 'text-white'">{{ matchScoreline.ally }}</span>
            <span class="text-[10px] font-bold text-gray-600">—</span>
            <span class="text-lg font-black tabular-nums" :class="matchScoreline.enemy > matchScoreline.ally ? 'text-green-400' : 'text-gray-400'">{{ matchScoreline.enemy }}</span>
          </template>
          <span v-if="matchScoreline && timeline?.finalStats" class="h-4 w-px bg-white/[0.08]" />
          <div v-if="timeline?.finalStats" class="flex items-center gap-1.5 text-xs tabular-nums">
            <span class="font-bold text-green-400">{{ timeline.finalStats.kills }}</span>
            <span class="text-gray-700">/</span>
            <span class="font-bold text-red-400">{{ timeline.finalStats.deaths }}</span>
            <span class="text-gray-700">/</span>
            <span class="font-bold text-blue-400">{{ timeline.finalStats.assists }}</span>
          </div>
        </div>

        <div class="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end ml-auto">
          <button
            v-if="!theaterMode && roundGroups.length"
            type="button"
            class="vod-toolbar-btn hidden lg:inline-flex"
            :class="roundLogCollapsed ? '' : 'vod-toolbar-btn--active'"
            :title="roundLogCollapsed ? 'Show round log (B)' : 'Hide round log (B)'"
            @click="roundLogCollapsed = !roundLogCollapsed"
          >
            {{ roundLogCollapsed ? 'Log' : 'Log on' }}
          </button>
          <button
            v-if="hasSpatialIntel"
            type="button"
            class="vod-toolbar-btn"
            :class="spatialMapVisible ? 'vod-toolbar-btn--active' : ''"
            @click="toggleSidePanelTab('map')"
          >
            {{ spatialMapVisible ? 'Map on' : 'Map' }}
          </button>
          <span
            v-if="activeRoundNumber != null"
            class="hidden md:inline-flex items-center rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400"
          >
            R{{ activeRoundNumber + 1 }}
          </span>
          <button
            v-if="canTrimLocalVod"
            type="button"
            class="vod-toolbar-btn hidden sm:inline-flex"
            title="Trim local recording file"
            @click="openVodTrim"
          >
            Trim
          </button>
          <button
            v-if="timeline?.videoPath"
            type="button"
            class="vod-toolbar-btn hidden sm:inline-flex"
            :class="theaterMode ? 'vod-toolbar-btn--active' : ''"
            :title="theaterMode ? 'Exit theater (T)' : 'Theater mode (T)'"
            @click="toggleTheaterMode"
          >
            {{ theaterMode ? 'Exit' : 'Theater' }}
          </button>
          <button
            class="vod-toolbar-btn relative"
            :class="showInsightsPanel ? 'vod-toolbar-btn--active' : ''"
            :title="hasCoachFeedback ? 'Coach notes (C) · Review notes (N)' : 'Review notes (N)'"
            @click="toggleSidePanelTab('notes')"
          >
            {{ showInsightsPanel ? 'Notes on' : 'Notes' }}
            <span
              v-if="hasCoachFeedback && !showInsightsPanel"
              class="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]"
              title="Coach feedback available"
            />
          </button>
          <button
            type="button"
            class="vod-toolbar-btn w-8 justify-center px-0"
            title="Keyboard shortcuts (?)"
            @click="showShortcuts = true"
          >?</button>
        </div>
      </div>
    </div>
</template>
