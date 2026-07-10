<script setup lang="ts">
import { computed } from 'vue'
import { useVodReview } from '../../composables/useVodReview'
import MatchSpatialMinimap from '../MatchSpatialMinimap.vue'
import TacticalIntelBrief from '../TacticalIntelBrief.vue'
import DuelMomentScrubberBands from '../analysis/DuelMomentScrubberBands.vue'
import DuelMomentCards from '../analysis/DuelMomentCards.vue'
import { getAgentImage, getAbilityIcon } from '../../lib/valorant'
import VodRoundLogSidebar from './VodRoundLogSidebar.vue'
import VodDemoPendingPanel from './VodDemoPendingPanel.vue'
import VodTimelineEventIcon from './VodTimelineEventIcon.vue'
import { recordingTimelineReady, usesAsyncDemoSync } from '../../lib/recording-demo-status'

const {
  abilityCastSlots,
  activeEventNotif,
  activeRoundNumber,
  activeRoundSegment,
  activeSpatialDisplayIndex,
  activeSpatialIndex,
  activeSpatialToast,
  agentByPuuid,
  availableSpatialRounds,
  canRefreshCloudPlayback,
  canSeekFromSpatial,
  activeCoachNoteId,
  coachReview,
  coachProgressMarkers,
  currentTime,
  cursorHidden,
  cycleSpeed,
  displaySpatialSummary,
  dockChipsEl,
  duration,
  duelMoments,
  activeDuelMomentId,
  seekDuelMoment,
  onDuelMomentBandSelect,
  hasDuelMoments,
  formatMs,
  formatPlayerLabel,
  formatSeconds,
  getAbilityKillIcon,
  getEventSourceImage,
  getKillSourceLabel,
  getRankColor,
  getWeaponIcon,
  hasSpatialIntel,
  hasCoachFeedback,
  hoverRoundLabel,
  hoverTime,
  isFullscreen,
  isCloudVideo,
  isMuted,
  isNearEvent,
  isPlaying,
  isSpikeEvent,
  jumpToCoachMarker,
  jumpToMarker,
  mapPosterUrl,
  nudgeTimelineSync,
  onLoadedMetadata,
  onScrubberClick,
  onScrubberHover,
  onSpatialSelect,
  onTimeUpdate,
  onVideoCanPlay,
  onVideoError,
  onVideoMouseMove,
  onVideoPlaying,
  onVideoWaiting,
  openUpgrade,
  ownPuuid,
  playbackError,
  playbackRefreshing,
  playbackSpeed,
  progressMarkers,
  progressPercent,
  recordingId,
  refreshPlaybackUrl,
  resetTimelineSync,
  reloadTimelineFromStore,
  roundDetailExpanded,
  roundGroups,
  roundLogCollapsed,
  roundOutcomeIcon,
  roundOutcomeLabel,
  roundRecord,
  roundSeparators,
  spikeEventIcon,
  timeline,
  scoreboardGroups,
  seekCoachAnnotation,
  seekCoachingEvidence,
  seekNextEvent,
  seekPrevEvent,
  seekToEvent,
  selectedRound,
  setSidePanelTab,
  showInsightsPanel,
  showScoreboard,
  showShortcuts,
  sidePanelOpen,
  skip,
  sortedTeamSnapshot,
  spatialDeathChips,
  spatialHudVisible,
  spatialMapLarge,
  spatialMapVisible,
  spatialModes,
  spatialPreviewAvailable,
  spatialReplaySync,
  spatialRoundFilter,
  spatialViewMode,
  supplementalCoachingNotes,
  syncOffsetLabel,
  tacticalIntelBrief,
  theaterMode,
  toggleFullscreen,
  toggleMute,
  togglePlay,
  toggleTheaterMode,
  videoAreaEl,
  videoEl,
  videoFrameEl,
  videoFrameStyle,
  videoSeeking,
  videoBuffering,
  videoSrc,
  videoSyncOffsetMs,
} = useVodReview()

const showDemoPendingPanel = computed(() => {
  if (!timeline.value || !recordingId.value) return false
  if (!usesAsyncDemoSync(timeline.value.game)) return false
  return !recordingTimelineReady({
    kills: timeline.value.kills,
    deaths: timeline.value.deaths,
    finalStats: timeline.value.finalStats,
  })
})

const noVideoHint = computed((): string => {
  if (!recordingId.value) {
    return 'Recording unavailable — it may have been deleted locally or expired from cloud storage.'
  }
  if (timeline.value?.videoPath) return ''
  if (timeline.value?.localFileMissing && timeline.value?.uploadedToCloud) {
    return 'Playing from cloud — local file was removed after upload.'
  }
  if (timeline.value?.uploadedToCloud && timeline.value?.jobId && !timeline.value?.videoPath) {
    return 'Cloud recording found but playback URL unavailable — try Retry cloud playback.'
  }
  return 'No playable recording found for this session — check Settings → Recording save folder.'
})
</script>

<template>
  <div class="flex flex-1 min-h-0">
