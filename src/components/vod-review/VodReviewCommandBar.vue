<script setup lang="ts">
import { ref } from 'vue'
import { useVodReview } from '../../composables/useVodReview'

defineProps<{ workspace?: boolean; canCompare?: boolean }>()
const emit = defineEmits<{ 'toggle-workspace': []; 'reset-layout': []; compare: [] }>()
const layoutMenu = ref<HTMLDetailsElement | null>(null)
function closeLayoutMenu() {
  if (layoutMenu.value) layoutMenu.value.open = false
}

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
    <div class="vod-command-bar flex-shrink-0 border-b border-white/[0.08]" :class="{ 'workspace-command-bar': workspace }" @keydown.stop>
      <div class="review-toolbar-row flex flex-wrap items-center gap-3 px-3 py-2">
        <button
          type="button"
          class="vod-toolbar-btn flex-shrink-0"
          @click="$router.back()"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
          Back
        </button>

        <div class="flex items-center gap-2.5 flex-1 min-w-0">
          <div
            class="relative h-10 w-10 flex-shrink-0 rounded-lg overflow-hidden border border-white/[0.1] bg-black/40"
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
            <p class="text-sm font-bold text-white truncate leading-tight">
              {{ timeline?.agent || 'Match replay' }}<span v-if="timeline?.map" class="text-gray-500 font-medium"> · {{ timeline.map }}</span>
            </p>
            <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span
                v-if="displayGameMode"
                class="text-[11px] text-gray-400"
              >{{ displayGameMode }}</span>
              <span v-if="matchScoreline" class="sm:hidden text-[11px] text-gray-400 tabular-nums">{{ matchScoreline.ally }}–{{ matchScoreline.enemy }}</span>
              <span v-else-if="roundRecord" class="text-[11px] text-gray-400 tabular-nums">{{ roundRecord.wins }}W · {{ roundRecord.losses }}L</span>
            </div>
          </div>
        </div>

        <div
          v-if="matchScoreline || timeline?.finalStats"
          class="hidden sm:flex items-center gap-2.5 flex-shrink-0 px-2 py-1.5"
        >
          <template v-if="matchScoreline">
            <span class="text-lg font-black tabular-nums" :class="matchScoreline.ally > matchScoreline.enemy ? 'text-green-400' : 'text-white'">{{ matchScoreline.ally }}</span>
            <span class="text-[10px] font-bold text-gray-600">:</span>
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

        <div class="review-toolbar-actions flex items-center gap-1.5 flex-wrap ml-auto">
          <button
            v-if="!theaterMode && roundGroups.length"
            type="button"
            class="vod-toolbar-btn"
            :aria-pressed="!roundLogCollapsed"
            :class="roundLogCollapsed ? '' : 'vod-toolbar-btn--active'"
            :title="roundLogCollapsed ? 'Show round log (B)' : 'Hide round log (B)'"
            @click="roundLogCollapsed = !roundLogCollapsed"
          >
            Rounds
          </button>
          <button
            v-if="hasSpatialIntel"
            type="button"
            class="vod-toolbar-btn"
            :aria-pressed="spatialMapVisible"
            :class="spatialMapVisible ? 'vod-toolbar-btn--active' : ''"
            @click="toggleSidePanelTab('map')"
          >
            Map
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
            class="vod-toolbar-btn"
            title="Trim local recording file"
            @click="openVodTrim"
          >
            Trim
          </button>
          <button
            v-if="timeline?.videoPath"
            type="button"
            class="vod-toolbar-btn"
            :aria-pressed="theaterMode"
            :class="theaterMode ? 'vod-toolbar-btn--active' : ''"
            :title="theaterMode ? 'Exit theater (T)' : 'Theater mode (T)'"
            @click="toggleTheaterMode"
          >
            {{ workspace ? (theaterMode ? 'Restore panels' : 'Focus video') : (theaterMode ? 'Exit' : 'Theater') }}
          </button>
          <button
            class="vod-toolbar-btn relative"
            :aria-pressed="showInsightsPanel"
            :class="showInsightsPanel ? 'vod-toolbar-btn--active' : ''"
            :title="hasCoachFeedback ? 'Coach notes (C) · Review notes (N)' : 'Review notes (N)'"
            @click="toggleSidePanelTab('notes')"
          >
            Notes
            <span
              v-if="hasCoachFeedback && !showInsightsPanel"
              class="h-1.5 w-1.5 rounded-full bg-red-400"
              title="Coach feedback available"
            />
          </button>
          <button
            type="button"
            class="vod-toolbar-btn w-8 justify-center px-0"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            @click="showShortcuts = true"
          >?</button>
          <button v-if="canCompare" type="button" class="vod-toolbar-btn review-compare-button" @click="emit('compare')">Compare moments</button>
          <details v-if="workspace" ref="layoutMenu" class="workspace-layout-menu" @keydown.esc="closeLayoutMenu">
            <summary>Layout</summary>
            <div class="workspace-menu-actions" @click="closeLayoutMenu">
              <button type="button" @click="emit('reset-layout')">Reset layout</button>
              <button type="button" @click="emit('toggle-workspace')">Use classic layout</button>
            </div>
          </details>
          <button v-else type="button" class="workspace-preview-toggle" @click="emit('toggle-workspace')">Try workspace</button>
        </div>
      </div>
    </div>
</template>

<style scoped>
.workspace-preview-toggle, .workspace-layout-menu summary { padding: 7px 10px; color: #cbd1da; font-size: 12px; cursor: pointer; }
.workspace-layout-menu { position: relative; flex-shrink: 0; }
.workspace-menu-actions { position: absolute; top: 100%; right: 0; z-index: 40; display: grid; width: 180px; padding: 5px; background: #1b1e25; border: 1px solid #ffffff25; border-radius: 6px; box-shadow: 0 8px 24px #0008; }
.workspace-menu-actions button { padding: 10px; text-align: left; color: #cbd1da; font-size: 12px; border-radius: 3px; }
.workspace-menu-actions button:hover { color: #fff; background: #ffffff0d; }
.vod-command-bar .vod-toolbar-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 5px 9px; border: 1px solid #ffffff1a; border-radius: 4px; background: #ffffff05; color: #aab2bf; font-size: 12px; font-weight: 600; }
.vod-command-bar .vod-toolbar-btn:hover { border-color: #ffffff40; color: #fff; }
.vod-command-bar .vod-toolbar-btn--active { border-color: #e11d4860; background: #e11d4812; color: #fecdd3; }
.vod-command-bar :is(button, summary):focus-visible { outline: 2px solid #e11d48; outline-offset: 2px; }
.vod-command-bar .review-compare-button { background: #e11d48; border-color: #e11d48; color: white; }
.vod-command-bar .review-compare-button:hover { background: #be123c; border-color: #be123c; }
.workspace-layout-menu summary, .workspace-preview-toggle { min-height: 36px; display: flex; align-items: center; border: 1px solid #ffffff1a; border-radius: 4px; }
@container review-workspace (max-width: 1100px) {
  .review-toolbar-actions { width: 100%; margin-left: 0; padding-top: 6px; border-top: 1px solid #ffffff0d; }
}
</style>