<!-- Left sidebar: round log or demo-pending panel -->
      <VodDemoPendingPanel
        v-if="showDemoPendingPanel && !theaterMode && !roundLogCollapsed"
        :game="timeline!.game"
        :map="timeline!.map"
        :recorded-at="timeline!.recordedAt"
        :recording-id="recordingId"
        @demo-linked="reloadTimelineFromStore"
      />
      <VodRoundLogSidebar v-else-if="!theaterMode && !roundLogCollapsed" />

      <!-- Video + intel + timeline -->
      <div class="flex flex-1 min-w-0 min-h-0">

      <div class="flex-1 flex flex-col min-w-0 min-h-0">

        <!-- Coach feedback banner -->
        <div
          v-if="hasCoachFeedback && coachReview?.status === 'completed' && !sidePanelOpen"
          class="flex-shrink-0 border-b border-violet-500/20 bg-gradient-to-r from-violet-500/[0.12] to-transparent px-3 py-2"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">Coach feedback ready</span>
            <span v-if="coachReview?.coach?.display_name" class="text-[10px] text-violet-200/80">
              from {{ coachReview.coach.display_name }}
            </span>
            <span class="text-[10px] text-gray-500">
              · {{ coachReview?.annotations?.length ?? 0 }} timeline notes
            </span>
            <button
              type="button"
              class="ml-auto text-[10px] font-semibold text-violet-200 hover:text-white transition-colors"
              @click="setSidePanelTab('notes')"
            >
              Open coach notes →
            </button>
          </div>
        </div>

        <!-- Video area -->
        <div
          ref="videoAreaEl"
          class="vod-cinema flex-1 relative min-h-[200px] flex items-center justify-center overflow-hidden"
          :class="{ 'cursor-none': cursorHidden && !theaterMode }"
          @mousemove="onVideoMouseMove"
        >
          <button
            v-if="roundLogCollapsed && roundGroups.length"
            type="button"
            class="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-r-xl border border-white/10 border-l-0 bg-black/70 px-2 py-3 text-[9px] font-bold uppercase tracking-[0.16em] text-gray-400 backdrop-blur-sm transition-colors hover:border-red-500/30 hover:bg-black/85 hover:text-white writing-mode-vertical"
            style="writing-mode: vertical-rl; text-orientation: mixed;"
            title="Show round log (B)"
            @click.stop="roundLogCollapsed = false"
          >Round log</button>

          <div
            ref="videoFrameEl"
            class="vod-cinema-frame relative bg-black"
            :class="isFullscreen ? 'w-full h-full' : ''"
            :style="isFullscreen ? undefined : videoFrameStyle"
            @click="togglePlay"
            @dblclick.stop="toggleFullscreen"
          >
          <video
            v-if="timeline?.videoPath"
            ref="videoEl"
            class="w-full h-full block"
            :class="isFullscreen ? 'object-contain' : ''"
            :src="videoSrc"
            :poster="mapPosterUrl || undefined"
            :preload="isCloudVideo ? 'auto' : 'metadata'"
            @timeupdate="onTimeUpdate"
            @loadedmetadata="onLoadedMetadata"
            @durationchange="onLoadedMetadata"
            @play="isPlaying = true"
            @playing="onVideoPlaying"
            @pause="isPlaying = false"
            @ended="isPlaying = false"
            @waiting="onVideoWaiting"
            @canplay="onVideoCanPlay"
            @error="onVideoError"
          />
          <div v-else class="w-full h-full min-h-[240px] min-w-[320px] flex flex-col items-center justify-center gap-3 text-gray-600 pointer-events-none select-none">
            <svg class="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.867v6.266a1 1 0 01-1.447.902L15 14M5 8a2 2 0 00-2 2v4a2 2 0 002 2h8a2 2 0 002-2v-4a2 2 0 00-2-2H5z"/>
            </svg>
            <span class="text-xs text-gray-600">No video for this session</span>
            <span class="text-[10px] text-gray-700 text-center max-w-xs">
              <template v-if="playbackRefreshing">Refreshing cloud playback…</template>
              <template v-else>{{ noVideoHint }}</template>
            </span>
            <button
              v-if="canRefreshCloudPlayback && !playbackRefreshing"
              type="button"
              class="pointer-events-auto text-[10px] font-semibold text-red-400/80 hover:text-red-300 transition-colors"
              @click="refreshPlaybackUrl()"
            >Retry cloud playback</button>
          </div>

          <!-- Expand / fullscreen -->
          <div
            v-if="timeline?.videoPath"
            class="absolute top-2 right-2 z-30 flex items-center gap-1"
            @click.stop
          >
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/60 text-gray-300 backdrop-blur-sm transition-colors hover:border-white/25 hover:bg-black/80 hover:text-white"
              :class="theaterMode ? 'border-red-400/40 text-red-200' : ''"
              :title="theaterMode ? 'Exit theater mode (T)' : 'Theater mode — maximize video (T)'"
              @click="toggleTheaterMode"
            >
              <svg v-if="theaterMode" class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5"/>
              </svg>
              <svg v-else class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/>
              </svg>
            </button>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/60 text-gray-300 backdrop-blur-sm transition-colors hover:border-white/25 hover:bg-black/80 hover:text-white"
              :title="isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'"
              @click="toggleFullscreen"
            >
              <svg v-if="isFullscreen" class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5"/>
              </svg>
              <svg v-else class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            </button>
          </div>

          <div
            v-if="videoSeeking || videoBuffering"
            class="absolute inset-0 z-20 flex items-center justify-center bg-black/35 pointer-events-none"
          >
            <div class="flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-[11px] text-gray-200">
              <svg class="h-4 w-4 animate-spin text-violet-300" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"/>
              </svg>
              {{ videoSeeking ? 'Seeking…' : 'Buffering…' }}
            </div>
          </div>

          <!-- Play/pause overlay — subtle; hidden while playing -->
          <div
            v-if="playbackError"
            class="absolute inset-x-4 bottom-4 z-20 rounded-xl border border-amber-500/25 bg-black/75 px-3 py-2 text-center pointer-events-none"
          >
            <p class="text-[11px] text-amber-200/90 leading-relaxed">{{ playbackError }}</p>
          </div>

          <div
            class="absolute inset-0 flex items-center justify-center pointer-events-none"
            :class="isPlaying ? 'opacity-0' : 'opacity-100'"
            style="transition: opacity 0.25s"
          >
            <div class="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-md ring-1 ring-white/10 shadow-lg shadow-black/40">
              <svg class="w-6 h-6 text-white/90 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>

          <!-- Kill/death notification popup (shown when video reaches an event) -->
          <Transition name="event-pop">
            <div
              v-if="activeEventNotif"
              class="absolute top-3 left-3 flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs pointer-events-none backdrop-blur-sm z-10"
              :class="activeEventNotif.type === 'kill'
                ? 'bg-black/70 border-green-500/30 text-green-300'
                : 'bg-black/70 border-red-500/30 text-red-300'"
            >
              <!-- Agent portrait -->
              <div class="w-8 h-8 rounded-lg overflow-hidden bg-white/[0.05] flex-shrink-0 ring-1"
                   :class="activeEventNotif.type === 'kill' ? 'ring-green-500/30' : 'ring-red-500/30'"
              >
                <img
                  v-if="activeEventNotif.type === 'kill' && agentByPuuid(activeEventNotif.victimPuuid)"
                  :src="getAgentImage(agentByPuuid(activeEventNotif.victimPuuid))"
                  class="w-full h-full object-contain"
                />
                <img
                  v-else-if="activeEventNotif.type === 'death' && agentByPuuid(activeEventNotif.killerPuuid)"
                  :src="getAgentImage(agentByPuuid(activeEventNotif.killerPuuid))"
                  class="w-full h-full object-contain"
                />
                <div v-else class="w-full h-full flex items-center justify-center text-base">
                  <svg v-if="activeEventNotif.type === 'kill'" class="w-4 h-4 text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>
                  <svg v-else class="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </div>
              </div>
              <!-- Weapon icon + label -->
              <div class="flex flex-col gap-0.5">
                <span class="font-semibold leading-tight">
                  {{ activeEventNotif.type === 'kill'
                    ? `Killed ${activeEventNotif.victimName}`
                    : `Killed by ${activeEventNotif.killerName}` }}
                </span>
                <div class="flex items-center gap-1.5">
                  <img
                    v-if="activeEventNotif.weapon && getWeaponIcon(activeEventNotif.weapon)"
                    :src="getWeaponIcon(activeEventNotif.weapon)"
                    class="h-3 w-auto object-contain opacity-80"
                  />
                  <span v-if="activeEventNotif.weapon" class="text-[10px] opacity-60">{{ activeEventNotif.weapon }}</span>
                </div>
              </div>
            </div>
          </Transition>

          <!-- Spatial callout popup (replay sync) -->
          <Transition name="event-pop">
            <div
              v-if="activeSpatialToast && hasSpatialIntel"
              class="absolute bottom-3 left-3 flex flex-col gap-0.5 px-3 py-2 rounded-xl border text-xs pointer-events-none backdrop-blur-sm z-10 max-w-[min(240px,70vw)]"
              :class="{
                'bg-black/75 border-red-500/35 text-red-200': activeSpatialToast.tone === 'death',
                'bg-black/75 border-green-500/35 text-green-200': activeSpatialToast.tone === 'kill',
                'bg-black/75 border-orange-500/35 text-orange-200': activeSpatialToast.tone === 'plant',
                'bg-black/75 border-blue-500/35 text-blue-200': activeSpatialToast.tone === 'defuse',
                'bg-black/75 border-white/20 text-gray-200': activeSpatialToast.tone === 'neutral',
              }"
            >
              <span class="font-semibold leading-tight">{{ activeSpatialToast.title }}</span>
              <span v-if="activeSpatialToast.sub" class="text-[10px] opacity-70">{{ activeSpatialToast.sub }}</span>
            </div>
          </Transition>

          <!-- Floating minimap HUD on video -->
          <div
            v-if="hasSpatialIntel && spatialHudVisible && displaySpatialSummary"
            class="absolute bottom-3 right-3 z-20 pointer-events-auto"
            @click.stop
            @mousedown.stop
          >
            <MatchSpatialMinimap
              float-hud
              :summary="displaySpatialSummary"
              :map-name="timeline?.map"
              :game="timeline?.game"
              :active-index="activeSpatialDisplayIndex"
              :show-legend="false"
              :show-heatmap="spatialReplaySync && spatialViewMode !== 'dots'"
              :heatmap-layer="spatialViewMode === 'sites' ? 'site' : spatialViewMode === 'peek' ? 'peek' : 'callout'"
              @select="onSpatialSelect"
            />
          </div>
          <button
            v-else-if="hasSpatialIntel && displaySpatialSummary"
            type="button"
            class="absolute bottom-3 right-3 z-20 text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border border-white/10 bg-black/60 text-gray-400 hover:text-white pointer-events-auto"
            @click.stop="spatialHudVisible = true"
          >Show map</button>

          </div>
        </div>

        <!-- Mobile / collapsed intel band — large map above scrubber -->
        <div
          v-if="hasSpatialIntel && !theaterMode"
          class="flex-shrink-0 border-b border-white/[0.08] bg-[#131313] px-3 py-2"
          :class="sidePanelOpen ? 'md:hidden' : ''"
          @click.stop
        >
          <div class="flex flex-col sm:flex-row gap-3 min-h-0">
            <div class="flex-shrink-0 mx-auto sm:mx-0" @mousedown.stop @click.stop>
              <MatchSpatialMinimap
                dock-expanded
                :dock-large="spatialMapLarge"
                :summary="displaySpatialSummary"
                :map-name="timeline?.map"
                :game="timeline?.game"
                :active-index="activeSpatialDisplayIndex"
                :show-legend="false"
                :show-heatmap="spatialViewMode !== 'dots'"
                :heatmap-layer="spatialViewMode === 'sites' ? 'site' : spatialViewMode === 'peek' ? 'peek' : 'callout'"
                :round-filter="spatialRoundFilter"
                :show-round-slider="availableSpatialRounds.length > 1"
                @update:round-filter="spatialRoundFilter = $event"
                @select="onSpatialSelect"
              />
            </div>
            <div class="flex-1 min-w-0 flex flex-col gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-[9px] font-black uppercase tracking-[0.2em] text-red-400/85">Match Intel</span>
                <button
                  type="button"
                  class="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border transition-colors"
                  :class="spatialReplaySync
                    ? 'bg-red-500/15 border-red-500/30 text-red-200'
                    : 'border-white/10 text-gray-500 hover:text-gray-300'"
                  title="When on, map dots and heat build up as the VOD plays"
                  @click="spatialReplaySync = !spatialReplaySync"
                >{{ spatialReplaySync ? 'Replay sync' : 'Full map' }}</button>
                <div class="flex items-center gap-0.5 p-0.5 rounded-lg bg-black/25 border border-white/[0.06]">
                  <button
                    v-for="mode in spatialModes"
                    :key="mode.id"
                    type="button"
                    class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-colors"
                    :class="spatialViewMode === mode.id
                      ? 'bg-red-500/20 text-red-200'
                      : 'text-gray-500 hover:text-gray-300'"
                    @click="spatialViewMode = mode.id"
                  >{{ mode.label }}</button>
                </div>
                <button
                  v-if="spatialMapVisible"
                  type="button"
                  class="ml-auto text-[9px] font-semibold text-gray-500 hover:text-gray-300 md:hidden"
                  @click="setSidePanelTab(null)"
                >Hide</button>
                <button
                  v-else
                  type="button"
                  class="ml-auto hidden md:flex text-[9px] font-semibold text-gray-500 hover:text-gray-300"
                  @click="setSidePanelTab('map')"
                >Dock to side</button>
              </div>
              <TacticalIntelBrief
                v-if="tacticalIntelBrief && !sidePanelOpen"
                :brief="tacticalIntelBrief"
                compact
                @seek-evidence="seekCoachingEvidence"
              />
              <div ref="dockChipsEl" class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto scrollbar-hide">
                <button
                  v-for="item in spatialDeathChips"
                  :key="item.index"
                  :data-spatial-chip="item.index"
                  type="button"
                  class="text-[10px] font-semibold px-2.5 py-1 rounded-md border transition-all"
                  :class="activeSpatialIndex === item.index
                    ? 'bg-red-500/22 border-red-400/45 text-white'
                    : 'bg-black/35 border-white/10 text-gray-500 hover:border-red-500/30 hover:text-gray-300'"
                  :title="`Seek to ${item.ev.callout}`"
                  @click="onSpatialSelect(item.ev, item.displayIndex)"
                >
                  R{{ item.ev.round + 1 }} · {{ item.ev.callout }}
                </button>
              </div>
              <div class="flex flex-wrap items-center gap-2 pt-0.5">
                <div
                  v-if="recordingId"
                  class="flex items-center gap-1 rounded-md border border-white/[0.08] bg-black/30 px-1.5 py-0.5"
                >
                  <span class="text-[8px] text-gray-600">Sync</span>
                  <button type="button" class="text-[9px] font-bold px-1 py-0.5 rounded border border-white/10 text-gray-500 hover:text-white" title="Shift events 1s earlier" @click="nudgeTimelineSync(-1000)">−1s</button>
                  <span class="text-[8px] tabular-nums text-gray-600 min-w-[2.25rem] text-center">{{ syncOffsetLabel }}</span>
                  <button type="button" class="text-[9px] font-bold px-1 py-0.5 rounded border border-white/10 text-gray-500 hover:text-white" title="Shift events 1s later" @click="nudgeTimelineSync(1000)">+1s</button>
                  <button v-if="videoSyncOffsetMs" type="button" class="text-[8px] px-1 py-0.5 rounded text-gray-600 hover:text-gray-300" title="Reset sync offset" @click="resetTimelineSync">↺</button>
                </div>
                <p v-if="!canSeekFromSpatial" class="text-[9px] text-amber-300/75">
                  <template v-if="spatialPreviewAvailable">1 free seek ·</template>
                  <button type="button" class="underline hover:text-amber-200" @click="openUpgrade">Plus</button>
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Slim intel strip when side panel is open (desktop) — removed; intel lives in side panel -->

        <!-- Transport deck -->
        <div class="vod-transport flex-shrink-0 border-t border-white/[0.08] bg-[#101010] px-3 py-2">
          <div class="vod-transport-inner space-y-2">
            <div class="relative group cursor-pointer h-6 flex items-center" @click="onScrubberClick" @mousemove="onScrubberHover" @mouseleave="hoverTime = null">
              <div class="w-full h-2 rounded-full bg-white/[0.08] ring-1 ring-white/[0.04] relative overflow-visible">
                <div
                  v-if="activeRoundSegment"
                  class="absolute top-0 h-full rounded-full bg-white/[0.07] pointer-events-none"
                  :style="{ left: activeRoundSegment.left + '%', width: activeRoundSegment.width + '%' }"
                />
                <div
                  class="h-full rounded-full bg-gradient-to-r from-red-500 via-red-400 to-orange-400 pointer-events-none shadow-[0_0_18px_rgba(239,68,68,0.35)]"
                  :style="{ width: progressPercent + '%' }"
                />
                <DuelMomentScrubberBands
                  v-if="hasDuelMoments && duration > 0"
                  :moments="duelMoments"
                  :duration-sec="duration"
                  :active-moment-id="activeDuelMomentId"
                  @select="onDuelMomentBandSelect"
                />
                <div
                  v-for="sep in roundSeparators"
                  :key="sep.percent"
                  class="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-white/18 pointer-events-none"
                  :style="{ left: sep.percent + '%' }"
                />
                <button
                  v-for="marker in coachProgressMarkers"
                  :key="marker.key"
                  class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 h-3.5 w-3.5 rounded-full border-2 border-violet-200 bg-violet-500 shadow-[0_0_12px_rgba(167,139,250,0.45)] transition-transform duration-150 hover:scale-125"
                  :style="{ left: marker.percent + '%' }"
                  :title="`Coach note: ${marker.label}`"
                  @click.stop="jumpToCoachMarker(marker)"
                />
                <button
                  v-for="marker in progressMarkers"
                  :key="marker.key"
                  class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-transform duration-150 hover:scale-125"
                  :class="marker.kind === 'round'
                    ? 'h-4 w-1 rounded-full bg-white/35 shadow-[0_0_8px_rgba(255,255,255,0.18)]'
                    : marker.kind === 'kill'
                      ? 'h-3 w-3 rounded-full border-2 border-emerald-200 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.35)]'
                      : marker.kind === 'death'
                        ? 'h-3 w-3 rounded-full border-2 border-red-200 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.35)]'
                        : marker.kind === 'plant'
                          ? 'h-4 w-2 rounded-full border border-orange-200 bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.35)]'
                          : marker.kind === 'defuse'
                            ? 'h-4 w-2 rounded-full border border-cyan-200 bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.35)]'
                            : 'h-3 w-3 rounded-full border-2 border-yellow-200 bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.35)]'"
                  :style="{ left: marker.percent + '%' }"
                  :title="marker.label"
                  @click.stop="jumpToMarker(marker)"
                />
                <div
                  v-if="hoverTime !== null"
                  class="absolute top-1/2 h-5 w-0.5 -translate-y-1/2 bg-white/70 pointer-events-none"
                  :style="{ left: (hoverTime / duration * 100) + '%' }"
                />
              </div>
              <div
                class="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-white/60 bg-white shadow-[0_6px_18px_rgba(255,255,255,0.2)] pointer-events-none transition-transform group-hover:scale-110"
                :style="{ left: `calc(${progressPercent}% - 8px)` }"
              />
              <div
                v-if="hoverTime !== null"
                class="absolute bottom-full mb-2 -translate-x-1/2 rounded-lg border border-white/[0.08] bg-black/80 px-2 py-1 text-xs text-gray-200 tabular-nums pointer-events-none whitespace-nowrap"
                :style="{ left: (hoverTime / duration * 100) + '%' }"
              >
                {{ formatMs(hoverTime * 1000) }}
                <span v-if="hoverRoundLabel" class="text-gray-500"> · {{ hoverRoundLabel }}</span>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button class="h-9 w-9 flex items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.06] text-gray-100 transition-all hover:border-white/[0.16] hover:bg-white/[0.12] hover:text-white" title="Play/Pause (Space)" @click="togglePlay">
                <svg v-if="isPlaying" class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.75 4.5h2.75v11H5.75zM11.5 4.5h2.75v11H11.5z"/>
                </svg>
                <svg v-else class="ml-0.5 h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.75 4.75v10.5l8-5.25-8-5.25Z"/>
                </svg>
              </button>

              <button class="h-9 w-9 flex items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-gray-400 transition-all hover:border-white/[0.16] hover:bg-white/[0.1] hover:text-gray-100" title="Skip back 5s (←)" @click="skip(-5)">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 20 20">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9.75 14.5 5.5 10l4.25-4.5m5.5 9-4.25-4.5 4.25-4.5"/>
                </svg>
              </button>

              <button class="h-9 w-9 flex items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-gray-400 transition-all hover:border-white/[0.16] hover:bg-white/[0.1] hover:text-gray-100" title="Skip forward 5s (→)" @click="skip(5)">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 20 20">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="m10.25 5.5 4.25 4.5-4.25 4.5m-5.5-9 4.25 4.5-4.25 4.5"/>
                </svg>
              </button>

              <button class="h-9 w-9 flex items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-gray-500 transition-all hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-gray-200" title="Previous event (J)" @click="seekPrevEvent">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 20 20">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M11.75 14.5 7.5 10l4.25-4.5"/>
                </svg>
              </button>
              <button class="h-9 w-9 flex items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-gray-500 transition-all hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-gray-200" title="Next event (L)" @click="seekNextEvent">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 20 20">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="m8.25 14.5 4.25-4.5-4.25-4.5"/>
                </svg>
              </button>

              <button
                class="rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-xs font-mono text-gray-300 transition-all hover:border-white/[0.14] hover:bg-white/[0.1]"
                title="Cycle speed ([/])"
                @click="cycleSpeed"
              >{{ playbackSpeed }}x</button>

              <button
                v-if="timeline?.videoPath"
                class="h-9 w-9 flex items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-gray-500 transition-all hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-gray-200"
                :title="isMuted ? 'Unmute (V)' : 'Mute (V)'"
                @click="toggleMute"
              >
                <svg v-if="isMuted" class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M11 5 6 9H3v6h3l5 4V5Z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="m22 2-6 6m0 8 6 6M16 8l10 10"/>
                </svg>
                <svg v-else class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M11 5 6 9H3v6h3l5 4V5Z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg>
              </button>

              <div class="flex-1" />
              <span class="text-xs font-mono text-gray-400 tabular-nums">
                {{ formatSeconds(currentTime) }} / {{ formatSeconds(duration, true) }}
              </span>

              <button
                v-if="selectedRound"
                class="hidden sm:flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition-all"
                :class="roundDetailExpanded
                  ? 'border-red-500/30 bg-red-500/10 text-red-200 hover:border-red-500/40'
                  : 'border-white/[0.08] bg-white/[0.03] text-gray-400 hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-gray-200'"
                :title="roundDetailExpanded ? 'Hide round events' : 'Show round events'"
                @click="roundDetailExpanded = !roundDetailExpanded"
              >
                R{{ selectedRound.roundNumber + 1 }} events
              </button>

              <button
                class="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-gray-400 transition-all hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-gray-200"
                @click="showScoreboard = !showScoreboard"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 20 20">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M4.5 15.5h2.5v-5H4.5v5Zm4.25 0h2.5V7.75h-2.5V15.5Zm4.25 0h2.5V4.5h-2.5v11Z"/>
                </svg>
                Score
              </button>

              <div class="hidden xl:flex items-center gap-2 ml-1 flex-wrap justify-end text-[9px] text-gray-600">
                <span class="inline-flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-emerald-500" />Kill</span>
                <span class="inline-flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-red-500" />Death</span>
                <span class="inline-flex items-center gap-1"><span class="h-2.5 w-1.5 rounded-full bg-orange-500" />Plant</span>
                <span class="inline-flex items-center gap-1"><span class="h-2.5 w-1.5 rounded-full bg-cyan-500" />Defuse</span>
                <button type="button" class="ml-1 text-gray-500 hover:text-gray-300 underline-offset-2 hover:underline" @click="showShortcuts = true">Shortcuts</button>
              </div>
            </div>
          </div>
        </div>
        <div
          v-if="roundDetailExpanded && selectedRound && !theaterMode"
          class="flex-shrink-0 bg-[#1a1a1a] border-t border-white/[0.10] max-h-28 overflow-y-auto scrollbar-hide"
        >
          <!-- Round header -->
          <div class="flex items-center gap-2.5 px-3 py-2 sticky top-0 bg-[#1a1a1a] border-b border-white/[0.07] z-10">
            <img v-if="roundOutcomeIcon(selectedRound)" :src="roundOutcomeIcon(selectedRound)!" class="w-5 h-5 object-contain flex-shrink-0" />
            <div v-else class="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" :class="selectedRound.won ? 'bg-teal-500' : 'bg-red-500'">
              <svg v-if="selectedRound.won" class="w-3 h-3 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l3.5 3.5L13 5"/></svg>
              <svg v-else class="w-3 h-3 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
            </div>
            <span class="text-xs font-bold text-gray-200">ROUND {{ selectedRound.roundNumber + 1 }}</span>
            <span class="text-xs font-bold" :class="selectedRound.won ? 'text-teal-400' : 'text-red-400'">
              {{ roundOutcomeLabel(selectedRound) }}
            </span>
            <div class="flex items-center gap-1.5 ml-1">
              <span v-if="selectedRound.spikePlanted" class="inline-flex items-center gap-1 text-[9px] font-semibold text-orange-400 bg-orange-500/10 px-1.5 py-px rounded">
                <img :src="spikeEventIcon('plant')" class="w-2.5 h-2.5 object-contain" alt="">PLANTED</span>
              <span v-if="selectedRound.spikeDefused" class="inline-flex items-center gap-1 text-[9px] font-semibold text-cyan-400 bg-cyan-500/10 px-1.5 py-px rounded">
                <img :src="spikeEventIcon('defuse')" class="w-2.5 h-2.5 object-contain" alt="">DEFUSED</span>
              <span v-if="selectedRound.spikeDetonated" class="inline-flex items-center gap-1 text-[9px] font-semibold text-red-400 bg-red-500/10 px-1.5 py-px rounded">
                <img :src="spikeEventIcon('detonation')" class="w-2.5 h-2.5 object-contain" alt="">DETONATED</span>
            </div>
            <div class="flex-1" />
            <button
              class="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-gray-300 transition-colors rounded-lg hover:bg-white/[0.06]"
              title="Collapse round events"
              @click="roundDetailExpanded = false"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- Event feed -->
          <div v-if="selectedRound.events.length" class="divide-y divide-white/[0.025]">
            <button
              v-for="event in selectedRound.events"
              :key="`detail-${event.videoOffsetMs}`"
              class="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] transition-colors text-left group"
              @click="seekToEvent(event)"
            >
              <!-- Spike events in round detail -->
              <template v-if="isSpikeEvent(event)">
                <VodTimelineEventIcon :type="event.type" :game="timeline?.game" size="md" />
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-semibold"
                     :class="event.type === 'plant' ? 'text-orange-300' : event.type === 'defuse' ? 'text-cyan-300' : 'text-yellow-300'">
                    {{ event.type === 'plant' ? (event.site ? `Spike Planted — Site ${event.site}` : 'Spike Planted') : event.type === 'defuse' ? 'Spike Defused' : 'Spike Detonated' }}
                  </p>
                  <p v-if="event.planter || event.defuser" class="text-[9px] text-gray-600">{{ formatPlayerLabel(event.planter || event.defuser) }}</p>
                </div>
                <span class="text-[10px] text-gray-600 font-mono tabular-nums flex-shrink-0">{{ formatMs(event.videoOffsetMs) }}</span>
              </template>

              <!-- Kill/death in round detail -->
              <template v-else-if="event.type === 'neutral'">
                <!-- Neutral type indicator -->
                <div class="w-1 h-6 rounded-full flex-shrink-0 bg-gray-700" />
                <!-- Killer agent -->
                <div class="w-7 h-7 rounded overflow-hidden bg-white/[0.03] flex-shrink-0 ring-1 ring-white/10">
                  <img v-if="agentByPuuid(event.killerPuuid)" :src="getAgentImage(agentByPuuid(event.killerPuuid))" class="w-full h-full object-contain opacity-50" />
                  <div v-else class="w-full h-full flex items-center justify-center text-[10px] text-gray-700">?</div>
                </div>
                <!-- Arrow -->
                <svg class="w-3 h-3 text-gray-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
                <!-- Victim agent -->
                <div class="w-7 h-7 rounded overflow-hidden bg-white/[0.03] flex-shrink-0 ring-1 ring-white/10">
                  <img v-if="agentByPuuid(event.victimPuuid)" :src="getAgentImage(agentByPuuid(event.victimPuuid))" class="w-full h-full object-contain opacity-40" />
                  <div v-else class="w-full h-full flex items-center justify-center text-[10px] text-gray-700">?</div>
                </div>
                <!-- Names + weapon -->
                <div class="flex-1 min-w-0">
                  <p class="text-[10px] text-gray-600 truncate">{{ event.killerName || '?' }} → {{ event.victimName || '?' }}</p>
                  <p v-if="event.weapon" class="text-[8px] text-gray-700 truncate">{{ event.weapon }}</p>
                </div>
                <span class="text-[10px] text-gray-700 font-mono tabular-nums flex-shrink-0">{{ formatMs(event.videoOffsetMs) }}</span>
              </template>

              <!-- Player kill/death in round detail -->
              <template v-else>
                <VodTimelineEventIcon
                  :type="event.type"
                  :game="timeline?.game"
                  :first-blood="event.isFirstBlood"
                  :source-image="getEventSourceImage(event)"
                  size="md"
                />

                <div
                  class="w-7 h-7 rounded overflow-hidden bg-white/[0.04] flex-shrink-0 ring-1"
                  :class="event.type === 'kill' ? 'ring-teal-500/20' : 'ring-red-500/20'"
                >
                  <img
                    v-if="event.type === 'kill' && agentByPuuid(event.victimPuuid)"
                    :src="getAgentImage(agentByPuuid(event.victimPuuid))"
                    class="w-full h-full object-contain opacity-85"
                    alt=""
                  >
                  <img
                    v-else-if="event.type === 'death' && agentByPuuid(event.killerPuuid)"
                    :src="getAgentImage(agentByPuuid(event.killerPuuid))"
                    class="w-full h-full object-contain opacity-85"
                    alt=""
                  >
                </div>

                <div class="flex-1 min-w-0">
                  <p
                    class="text-xs font-semibold truncate"
                    :class="event.type === 'kill' ? 'text-gray-300 group-hover:text-white' : 'text-gray-500 group-hover:text-gray-300'"
                  >
                    {{ event.type === 'kill' ? event.victimName : event.killerName }}
                  </p>
                  <p v-if="getKillSourceLabel(event)" class="text-[9px] text-gray-600 truncate capitalize">
                    {{ getKillSourceLabel(event) }}
                    <span v-if="event.assistants?.length" class="text-gray-700 ml-1">· {{ event.assistants.length }} assist</span>
                  </p>
                </div>

                <span class="text-[10px] text-gray-600 font-mono tabular-nums flex-shrink-0">{{ formatMs(event.videoOffsetMs) }}</span>
              </template>
            </button>
          </div>
          <div v-else class="px-3 py-3 text-center">
            <p class="text-xs text-gray-600">No recorded events this round</p>
          </div>
        </div>

        <!-- Team scoreboard (collapsible) -->
        <div
          v-if="showScoreboard && sortedTeamSnapshot.length && !theaterMode"
          class="flex-shrink-0 bg-[#1a1a1a] border-t border-white/[0.10] max-h-52 overflow-y-auto scrollbar-hide"
        >
          <!-- Column headers -->
          <div class="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3 py-1.5 border-b border-white/[0.07] sticky top-0 bg-[#1a1a1a]">
            <span class="text-[8px] font-semibold text-gray-600 uppercase tracking-wider">Player</span>
            <span class="text-[8px] font-semibold text-gray-600 uppercase tracking-wider text-right">K/D/A</span>
            <span class="text-[8px] font-semibold text-gray-600 uppercase tracking-wider text-right">ACS</span>
            <span class="text-[8px] font-semibold text-gray-600 uppercase tracking-wider text-right">Abilities</span>
          </div>

          <!-- Ally team -->
          <template v-for="(group, gi) in scoreboardGroups" :key="gi">
            <div class="px-3 py-1 bg-white/[0.01]">
              <span class="text-[8px] font-semibold uppercase tracking-wider" :class="group.isAlly ? 'text-blue-500/70' : 'text-red-500/70'">
                {{ group.isAlly ? 'Allies' : 'Enemies' }}
              </span>
            </div>
            <div
              v-for="p in group.players"
              :key="p.puuid ?? p.summonerName"
              class="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 items-center px-3 py-1.5 hover:bg-white/[0.03] transition-colors"
              :class="{ 'bg-white/[0.025]': p.puuid === ownPuuid }"
            >
              <!-- Player name + agent + rank -->
              <div class="flex items-center gap-2 min-w-0">
                <!-- Agent portrait with team-colored ring -->
                <div class="flex-shrink-0 w-7 h-7 rounded overflow-hidden ring-1"
                     :class="group.isAlly ? 'ring-blue-500/40' : 'ring-red-500/30'"
                >
                  <img
                    v-if="p.agent && getAgentImage(p.agent)"
                    :src="getAgentImage(p.agent)"
                    class="w-full h-full object-contain"
                    :class="p.puuid === ownPuuid ? 'opacity-100' : 'opacity-75'"
                  />
                  <div v-else class="w-full h-full bg-white/[0.05]" />
                </div>
                <div class="min-w-0">
                  <p class="text-xs font-semibold truncate" :class="p.puuid === ownPuuid ? 'text-white' : 'text-gray-300'">
                    {{ p.puuid === ownPuuid ? 'You' : p.summonerName }}
                    <span v-if="p.puuid === ownPuuid" class="text-[8px] text-gray-600 font-normal ml-0.5">← you</span>
                  </p>
                  <p v-if="p.competitiveTier > 0" class="text-[8px] tabular-nums" :style="{ color: getRankColor(p.competitiveTierName) }">
                    {{ p.competitiveTierName }}
                  </p>
                </div>
              </div>
              <!-- K/D/A -->
              <div class="text-xs tabular-nums text-right">
                <span class="text-green-400 font-semibold">{{ p.kills }}</span>
                <span class="text-gray-600">/</span>
                <span class="text-red-400 font-semibold">{{ p.deaths }}</span>
                <span class="text-gray-600">/</span>
                <span class="text-gray-400">{{ p.assists }}</span>
              </div>
              <!-- ACS (combat score) -->
              <div class="text-xs tabular-nums text-right text-gray-400 font-mono">{{ p.score }}</div>
              <!-- Ability casts with official ability icons -->
              <div v-if="p.abilityCasts && p.agent" class="flex items-center justify-end gap-1">
                <div
                  v-for="slot in abilityCastSlots"
                  :key="slot.key"
                  v-show="p.abilityCasts[slot.key] > 0"
                  class="flex items-center gap-0.5"
                  :title="`${slot.label}: ${p.abilityCasts[slot.key]}`"
                >
                  <img
                    v-if="getAbilityIcon(p.agent, slot.slot)"
                    :src="getAbilityIcon(p.agent, slot.slot)"
                    class="w-3 h-3 object-contain opacity-80"
                    alt=""
                  />
                  <span class="text-[8px] tabular-nums text-gray-600 font-mono">{{ p.abilityCasts[slot.key] }}</span>
                </div>
              </div>
              <div v-else class="text-[8px] text-gray-700 text-right">—</div>
            </div>
          </template>
        </div>
      </div>

      <!-- Right rail: coach notes OR map intel (one panel — keeps video wide) -->
      <aside
        v-if="sidePanelOpen && !theaterMode"
        class="vod-side-panel hidden md:flex w-[min(440px,34vw)] xl:w-[min(480px,32vw)] flex-shrink-0 flex-col min-h-0 border-l border-white/[0.09]"
        @click.stop
      >
        <div class="flex items-center gap-1.5 px-2 py-2 border-b border-white/[0.08] flex-shrink-0 bg-gradient-to-r from-red-500/[0.05] to-transparent">
          <button
            type="button"
            class="vod-side-tab"
            :class="showInsightsPanel ? 'vod-side-tab--active' : ''"
            @click="setSidePanelTab('notes')"
          >Coach notes</button>
          <button
            v-if="hasSpatialIntel"
            type="button"
            class="vod-side-tab"
            :class="spatialMapVisible ? 'vod-side-tab--active' : ''"
            @click="setSidePanelTab('map')"
          >Map intel</button>
          <button
            v-if="spatialMapVisible && hasSpatialIntel"
            type="button"
            class="ml-auto flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-gray-500 hover:text-gray-200"
            :title="spatialMapLarge ? 'Standard map size' : 'Larger map'"
            @click="spatialMapLarge = !spatialMapLarge"
          >{{ spatialMapLarge ? '−' : '+' }}</button>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-gray-500 transition-colors hover:border-white/[0.14] hover:text-gray-200"
            :class="spatialMapVisible && hasSpatialIntel ? '' : 'ml-auto'"
            title="Close panel (N / M)"
            @click="setSidePanelTab(null)"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 20 20">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="m12.5 5.5-5 4.5 5 4.5"/>
            </svg>
          </button>
        </div>

        <div v-if="showInsightsPanel" class="vod-notes-panel flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4 py-4 space-y-4">
          <TacticalIntelBrief
            v-if="tacticalIntelBrief"
            :brief="tacticalIntelBrief"
            @seek-evidence="seekCoachingEvidence"
          />

          <div
            v-if="coachReview?.annotations?.length || coachReview?.coach_perspective"
            class="rounded-lg border border-violet-500/25 bg-violet-500/[0.06] px-3 py-2.5 space-y-2.5"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300/90">
                Human coach
                <span v-if="coachReview.coach?.display_name" class="normal-case font-medium text-violet-200/80">
                  · {{ coachReview.coach.display_name }}
                </span>
              </p>
              <span
                class="text-[9px] font-semibold uppercase tracking-wide"
                :class="coachReview.status === 'completed' ? 'text-emerald-400' : 'text-amber-400'"
              >{{ coachReview.status.replace('_', ' ') }}</span>
            </div>
            <p v-if="coachReview.student_question" class="text-[11px] text-gray-500 italic leading-relaxed">
              You asked: {{ coachReview.student_question }}
            </p>
            <p
              v-if="coachReview.coach_perspective"
              class="text-[12px] text-emerald-200/90 leading-relaxed rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-2"
            >
              {{ coachReview.coach_perspective }}
            </p>
            <button
              v-for="(note, noteIndex) in coachReview.annotations"
              :key="note.id"
              :data-coach-note="note.id"
              type="button"
              class="w-full text-left rounded-md border px-2.5 py-2 transition-colors"
              :class="activeCoachNoteId === note.id
                ? 'border-violet-400/45 bg-violet-500/[0.14] ring-1 ring-violet-400/20'
                : 'border-white/[0.06] bg-black/20 hover:border-violet-500/30 hover:bg-violet-500/[0.08]'"
              @click="seekCoachAnnotation(note.video_offset_ms, note.id)"
            >
              <div class="flex items-center justify-between gap-2 mb-0.5">
                <p v-if="note.round_number != null" class="text-[10px] font-semibold text-violet-300/80">
                  Round {{ note.round_number }}
                </p>
                <span
                  v-if="noteIndex < 9"
                  class="text-[8px] font-mono text-gray-600 tabular-nums"
                  title="Press number key to jump"
                >{{ noteIndex + 1 }}</span>
              </div>
              <p class="text-[12px] leading-relaxed text-gray-300">{{ note.body }}</p>
            </button>
          </div>

          <div
            v-for="(note, index) in supplementalCoachingNotes"
            :key="`${index}-${note}`"
            class="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5"
          >
            <div class="flex items-start gap-2">
              <span class="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-400/80" />
              <p class="text-[12px] leading-relaxed text-gray-400">{{ note }}</p>
            </div>
          </div>

          <div
            v-if="!tacticalIntelBrief && !supplementalCoachingNotes.length && !coachReview?.annotations?.length"
            class="rounded-xl border border-dashed border-white/[0.08] px-3 py-8 text-center"
          >
            <p class="text-[12px] font-medium text-gray-500">No coaching analysis yet</p>
            <p class="mt-1.5 text-[11px] text-gray-600 leading-relaxed">Run match analysis from the dashboard to unlock structured review notes here.</p>
          </div>
        </div>

        <div v-else-if="spatialMapVisible && hasSpatialIntel" class="vod-intel-panel flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4 py-4 space-y-3">
          <div class="mx-auto w-fit" @mousedown.stop @click.stop>
            <MatchSpatialMinimap
              panel-hud
              :panel-large="spatialMapLarge"
              :summary="displaySpatialSummary"
              :map-name="timeline?.map"
              :game="timeline?.game"
              :active-index="activeSpatialDisplayIndex"
              :show-legend="true"
              :show-heatmap="spatialViewMode !== 'dots'"
              :heatmap-layer="spatialViewMode === 'sites' ? 'site' : spatialViewMode === 'peek' ? 'peek' : 'callout'"
              :round-filter="spatialRoundFilter"
              :show-round-slider="availableSpatialRounds.length > 1"
              @update:round-filter="spatialRoundFilter = $event"
              @select="onSpatialSelect"
            />
          </div>

          <DuelMomentCards
            v-if="hasDuelMoments"
            :moments="duelMoments"
            :active-moment-id="activeDuelMomentId"
            compact
            @seek="seekDuelMoment"
          />

          <div class="flex flex-wrap items-center gap-2">
            <div class="flex items-center gap-0.5 p-0.5 rounded-lg bg-black/25 border border-white/[0.06]">
              <button
                v-for="mode in spatialModes"
                :key="mode.id"
                type="button"
                class="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-colors"
                :class="spatialViewMode === mode.id
                  ? 'bg-red-500/20 text-red-200'
                  : 'text-gray-500 hover:text-gray-300'"
                @click="spatialViewMode = mode.id"
              >{{ mode.label }}</button>
            </div>
            <button
              type="button"
              class="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-md border transition-colors"
              :class="spatialReplaySync
                ? 'bg-red-500/15 border-red-500/30 text-red-200'
                : 'border-white/10 text-gray-500 hover:text-gray-300'"
              @click="spatialReplaySync = !spatialReplaySync"
            >{{ spatialReplaySync ? 'Replay sync' : 'Full map' }}</button>
          </div>

          <div v-if="spatialDeathChips.length" class="space-y-1.5">
            <p class="text-[9px] font-semibold uppercase tracking-wider text-gray-600">Death locations</p>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="item in spatialDeathChips"
                :key="item.index"
                :data-spatial-chip="item.index"
                type="button"
                class="text-[10px] font-semibold px-2.5 py-1 rounded-md border transition-all"
                :class="activeSpatialIndex === item.index
                  ? 'bg-red-500/22 border-red-400/45 text-white'
                  : 'bg-black/35 border-white/10 text-gray-500 hover:border-red-500/30 hover:text-gray-300'"
                @click="onSpatialSelect(item.ev, item.displayIndex)"
              >
                R{{ item.ev.round + 1 }} · {{ item.ev.callout }}
              </button>
            </div>
          </div>

          <div
            v-if="recordingId"
            class="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.08] bg-black/25 px-2.5 py-2"
          >
            <span class="text-[9px] font-semibold uppercase tracking-wider text-gray-600">Video sync</span>
            <button type="button" class="text-[10px] font-bold px-2 py-0.5 rounded border border-white/10 text-gray-500 hover:text-white" @click="nudgeTimelineSync(-1000)">−1s</button>
            <span class="text-[10px] tabular-nums text-gray-400 min-w-[2.5rem] text-center">{{ syncOffsetLabel }}</span>
            <button type="button" class="text-[10px] font-bold px-2 py-0.5 rounded border border-white/10 text-gray-500 hover:text-white" @click="nudgeTimelineSync(1000)">+1s</button>
            <button v-if="videoSyncOffsetMs" type="button" class="text-[9px] px-1.5 py-0.5 rounded text-gray-600 hover:text-gray-300" @click="resetTimelineSync">Reset</button>
          </div>

          <p v-if="!canSeekFromSpatial" class="text-[10px] text-amber-300/80">
            <template v-if="spatialPreviewAvailable">1 free death seek ·</template>
            <button type="button" class="underline hover:text-amber-200" @click="openUpgrade">Upgrade for unlimited seeks</button>
          </p>
        </div>
      </aside>

      </div>
  </div>
</template>
