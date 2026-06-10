<template>
  <div class="flex flex-col h-full bg-[#111111] text-white overflow-hidden">

    <!-- Header -->
    <div class="flex-shrink-0 px-3 pt-2 pb-2 border-b border-white/[0.08] bg-[#111111]">
      <div class="panel-elevated relative flex flex-wrap items-center gap-x-2.5 gap-y-2 px-3 py-2">
        <div class="absolute -right-6 top-0 h-20 w-20 rounded-full bg-red-500/10 blur-3xl pointer-events-none" />
        <button
          class="relative flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors text-xs flex-shrink-0"
          @click="$router.back()"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
          Back
        </button>
        <div class="relative flex items-center gap-2 flex-1 min-w-0">
          <img v-if="agentImageUrl" :src="agentImageUrl" class="w-8 h-8 object-contain rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5" />
          <div class="min-w-0">
            <p class="text-[10px] font-black uppercase tracking-[0.22em] text-red-400/70">VOD Review</p>
            <p class="text-sm font-bold text-white truncate leading-tight">
              {{ timeline?.agent || 'Match replay' }}<span v-if="timeline?.map" class="text-gray-500 font-medium"> · {{ timeline.map }}</span>
            </p>
          </div>
          <span
            v-if="timeline?.gameMode"
            class="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.04] text-gray-400 uppercase tracking-wide"
          >{{ timeline.gameMode }}</span>
        </div>

      <!-- KDA summary -->
      <div v-if="timeline?.finalStats" class="relative flex items-center gap-2 flex-shrink-0">
        <div class="flex items-center gap-1.5 text-xs">
          <span class="font-bold text-green-400">{{ timeline.finalStats.kills }}</span>
          <span class="text-gray-600">/</span>
          <span class="font-bold text-red-400">{{ timeline.finalStats.deaths }}</span>
          <span class="text-gray-600">/</span>
          <span class="font-bold text-blue-400">{{ timeline.finalStats.assists }}</span>
          <span class="text-xs text-gray-600 ml-0.5">KDA</span>
        </div>
        <div
          v-if="timeline.finalStats.won !== undefined"
          class="text-xs font-bold px-1.5 py-0.5 rounded"
          :class="timeline.finalStats.won ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'"
        >
          {{ timeline.finalStats.won ? 'WIN' : 'LOSS' }}
        </div>
      </div>

      <button
        v-if="hasSpatialIntel"
        type="button"
        class="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors"
        :class="spatialMapVisible
          ? 'border-red-500/30 bg-red-500/10 text-red-200 hover:border-red-500/40'
          : 'border-white/[0.08] bg-white/[0.04] text-gray-300 hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-white'"
        @click="spatialMapVisible = !spatialMapVisible"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 20 20">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M3.75 5.75h12.5v8.5H3.75v-8.5Zm2 10.25h8.5M8 3.75v2"/>
        </svg>
        {{ spatialMapVisible ? 'Hide Intel' : 'Intel Map' }}
      </button>
      <span
        v-if="activeRoundNumber != null"
        class="hidden sm:inline-flex flex-shrink-0 items-center rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400"
      >
        Round {{ activeRoundNumber + 1 }}
      </span>
      <button
        v-if="timeline?.videoPath"
        type="button"
        class="hidden sm:flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors"
        :class="theaterMode
          ? 'border-red-500/30 bg-red-500/10 text-red-200 hover:border-red-500/40'
          : 'border-white/[0.08] bg-white/[0.04] text-gray-300 hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-white'"
        :title="theaterMode ? 'Exit theater (T)' : 'Theater mode (T)'"
        @click="toggleTheaterMode"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/>
        </svg>
        {{ theaterMode ? 'Exit theater' : 'Theater' }}
      </button>
      <button
        class="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-gray-300 transition-colors hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-white"
        @click="showInsightsPanel = !showInsightsPanel"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 20 20">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M6.75 6.75h6.5M6.75 10h6.5M6.75 13.25h4.5M4.75 3.75h10.5a1 1 0 0 1 1 1v10.5a1 1 0 0 1-1 1H4.75a1 1 0 0 1-1-1V4.75a1 1 0 0 1 1-1Z"/>
        </svg>
        {{ showInsightsPanel ? 'Hide Notes' : 'Notes' }}
      </button>
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-xs font-bold text-gray-400 transition-colors hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-white"
        title="Keyboard shortcuts (?)"
        @click="showShortcuts = true"
      >?</button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="timelineLoading" class="flex flex-1 flex-col items-center justify-center gap-3">
      <svg class="w-8 h-8 text-red-400 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      <p class="text-sm text-gray-400">Loading match timeline…</p>
    </div>

    <!-- Error -->
    <div v-else-if="timelineError" class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div class="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <svg class="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      </div>
      <div>
        <p class="text-sm font-semibold text-gray-200">Could not load VOD</p>
        <p class="text-xs text-gray-500 mt-1 max-w-sm">{{ timelineError }}</p>
      </div>
      <div class="flex items-center gap-2">
        <button class="px-3 py-1.5 text-xs font-medium text-gray-300 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors" @click="$router.back()">Go back</button>
        <button class="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors" @click="loadTimeline">Retry</button>
      </div>
    </div>

    <!-- Main content -->
    <div v-else class="flex flex-1 min-h-0">

      <!-- Left sidebar: event feed -->
      <div
        v-if="!theaterMode"
        class="w-44 xl:w-52 flex-shrink-0 border-r border-white/[0.09] flex flex-col overflow-hidden bg-[#141414]"
      >
        <div class="px-3 py-2.5 border-b border-white/[0.09]">
          <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Timeline</p>
        </div>
        <div ref="sidebarEl" class="flex-1 overflow-y-auto scrollbar-hide scroll-smooth space-y-1 px-1.5 py-2">
          <template v-for="round in roundGroups" :key="round.roundNumber">
            <!-- Round header -->
            <button
              :data-round-anchor="round.roundNumber"
              class="w-full rounded-2xl border px-3 py-2 text-left transition-all"
              :class="activeRoundNumber === round.roundNumber
                ? 'border-white/[0.16] bg-white/[0.08] shadow-[0_10px_30px_rgba(0,0,0,0.24)]'
                : 'border-transparent bg-transparent hover:border-white/[0.08] hover:bg-white/[0.04]'"
              @click="seekToRound(round)"
            >
              <div class="flex items-center gap-2.5">
                <span class="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2 text-[10px] font-black text-gray-200">
                  R{{ round.roundNumber + 1 }}
                </span>
                <span class="h-2.5 w-2.5 rounded-full" :class="round.won ? 'bg-emerald-400' : 'bg-red-400'" />
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-semibold text-gray-200">{{ roundOutcomeLabel(round) }}</p>
                  <p class="text-[10px] text-gray-500">{{ round.events.length }} event{{ round.events.length === 1 ? '' : 's' }}</p>
                </div>
                <img
                  v-if="roundOutcomeIcon(round)"
                  :src="roundOutcomeIcon(round)!"
                  class="h-6 w-6 object-contain opacity-80"
                />
              </div>
            </button>

            <!-- Kill/death events in this round -->
            <button
              v-for="event in round.events"
              :key="`${event.type}-${event.videoOffsetMs}`"
              class="w-full flex items-center gap-1.5 px-2 py-1.5 pl-3 hover:bg-white/[0.05] transition-colors text-left group"
              :class="isNearEvent(event) ? 'bg-white/[0.04]' : ''"
              @click="seekToEvent(event)"
            >
              <!-- Spike plant/defuse events -->
              <template v-if="isSpikeEvent(event)">
                <div class="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded overflow-hidden"
                     :class="event.type === 'plant' ? 'bg-orange-500/20' : event.type === 'defuse' ? 'bg-cyan-500/20' : 'bg-yellow-500/20'">
                  <img
                    :src="event.type === 'plant' ? iconExplosionWin : event.type === 'defuse' ? iconDiffuseWin : iconExplosionLoss"
                    class="w-3.5 h-3.5 object-contain"
                    :class="event.type === 'plant' ? 'opacity-90' : event.type === 'defuse' ? 'opacity-90' : 'opacity-90'"
                  />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-[10px] font-bold leading-tight"
                     :class="event.type === 'plant' ? 'text-orange-400' : event.type === 'defuse' ? 'text-cyan-400' : 'text-yellow-400'">
                    {{ event.type === 'plant' ? (event.site ? `PLANT ${event.site}` : 'PLANT') : event.type === 'defuse' ? 'DEFUSE' : 'DETONATE' }}
                  </p>
                  <p v-if="event.planter || event.defuser" class="text-[8px] text-gray-600 truncate">{{ formatPlayerLabel(event.planter || event.defuser) }}</p>
                </div>
                <span class="text-[8px] text-gray-700 flex-shrink-0 tabular-nums">{{ formatMs(event.videoOffsetMs) }}</span>
              </template>

              <!-- Neutral events: neither the player as killer nor victim -->
              <template v-else-if="event.type === 'neutral'">
                <!-- Killer agent portrait -->
                <div class="w-5 h-5 flex-shrink-0 rounded overflow-hidden bg-white/[0.03] ring-1 ring-white/10">
                  <img v-if="agentByPuuid(event.killerPuuid)" :src="getAgentImage(agentByPuuid(event.killerPuuid))" class="w-full h-full object-contain opacity-50" />
                  <div v-else class="w-full h-full flex items-center justify-center text-[8px] text-gray-700">?</div>
                </div>
                <!-- Arrow -->
                <svg class="w-2.5 h-2.5 text-gray-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
                </svg>
                <!-- Victim agent portrait -->
                <div class="w-5 h-5 flex-shrink-0 rounded overflow-hidden bg-white/[0.03] ring-1 ring-white/10">
                  <img v-if="agentByPuuid(event.victimPuuid)" :src="getAgentImage(agentByPuuid(event.victimPuuid))" class="w-full h-full object-contain opacity-40" />
                  <div v-else class="w-full h-full flex items-center justify-center text-[8px] text-gray-700">?</div>
                </div>
                <!-- Name -->
                <div class="flex-1 min-w-0">
                  <p class="text-[9px] text-gray-600 truncate leading-tight">
                    {{ event.killerName || '?' }} → {{ event.victimName || '?' }}
                  </p>
                  <p v-if="event.weapon && !['Ability','Ultimate','Fall'].includes(event.weapon)" class="text-[8px] text-gray-700 truncate">{{ event.weapon }}</p>
                </div>
                <span class="text-[8px] text-gray-800 flex-shrink-0 tabular-nums">{{ formatMs(event.videoOffsetMs) }}</span>
              </template>

              <!-- Player kill or death events -->
              <template v-else>
                <!-- Kill/Death badge pill -->
                <div class="w-5 flex-shrink-0 flex flex-col items-center gap-px">
                  <span class="text-[7px] font-black leading-none px-0.5 rounded"
                        :class="event.type === 'kill' ? 'text-teal-300 bg-teal-500/20' : 'text-red-300 bg-red-500/20'">
                    {{ event.type === 'kill' ? 'KILL' : 'DIED' }}
                  </span>
                  <span v-if="event.isFirstBlood" class="text-[6px] font-bold text-yellow-400 leading-none">FB</span>
                </div>

                <!-- Agent portrait of the other player -->
                <div class="w-6 h-6 flex-shrink-0 rounded overflow-hidden bg-white/[0.04] ring-1"
                     :class="event.type === 'kill' ? 'ring-teal-500/30' : 'ring-red-500/30'">
                  <img
                    v-if="event.type === 'kill' && agentByPuuid(event.victimPuuid)"
                    :src="getAgentImage(agentByPuuid(event.victimPuuid))"
                    class="w-full h-full object-contain opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                  <img
                    v-else-if="event.type === 'death' && agentByPuuid(event.killerPuuid)"
                    :src="getAgentImage(agentByPuuid(event.killerPuuid))"
                    class="w-full h-full object-contain opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <svg v-if="event.type === 'kill'" class="w-3.5 h-3.5 text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>
                    <svg v-else class="w-3.5 h-3.5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </div>
                </div>

                <!-- Weapon / ability icon -->
                <div class="w-7 flex-shrink-0 flex items-center justify-center">
                  <img
                    v-if="event.weapon && !['Ability', 'Ultimate', 'Spike', 'Fall'].includes(event.weapon) && getWeaponIcon(event.weapon)"
                    :src="getWeaponIcon(event.weapon)"
                    class="w-7 h-3.5 object-contain"
                    :class="event.type === 'kill' ? 'opacity-90' : 'opacity-40'"
                    :title="event.weapon"
                  />
                  <div v-else-if="event.weapon === 'Ability' || event.weapon === 'Ultimate'"
                       class="w-5 h-5 rounded flex items-center justify-center"
                       :class="event.weapon === 'Ultimate' ? 'bg-yellow-500/20' : 'bg-purple-500/20'">
                    <img v-if="getAbilityKillIcon(event)" :src="getAbilityKillIcon(event)" class="w-4 h-4 object-contain" />
                    <template v-else-if="event.weapon === 'Ultimate'">
                      <span class="text-[8px]" :class="'text-yellow-400'">X</span>
                    </template>
                    <svg v-else class="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.09 12.96A1 1 0 0 0 5 14.5h6.5L10 22l10-11h-7z"/></svg>
                  </div>
                  <span v-else-if="event.weapon === 'Spike'" class="text-orange-400"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 20,12 12,22 4,12"/></svg></span>
                  <svg v-else-if="event.weapon === 'Fall'" class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 20 20">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M10 4.5v9m0 0-3-3m3 3 3-3"/>
                  </svg>
                  <svg v-else class="w-3 h-3 text-gray-700" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="6" r="4"/><path d="M6 11h4v4H6z"/>
                  </svg>
                </div>

                <!-- Name + weapon label -->
                <div class="flex-1 min-w-0">
                  <p class="text-[11px] leading-tight truncate transition-colors"
                     :class="event.type === 'kill' ? 'text-gray-300 group-hover:text-white' : 'text-gray-500 group-hover:text-gray-300'">
                    {{ event.type === 'kill' ? event.victimName : event.killerName }}
                  </p>
                  <p v-if="event.weapon && !['Ability', 'Ultimate', 'Fall'].includes(event.weapon)" class="text-[8px] text-gray-600 truncate">{{ event.weapon }}</p>
                  <p v-else-if="event.weapon === 'Ultimate'" class="text-[8px] text-yellow-600 truncate">Ultimate</p>
                  <p v-else-if="event.weapon === 'Ability'" class="text-[8px] text-purple-600 truncate">Ability</p>
                </div>
                <span class="text-[8px] text-gray-700 flex-shrink-0 tabular-nums">{{ formatMs(event.videoOffsetMs) }}</span>
              </template>
            </button>
          </template>

          <!-- No events -->
          <div v-if="!roundGroups.length" class="px-3 py-4 text-center">
            <p class="text-xs text-gray-600">No timeline data</p>
          </div>
        </div>
      </div>

      <!-- Video + intel + timeline -->
      <div class="flex flex-1 min-w-0 min-h-0">

      <div class="flex-1 flex flex-col min-w-0 min-h-0">

        <!-- Video area — frame sized to video aspect ratio (no letterboxing inside the picture) -->
        <div
          ref="videoAreaEl"
          class="flex-1 relative min-h-[200px] flex items-center justify-center bg-[#111111] overflow-hidden"
          :class="{ 'cursor-none': cursorHidden && !theaterMode }"
          @mousemove="onVideoMouseMove"
        >
          <div
            ref="videoFrameEl"
            class="relative bg-black shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
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
            preload="metadata"
            @timeupdate="onTimeUpdate"
            @loadedmetadata="onLoadedMetadata"
            @durationchange="onLoadedMetadata"
            @play="isPlaying = true"
            @pause="isPlaying = false"
            @ended="isPlaying = false"
          />
          <div v-else class="w-full h-full min-h-[240px] min-w-[320px] flex flex-col items-center justify-center gap-3 text-gray-600 pointer-events-none select-none">
            <svg class="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.867v6.266a1 1 0 01-1.447.902L15 14M5 8a2 2 0 00-2 2v4a2 2 0 002 2h8a2 2 0 002-2v-4a2 2 0 00-2-2H5z"/>
            </svg>
            <span class="text-xs text-gray-600">No video for this session</span>
            <span class="text-[10px] text-gray-700 text-center max-w-xs">
              {{ recordingId
                ? 'OBS was not recording when this match was captured'
                : 'Recording unavailable — it may have been deleted locally or expired from cloud storage (30 days).' }}
            </span>
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

          <!-- Play/pause overlay — subtle; hidden while playing -->
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

          </div>
        </div>

        <!-- Mobile / collapsed intel band — large map above scrubber -->
        <div
          v-if="hasSpatialIntel && !theaterMode"
          class="flex-shrink-0 border-b border-white/[0.08] bg-[#131313] px-3 py-2"
          :class="spatialMapVisible ? 'md:hidden' : ''"
          @click.stop
        >
          <div class="flex flex-col sm:flex-row gap-3 min-h-0">
            <div class="flex-shrink-0 mx-auto sm:mx-0" @mousedown.stop @click.stop>
              <MatchSpatialMinimap
                dock-expanded
                :dock-large="spatialMapLarge"
                :summary="displaySpatialSummary"
                :map-name="timeline?.map"
                :active-index="activeSpatialDisplayIndex"
                :show-legend="false"
                :show-heatmap="spatialViewMode !== 'dots'"
                :heatmap-layer="spatialViewMode === 'sites' ? 'site' : 'callout'"
                :round-filter="spatialRoundFilter"
                :show-round-slider="availableSpatialRounds.length > 1"
                @update:round-filter="spatialRoundFilter = $event"
                @select="onSpatialSelect"
              />
            </div>
            <div class="flex-1 min-w-0 flex flex-col gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-[9px] font-black uppercase tracking-[0.2em] text-red-400/85">Match Intel</span>
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
                  @click="spatialMapVisible = false"
                >Hide</button>
                <button
                  v-else
                  type="button"
                  class="ml-auto hidden md:flex text-[9px] font-semibold text-gray-500 hover:text-gray-300"
                  @click="spatialMapVisible = true"
                >Dock to side</button>
              </div>
              <p
                v-if="spatialSummary?.heatmapInsight"
                class="text-[11px] leading-snug font-medium text-gray-300"
              >{{ spatialSummary.heatmapInsight }}</p>
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

        <!-- Slim intel strip when side panel is open (desktop) -->
        <div
          v-else-if="hasSpatialIntel && !theaterMode && spatialMapVisible"
          class="hidden md:flex flex-shrink-0 items-center gap-2 border-b border-white/[0.08] bg-[#131313] px-3 py-1 min-h-[32px]"
          @click.stop
        >
          <span class="text-[9px] font-black uppercase tracking-[0.18em] text-red-400/85">Intel</span>
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
          <p
            v-if="spatialSummary?.heatmapInsight"
            class="flex-1 min-w-0 text-[10px] text-gray-400 truncate"
            :title="spatialSummary.heatmapInsight"
          >{{ spatialSummary.heatmapInsight }}</p>
          <div ref="dockChipsEl" class="flex gap-1 overflow-x-auto scrollbar-hide max-w-[40%]">
            <button
              v-for="item in spatialDeathChips"
              :key="item.index"
              :data-spatial-chip="item.index"
              type="button"
              class="flex-shrink-0 text-[9px] font-semibold px-2 py-0.5 rounded-md border transition-all"
              :class="activeSpatialIndex === item.index
                ? 'bg-red-500/22 border-red-400/45 text-white'
                : 'bg-black/35 border-white/10 text-gray-500 hover:border-red-500/30 hover:text-gray-300'"
              @click="onSpatialSelect(item.ev, item.displayIndex)"
            >R{{ item.ev.round + 1 }} · {{ item.ev.callout }}</button>
          </div>
        </div>

        <!-- Controls + timeline scrubber -->
        <div class="flex-shrink-0 border-t border-white/[0.10] bg-[#161616] px-2.5 pt-1.5 pb-2">
          <div class="backdrop-blur-sm bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 space-y-2 shadow-[0_12px_40px_rgba(0,0,0,0.3)]">
            <div class="relative group cursor-pointer h-6 flex items-center" @click="onScrubberClick" @mousemove="onScrubberHover" @mouseleave="hoverTime = null">
              <div class="w-full h-2 rounded-full bg-white/[0.08] ring-1 ring-white/[0.04] relative overflow-visible">
                <div
                  class="h-full rounded-full bg-gradient-to-r from-red-500 via-red-400 to-orange-400 pointer-events-none shadow-[0_0_18px_rgba(239,68,68,0.35)]"
                  :style="{ width: progressPercent + '%' }"
                />
                <div
                  v-for="sep in roundSeparators"
                  :key="sep.percent"
                  class="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-white/18 pointer-events-none"
                  :style="{ left: sep.percent + '%' }"
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
                class="absolute bottom-full mb-2 -translate-x-1/2 rounded-lg border border-white/[0.08] bg-black/80 px-2 py-1 text-xs text-gray-200 tabular-nums pointer-events-none"
                :style="{ left: (hoverTime / duration * 100) + '%' }"
              >{{ formatMs(hoverTime * 1000) }}</div>
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

              <div class="hidden xl:flex items-center gap-2 ml-1 flex-wrap justify-end">
                <div class="flex items-center gap-1">
                  <div class="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span class="text-[10px] text-gray-500">Kill</span>
                </div>
                <div class="flex items-center gap-1">
                  <div class="h-2.5 w-2.5 rounded-full bg-red-500" />
                  <span class="text-[10px] text-gray-500">Death</span>
                </div>
                <div class="flex items-center gap-1">
                  <div class="h-3 w-2 rounded-full bg-orange-500" />
                  <span class="text-[10px] text-gray-500">Plant</span>
                </div>
                <div class="flex items-center gap-1">
                  <div class="h-3 w-2 rounded-full bg-cyan-500" />
                  <span class="text-[10px] text-gray-500">Defuse</span>
                </div>
                <div class="flex items-center gap-1">
                  <div class="h-2.5 w-2.5 rounded-full bg-yellow-500" />
                  <span class="text-[10px] text-gray-500">Detonate</span>
                </div>
              </div>
            </div>

            <div class="hidden xl:flex items-center gap-3 px-1 flex-wrap">
              <div class="flex items-center gap-1">
                <kbd class="px-1 py-px text-[9px] font-bold bg-white/[0.06] border border-white/[0.1] rounded text-gray-500">Space</kbd>
                <span class="text-[9px] text-gray-700">Play</span>
              </div>
              <div class="flex items-center gap-1">
                <kbd class="px-1 py-px text-[9px] font-bold bg-white/[0.06] border border-white/[0.1] rounded text-gray-500">←</kbd>
                <kbd class="px-1 py-px text-[9px] font-bold bg-white/[0.06] border border-white/[0.1] rounded text-gray-500">→</kbd>
                <span class="text-[9px] text-gray-700">Skip 5s</span>
              </div>
              <div class="flex items-center gap-1">
                <kbd class="px-1 py-px text-[9px] font-bold bg-white/[0.06] border border-white/[0.1] rounded text-gray-500">J</kbd>
                <kbd class="px-1 py-px text-[9px] font-bold bg-white/[0.06] border border-white/[0.1] rounded text-gray-500">L</kbd>
                <span class="text-[9px] text-gray-700">Prev/Next event</span>
              </div>
              <div class="flex items-center gap-1">
                <kbd class="px-1 py-px text-[9px] font-bold bg-white/[0.06] border border-white/[0.1] rounded text-gray-500">[</kbd>
                <kbd class="px-1 py-px text-[9px] font-bold bg-white/[0.06] border border-white/[0.1] rounded text-gray-500">]</kbd>
                <span class="text-[9px] text-gray-700">Speed</span>
              </div>
              <div class="flex items-center gap-1">
                <kbd class="px-1 py-px text-[9px] font-bold bg-white/[0.06] border border-white/[0.1] rounded text-gray-500">S</kbd>
                <span class="text-[9px] text-gray-700">Scoreboard</span>
              </div>
              <div class="flex items-center gap-1">
                <kbd class="px-1 py-px text-[9px] font-bold bg-white/[0.06] border border-white/[0.1] rounded text-gray-500">T</kbd>
                <span class="text-[9px] text-gray-700">Theater</span>
              </div>
              <div class="flex items-center gap-1">
                <kbd class="px-1 py-px text-[9px] font-bold bg-white/[0.06] border border-white/[0.1] rounded text-gray-500">F</kbd>
                <span class="text-[9px] text-gray-700">Fullscreen</span>
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
                <img :src="iconExplosionWin" class="w-2.5 h-2.5 object-contain" alt="" />PLANTED</span>
              <span v-if="selectedRound.spikeDefused" class="inline-flex items-center gap-1 text-[9px] font-semibold text-cyan-400 bg-cyan-500/10 px-1.5 py-px rounded">
                <img :src="iconDiffuseWin" class="w-2.5 h-2.5 object-contain" alt="" />DEFUSED</span>
              <span v-if="selectedRound.spikeDetonated" class="inline-flex items-center gap-1 text-[9px] font-semibold text-red-400 bg-red-500/10 px-1.5 py-px rounded">
                <img :src="iconExplosionLoss" class="w-2.5 h-2.5 object-contain" alt="" />DETONATED</span>
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
                <div class="w-1 h-6 rounded-full flex-shrink-0"
                     :class="event.type === 'plant' ? 'bg-orange-500/70' : event.type === 'defuse' ? 'bg-cyan-500/70' : 'bg-yellow-500/70'" />
                <div class="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 overflow-hidden"
                     :class="event.type === 'plant' ? 'bg-orange-500/20' : event.type === 'defuse' ? 'bg-cyan-500/20' : 'bg-yellow-500/20'">
                  <img
                    :src="event.type === 'plant' ? iconExplosionWin : event.type === 'defuse' ? iconDiffuseWin : iconExplosionLoss"
                    class="w-5 h-5 object-contain"
                  />
                </div>
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
                <!-- Kill/death type indicator -->
                <div class="w-1 h-6 rounded-full flex-shrink-0"
                     :class="event.type === 'kill' ? 'bg-teal-500/60' : 'bg-red-500/40'" />

                <!-- First blood badge -->
                <div v-if="event.isFirstBlood" class="flex-shrink-0 text-[7px] font-black text-yellow-400 bg-yellow-500/20 px-1 py-px rounded leading-none">FB</div>

                <!-- Attacker agent portrait -->
                <div class="w-7 h-7 rounded overflow-hidden bg-white/[0.04] flex-shrink-0 ring-1"
                     :class="event.type === 'kill' ? 'ring-teal-500/20' : 'ring-red-500/20'">
                  <img
                    v-if="agentByPuuid(event.killerPuuid)"
                    :src="getAgentImage(agentByPuuid(event.killerPuuid))"
                    class="w-full h-full object-contain"
                  />
                  <div v-else class="w-full h-full flex items-center justify-center text-xs">
                    <svg v-if="event.type === 'kill'" class="w-3.5 h-3.5 text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>
                    <svg v-else class="w-3.5 h-3.5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </div>
                </div>

                <!-- Weapon / ability icon -->
                <div class="w-10 flex-shrink-0 flex items-center justify-center">
                  <!-- Regular weapon -->
                  <img
                    v-if="event.weapon && !['Ability', 'Ultimate', 'Spike', 'Fall'].includes(event.weapon) && getWeaponIcon(event.weapon)"
                    :src="getWeaponIcon(event.weapon)"
                    class="h-3.5 w-auto object-contain"
                    :class="event.type === 'kill' ? 'opacity-90' : 'opacity-40'"
                  />
                  <!-- Ability kill -->
                  <div v-else-if="event.weapon === 'Ability' || event.weapon === 'Ultimate'"
                       class="w-6 h-6 rounded flex items-center justify-center"
                       :class="event.weapon === 'Ultimate' ? 'bg-yellow-500/20' : 'bg-purple-500/20'"
                       :title="event.weapon">
                    <img
                      v-if="getAbilityKillIcon(event)"
                      :src="getAbilityKillIcon(event)"
                      class="w-5 h-5 object-contain"
                    />
                    <template v-else-if="event.weapon === 'Ultimate'">
                      <span class="text-xs text-yellow-400">X</span>
                    </template>
                    <svg v-else class="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.09 12.96A1 1 0 0 0 5 14.5h6.5L10 22l10-11h-7z"/></svg>
                  </div>
                  <span v-else-if="event.weapon === 'Spike'" class="text-orange-400"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 20,12 12,22 4,12"/></svg></span>
                  <svg v-else class="w-3 h-3 text-gray-600" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="6" r="3"/><path d="M5 11h6v4H5z"/></svg>
                </div>

                <!-- Arrow separator -->
                <svg class="w-3 h-3 text-gray-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>

                <!-- Victim agent portrait -->
                <div class="w-7 h-7 rounded overflow-hidden bg-white/[0.04] flex-shrink-0 ring-1"
                     :class="event.type === 'kill' ? 'ring-red-500/20' : 'ring-teal-500/20'">
                  <img
                    v-if="agentByPuuid(event.victimPuuid)"
                    :src="getAgentImage(agentByPuuid(event.victimPuuid))"
                    class="w-full h-full object-contain opacity-75"
                  />
                  <div v-else class="w-full h-full flex items-center justify-center text-xs">
                    <svg class="w-3.5 h-3.5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </div>
                </div>

                <!-- Victim name + kill context -->
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-semibold truncate" :class="event.type === 'kill' ? 'text-gray-300 group-hover:text-white' : 'text-gray-500 group-hover:text-gray-300'">
                    {{ event.victimName }}
                  </p>
                  <p class="text-[9px] truncate"
                     :class="event.weapon === 'Ultimate' ? 'text-yellow-700' : event.weapon === 'Ability' ? 'text-purple-700' : 'text-gray-600'">
                    {{ event.weapon === 'Ultimate' ? 'Ultimate' : event.weapon === 'Ability' ? 'Ability' : (event.weapon || '') }}
                    <span v-if="event.assistants?.length" class="text-gray-700 ml-1">+ {{ event.assistants.length }} assist</span>
                  </p>
                </div>

                <!-- Timestamp -->
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

      <!-- Desktop intel side panel — full-size heatmap -->
      <aside
        v-if="hasSpatialIntel && spatialMapVisible && !theaterMode"
        class="hidden md:flex w-[min(280px,26vw)] xl:w-[min(300px,28vw)] flex-shrink-0 flex-col min-h-0 border-l border-white/[0.09] bg-[#121212]"
        @click.stop
      >
        <div class="flex items-center gap-2 px-3 py-2 border-b border-white/[0.08] flex-shrink-0">
          <div class="flex-1 min-w-0">
            <p class="text-[9px] font-black uppercase tracking-[0.22em] text-red-400">Match Intel</p>
            <p v-if="spatialSummary?.heatmapInsight" class="text-[10px] text-gray-400 truncate mt-0.5" :title="spatialSummary.heatmapInsight">
              {{ spatialSummary.heatmapInsight }}
            </p>
          </div>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-gray-500 hover:text-gray-200"
            :title="spatialMapLarge ? 'Standard size' : 'Larger map'"
            @click="spatialMapLarge = !spatialMapLarge"
          >{{ spatialMapLarge ? '−' : '+' }}</button>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-gray-500 hover:text-gray-200"
            title="Hide intel panel"
            @click="spatialMapVisible = false"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 20 20">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="m12.5 5.5-5 4.5 5 4.5"/>
            </svg>
          </button>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-3 py-3 space-y-3">
          <div class="mx-auto w-fit" @mousedown.stop @click.stop>
            <MatchSpatialMinimap
              panel-hud
              :panel-large="spatialMapLarge"
              :summary="displaySpatialSummary"
              :map-name="timeline?.map"
              :active-index="activeSpatialDisplayIndex"
              :show-legend="true"
              :show-heatmap="spatialViewMode !== 'dots'"
              :heatmap-layer="spatialViewMode === 'sites' ? 'site' : 'callout'"
              :round-filter="spatialRoundFilter"
              :show-round-slider="availableSpatialRounds.length > 1"
              @update:round-filter="spatialRoundFilter = $event"
              @select="onSpatialSelect"
            />
          </div>

          <div class="flex items-center gap-0.5 p-0.5 rounded-lg bg-black/25 border border-white/[0.06] w-fit">
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

      <div
        v-if="showInsightsPanel && !theaterMode"
        class="w-56 flex-shrink-0 border-l border-white/[0.09] bg-[#0d0d0d] flex flex-col min-h-0"
      >
        <div class="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.09]">
          <p class="flex-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">Coaching Notes</p>
          <button
            class="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-gray-500 transition-colors hover:border-white/[0.14] hover:text-gray-200"
            title="Hide notes"
            @click="showInsightsPanel = false"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 20 20">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="m12.5 5.5-5 4.5 5 4.5"/>
            </svg>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto scrollbar-hide px-2.5 py-2.5 space-y-2">
          <div
            v-for="(note, index) in coachingNotes"
            :key="`${index}-${note}`"
            class="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2"
          >
            <div class="flex items-start gap-2">
              <span class="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-400" />
              <p class="text-[11px] leading-relaxed text-gray-400">{{ note }}</p>
            </div>
          </div>
          <div class="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2">
            <p class="text-[9px] font-semibold uppercase tracking-[0.2em] text-gray-600">Review flow</p>
            <p class="mt-1.5 text-[10px] leading-relaxed text-gray-600">Use the timeline and scrubber markers to jump to kills, deaths, and spike moments.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Keyboard shortcuts overlay -->
    <Transition name="event-pop">
      <div
        v-if="showShortcuts"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
        @click.self="showShortcuts = false"
      >
        <div class="w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#1a1a1a] shadow-2xl overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
            <p class="text-sm font-semibold text-white">Keyboard shortcuts</p>
            <button class="text-gray-500 hover:text-gray-300 transition-colors" @click="showShortcuts = false">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
            </button>
          </div>
          <div class="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div v-for="s in shortcutLegend" :key="s.key" class="flex items-center justify-between gap-2 py-1">
              <kbd class="font-mono text-[10px] text-gray-300 bg-white/[0.06] border border-white/[0.10] rounded px-1.5 py-0.5">{{ s.key }}</kbd>
              <span class="text-gray-500 text-right">{{ s.label }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getWeaponImage, getAgentImage, getAbilityIcon, getMapImage } from '../lib/valorant'
import { pendingTimeline } from '../stores/pendingTimeline'
import MatchSpatialMinimap from '../components/MatchSpatialMinimap.vue'
import type { MatchSpatialSummary, SpatialTimelineEvent } from '../lib/spatial-types'
import { canSpatialVodSeek } from '../lib/tier-features'

// Round outcome icons — bundled locally to avoid CSP/CDN issues
import iconDiffuseWin from '../assets/round-icons/diffusewin1.png'
import iconDiffuseLoss from '../assets/round-icons/diffuseloss1.png'
import iconTimeWin from '../assets/round-icons/timewin1.png'
import iconTimeLoss from '../assets/round-icons/timeloss1.png'
import iconEliminationWin from '../assets/round-icons/eliminationwin1.png'
import iconEliminationLoss from '../assets/round-icons/eliminationloss1.png'
import iconExplosionWin from '../assets/round-icons/explosionwin1.png'
import iconExplosionLoss from '../assets/round-icons/explosionloss1.png'

interface KillEvent {
  killerName: string
  victimName: string
  assistants?: string[]
  weapon?: string
  abilitySlot?: 'grenade' | 'ability1' | 'ability2' | 'ultimate'
  videoOffsetMs?: number
  round?: number
  type?: 'kill' | 'death'
  killerPuuid?: string
  victimPuuid?: string
}

interface TimelineEvent extends Omit<KillEvent, 'type'> {
  type: 'kill' | 'death' | 'neutral' | 'plant' | 'defuse' | 'detonation'
  isFirstBlood?: boolean
  // Spike-specific fields
  planter?: string
  defuser?: string
  site?: string
}

interface RoundGroup {
  roundNumber: number
  won: boolean
  spikePlanted: boolean
  spikeDefused: boolean
  spikeDetonated: boolean
  ceremony: string | null
  firstVideoOffsetMs: number | null
  events: TimelineEvent[]
}

interface RoundSummary {
  roundNumber: number
  winningTeam: string | null
  spikePlanted: boolean
  spikeDefused: boolean
  spikeDetonated?: boolean
  ceremony?: string | null
}

interface FinalStats {
  kills: number
  deaths: number
  assists: number
  won?: boolean
}

interface TeamPlayerSnapshot {
  summonerName: string
  agent: string | null
  team: string
  kills: number
  deaths: number
  assists: number
  score: number
  level: number
  puuid: string | null
  competitiveTier: number
  competitiveTierName: string
  abilityCasts: { grenade: number; ability1: number; ability2: number; ultimate: number } | null
}

interface RecordingTimeline {
  id: string
  videoPath: string | null
  map: string | null
  agent: string | null
  game: string
  gameMode: string
  recordedAt: number
  kills: KillEvent[]
  deaths: KillEvent[]
  roundSummaries: RoundSummary[]
  finalStats: FinalStats | null
  teamSnapshot: TeamPlayerSnapshot[]
  spikePlants?: Array<{ videoOffsetMs?: number; round?: number; planter?: string; site?: string }>
  spikeDefuses?: Array<{ videoOffsetMs?: number; round?: number; defuser?: string }>
  spikeDetonations?: Array<{ videoOffsetMs?: number; round?: number }>
  firstBloods?: Array<{ killerName: string; victimName: string; killerPuuid?: string; victimPuuid?: string; round?: number }>
  spatialSummary?: MatchSpatialSummary | null
  videoSyncOffsetMs?: number
}

interface AnalysisDetail {
  verdict: string | null
  top_issue: string | null
  priority_improvements: string[]
  coaching_tags: string[]
  ally_score: number | null
  enemy_score: number | null
}

interface ProgressMarker {
  key: string
  kind: 'round' | 'kill' | 'death' | 'neutral' | 'plant' | 'defuse' | 'detonation'
  label: string
  percent: number
  timeSeconds: number
}

const route = useRoute()
const router = useRouter()
const videoEl = ref<HTMLVideoElement | null>(null)
const videoAreaEl = ref<HTMLElement | null>(null)
const videoFrameEl = ref<HTMLElement | null>(null)
const sidebarEl = ref<HTMLElement | null>(null)
const theaterMode = ref(false)
const isFullscreen = ref(false)
const videoAspect = ref(16 / 9)
const videoFrameSize = ref({ width: 0, height: 0 })
let videoAreaObserver: ResizeObserver | null = null

const timeline = ref<RecordingTimeline | null>(null)
const timelineLoading = ref(true)
const timelineError = ref<string | null>(null)
const showShortcuts = ref(false)

const shortcutLegend = [
  { key: 'Space', label: 'Play / pause' },
  { key: '← / →', label: 'Skip 5s (Shift: 1s)' },
  { key: 'J / L', label: 'Prev / next event' },
  { key: '[ / ]', label: 'Slower / faster' },
  { key: 'T', label: 'Theater mode' },
  { key: 'F', label: 'Fullscreen' },
  { key: 'M', label: 'Toggle intel map' },
  { key: 'S', label: 'Scoreboard' },
  { key: 'R', label: 'Round detail' },
  { key: 'Esc', label: 'Back / exit' },
  { key: '?', label: 'This help' },
]
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const initialSeekDone = ref(false)
const hoverTime = ref<number | null>(null)
const playbackSpeed = ref(1)
const activeEventNotif = ref<TimelineEvent | null>(null)
const showScoreboard = ref(false)
const showInsightsPanel = ref(false)
const SPATIAL_MAP_VISIBLE_KEY = 'upforge_vod_map_visible'
const SPATIAL_MAP_LARGE_KEY = 'upforge_vod_map_large'
const THEATER_MODE_KEY = 'upforge_vod_theater_mode'

const spatialMapVisible = ref(true)
const spatialMapLarge = ref(false)
const dockChipsEl = ref<HTMLElement | null>(null)
const activeSpatialIndex = ref<number | null>(null)
const recordingId = ref<string | null>(null)
const userTier = ref('free')
const SPATIAL_PREVIEW_KEY = 'upforge_spatial_seek_preview_used'

const canSeekFromSpatial = computed(() => canSpatialVodSeek(userTier.value))
const spatialPreviewUsed = ref(false)
const spatialPreviewAvailable = computed(() =>
  !canSeekFromSpatial.value && !spatialPreviewUsed.value,
)

const spatialModes = [
  { id: 'heat' as const, label: 'Heat' },
  { id: 'sites' as const, label: 'Sites' },
  { id: 'dots' as const, label: 'Dots' },
]

function loadSpatialPreviewState() {
  try {
    spatialPreviewUsed.value = localStorage.getItem(SPATIAL_PREVIEW_KEY) === '1'
  } catch {
    spatialPreviewUsed.value = false
  }
}

function loadSpatialUiPrefs() {
  try {
    const vis = localStorage.getItem(SPATIAL_MAP_VISIBLE_KEY)
    if (vis !== null) spatialMapVisible.value = vis === '1'
    const large = localStorage.getItem(SPATIAL_MAP_LARGE_KEY)
    if (large !== null) spatialMapLarge.value = large === '1'
    const theater = localStorage.getItem(THEATER_MODE_KEY)
    if (theater !== null) theaterMode.value = theater === '1'
  } catch { /* ignore */ }
}

watch(spatialMapVisible, (v) => {
  try { localStorage.setItem(SPATIAL_MAP_VISIBLE_KEY, v ? '1' : '0') } catch { /* ignore */ }
})

watch(spatialMapLarge, (v) => {
  try { localStorage.setItem(SPATIAL_MAP_LARGE_KEY, v ? '1' : '0') } catch { /* ignore */ }
})

watch(theaterMode, (v) => {
  try { localStorage.setItem(THEATER_MODE_KEY, v ? '1' : '0') } catch { /* ignore */ }
})

watch(activeSpatialIndex, () => {
  nextTick(() => {
    if (activeSpatialIndex.value == null || !dockChipsEl.value) return
    const chip = dockChipsEl.value.querySelector(`[data-spatial-chip="${activeSpatialIndex.value}"]`)
    chip?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  })
})

function markSpatialPreviewUsed() {
  spatialPreviewUsed.value = true
  try {
    localStorage.setItem(SPATIAL_PREVIEW_KEY, '1')
  } catch { /* ignore */ }
}
const spatialViewMode = ref<'heat' | 'sites' | 'dots'>('heat')
const spatialRoundFilter = ref<number | null>(null)
const videoSyncOffsetMs = ref(0)
const selectedRound = ref<RoundGroup | null>(null)
const roundDetailExpanded = ref(false)
const coachingDetail = ref<AnalysisDetail | null>(null)
const ownPuuid = ref<string | null>(null)
let notifTimer: ReturnType<typeof setTimeout> | null = null

// ── Cursor auto-hide ──────────────────────────────────────────────────────────
const cursorHidden = ref(false)
let cursorHideTimer: ReturnType<typeof setTimeout> | null = null

function onVideoMouseMove() {
  cursorHidden.value = false
  if (cursorHideTimer) clearTimeout(cursorHideTimer)
  if (isPlaying.value) {
    cursorHideTimer = setTimeout(() => { cursorHidden.value = true }, 2500)
  }
}

watch(isPlaying, (playing) => {
  if (!playing) {
    cursorHidden.value = false
    if (cursorHideTimer) { clearTimeout(cursorHideTimer); cursorHideTimer = null }
  }
})

// Weapon icon URLs — delegate to shared valorant.ts helper
function getWeaponIcon(weapon: string): string | undefined {
  return getWeaponImage(weapon) || undefined
}

const abilityCastSlots = [
  { key: 'grenade' as const, slot: 'grenade' as const, label: 'C ability' },
  { key: 'ability1' as const, slot: 'ability1' as const, label: 'Q ability' },
  { key: 'ability2' as const, slot: 'ability2' as const, label: 'E ability' },
  { key: 'ultimate' as const, slot: 'ultimate' as const, label: 'Ultimate' },
]

/** Returns an ability icon URL for a kill event where weapon is Ability/Ultimate. */
function getAbilityKillIcon(event: TimelineEvent): string {
  const killerAgent = agentByPuuid(event.killerPuuid)
  if (!killerAgent) return ''
  const slot =
    event.abilitySlot
    ?? (event.weapon === 'Ultimate' ? 'ultimate' : 'ability2')
  return getAbilityIcon(killerAgent, slot)
}

/** Returns whether a timeline event is a spike-related event type. */
function isSpikeEvent(event: TimelineEvent): boolean {
  return event.type === 'plant' || event.type === 'defuse' || event.type === 'detonation'
}

const DEFAULT_SYNC_MS = -8000

/** Looks up the agent name for a player by puuid from the team snapshot. */
function agentByPuuid(puuid: string | null | undefined): string | null {
  if (!puuid || !timeline.value?.teamSnapshot) return null
  return timeline.value.teamSnapshot.find(p => p.puuid === puuid)?.agent ?? null
}

/** Resolve planter/defuser/killer labels — never show raw PUUIDs in the UI. */
function formatPlayerLabel(nameOrPuuid: string | null | undefined): string {
  if (!nameOrPuuid) return ''
  if (nameOrPuuid === 'You') return 'You'
  const fromTeam = timeline.value?.teamSnapshot?.find(
    p => p.puuid === nameOrPuuid || p.summonerName === nameOrPuuid,
  )
  if (fromTeam) {
    if (fromTeam.puuid === ownPuuid.value) return 'You'
    return fromTeam.summonerName || fromTeam.agent || 'Teammate'
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nameOrPuuid)) {
    return agentByPuuid(nameOrPuuid) ?? 'Enemy'
  }
  return nameOrPuuid
}

function getRankColor(tierName: string): string {
  const lower = tierName.toLowerCase()
  if (lower.includes('radiant')) return '#fde68a'
  if (lower.includes('immortal')) return '#f87171'
  if (lower.includes('ascendant')) return '#34d399'
  if (lower.includes('diamond')) return '#60a5fa'
  if (lower.includes('platinum')) return '#22d3ee'
  if (lower.includes('gold')) return '#fbbf24'
  if (lower.includes('silver')) return '#d1d5db'
  if (lower.includes('bronze')) return '#fb923c'
  if (lower.includes('iron')) return '#9ca3af'
  return '#6b7280'
}

const sortedTeamSnapshot = computed(() => {
  if (!timeline.value?.teamSnapshot?.length) return []
  return [...timeline.value.teamSnapshot].sort((a, b) => b.score - a.score)
})

const ownTeam = computed(() => {
  if (!ownPuuid.value || !timeline.value?.teamSnapshot) return null
  return timeline.value.teamSnapshot.find(p => p.puuid === ownPuuid.value)?.team ?? null
})

function roundOutcomeIcon(round: RoundGroup): string | null {
  const c = round.ceremony?.toLowerCase() ?? ''
  if (c.includes('bombdefused') || c.includes('defus'))
    return round.won ? iconDiffuseWin : iconDiffuseLoss
  if (c.includes('timer') || c.includes('time'))
    return round.won ? iconTimeWin : iconTimeLoss
  if (c.includes('detonat') || c.includes('explos') || round.spikeDetonated)
    return round.won ? iconExplosionWin : iconExplosionLoss
  if (c.includes('elim') || c.includes('roundceremon'))
    return round.won ? iconEliminationWin : iconEliminationLoss
  // Fallback by win/loss if no ceremony match
  return round.won ? iconEliminationWin : iconEliminationLoss
}

function roundOutcomeLabel(round: RoundGroup): string {
  const c = round.ceremony?.toLowerCase() ?? ''
  const result = round.won ? 'WIN' : 'LOSS'
  if (c.includes('bombdefused') || c.includes('defus')) return `DEFUSE ${result}`
  if (c.includes('timer') || c.includes('time')) return `TIME ${result}`
  if (c.includes('detonat') || round.spikeDetonated) return `SPIKE ${result}`
  if (c.includes('elim') || c.includes('roundceremon')) return `ELIM ${result}`
  return result
}

const scoreboardGroups = computed(() => {
  if (!sortedTeamSnapshot.value.length) return []
  const mePlayer = sortedTeamSnapshot.value.find(p => p.puuid === ownPuuid.value)
  const allyTeamId = mePlayer?.team ?? null
  const allies = allyTeamId
    ? sortedTeamSnapshot.value.filter(p => p.team === allyTeamId)
    : sortedTeamSnapshot.value.slice(0, Math.ceil(sortedTeamSnapshot.value.length / 2))
  const enemies = allyTeamId
    ? sortedTeamSnapshot.value.filter(p => p.team !== allyTeamId)
    : sortedTeamSnapshot.value.slice(Math.ceil(sortedTeamSnapshot.value.length / 2))
  return [
    { isAlly: true, players: allies },
    { isAlly: false, players: enemies },
  ].filter(g => g.players.length > 0)
})

const agentImageUrl = computed(() => {
  if (!timeline.value?.agent) return null
  return getAgentImage(timeline.value.agent) || null
})

const mapPosterUrl = computed(() => getMapImage(timeline.value?.map) || '')

const videoFrameStyle = computed(() => {
  const { width, height } = videoFrameSize.value
  if (width > 0 && height > 0) {
    return { width: `${width}px`, height: `${height}px` }
  }
  return { width: '100%', height: '100%', maxHeight: '100%' }
})

function updateVideoFrameSize(): void {
  const el = videoAreaEl.value
  if (!el || isFullscreen.value) return
  const { width: cw, height: ch } = el.getBoundingClientRect()
  if (cw <= 0 || ch <= 0) return

  const aspect = videoAspect.value > 0 ? videoAspect.value : 16 / 9
  let width = cw
  let height = width / aspect
  if (height > ch) {
    height = ch
    width = height * aspect
  }
  videoFrameSize.value = {
    width: Math.max(1, Math.floor(width)),
    height: Math.max(1, Math.floor(height)),
  }
}

function toggleTheaterMode(): void {
  theaterMode.value = !theaterMode.value
  nextTick(() => updateVideoFrameSize())
}

async function toggleFullscreen(): Promise<void> {
  const frame = videoFrameEl.value
  if (!frame) return
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await frame.requestFullscreen()
    }
  } catch {
    /* fullscreen denied or unavailable */
  }
}

function onFullscreenChange(): void {
  isFullscreen.value = document.fullscreenElement === videoFrameEl.value
  nextTick(() => updateVideoFrameSize())
}

const videoSrc = computed(() => {
  const path = timeline.value?.videoPath
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  const normalized = path.replace(/\\/g, '/')
  return normalized.startsWith('/')
    ? encodeURI(`file://${normalized}`)
    : encodeURI(`file:///${normalized}`)
})

const progressPercent = computed(() => {
  if (!duration.value) return 0
  return (currentTime.value / duration.value) * 100
})

const allTimelineEvents = computed((): TimelineEvent[] => {
  if (!timeline.value) return []

  const me = ownPuuid.value

  // Build set of first-blood killers per round for badge display
  const firstBloodKeys = new Set(
    (timeline.value.firstBloods ?? []).map(fb => `${fb.round ?? 0}:${fb.killerPuuid ?? fb.killerName}`)
  )

  // Classify every kill event by comparing killer/victim to the local player.
  // playerKills contains ALL match kill events (not just the player's) so we
  // must inspect each event individually rather than assuming array = type.
  const classified: TimelineEvent[] = (timeline.value.kills ?? [])
    .filter(k => k.videoOffsetMs != null && !isNaN(k.videoOffsetMs))
    .map(k => {
      const isMyKill  = (me && k.killerPuuid === me) || k.killerName === 'You'
      const isMyDeath = (me && k.victimPuuid === me) || k.victimName === 'You'
      const type: TimelineEvent['type'] = isMyKill ? 'kill' : isMyDeath ? 'death' : 'neutral'
      return {
        ...k,
        type,
        isFirstBlood: firstBloodKeys.has(`${k.round ?? 0}:${k.killerPuuid ?? k.killerName}`)
      }
    })

  // Include any deaths from the deaths array that aren't already captured above
  // (guard against double-counting if both arrays have the same event)
  const seenOffsets = new Set(classified.map(e => e.videoOffsetMs))
  const extraDeaths: TimelineEvent[] = (timeline.value.deaths ?? [])
    .filter(d => d.videoOffsetMs != null && !isNaN(d.videoOffsetMs) && !seenOffsets.has(d.videoOffsetMs))
    .map(d => ({ ...d, type: 'death' as const }))

  const plants: TimelineEvent[] = (timeline.value.spikePlants ?? [])
    .filter(p => p.videoOffsetMs != null)
    .map(p => ({
      type: 'plant' as const,
      killerName: p.planter ?? '',
      victimName: '',
      planter: p.planter,
      site: p.site,
      videoOffsetMs: p.videoOffsetMs,
      round: p.round,
    }))
  const defuses: TimelineEvent[] = (timeline.value.spikeDefuses ?? [])
    .filter(d => d.videoOffsetMs != null)
    .map(d => ({
      type: 'defuse' as const,
      killerName: d.defuser ?? '',
      victimName: '',
      defuser: d.defuser,
      videoOffsetMs: d.videoOffsetMs,
      round: d.round,
    }))
  const detonations: TimelineEvent[] = (timeline.value.spikeDetonations ?? [])
    .filter(d => d.videoOffsetMs != null)
    .map(d => ({
      type: 'detonation' as const,
      killerName: '',
      victimName: '',
      videoOffsetMs: d.videoOffsetMs,
      round: d.round,
    }))

  return [...classified, ...extraDeaths, ...plants, ...defuses, ...detonations]
    .sort((a, b) => (a.videoOffsetMs ?? 0) - (b.videoOffsetMs ?? 0))
})

const roundGroups = computed((): RoundGroup[] => {
  if (!timeline.value) return []
  const roundMap = new Map<number, RoundGroup>()

  const summaries = timeline.value.roundSummaries ?? []
  for (const s of summaries) {
    roundMap.set(s.roundNumber, {
      roundNumber: s.roundNumber,
      won: ownTeam.value ? s.winningTeam === ownTeam.value : s.winningTeam !== null,
      spikePlanted: s.spikePlanted,
      spikeDefused: s.spikeDefused,
      spikeDetonated: (s as RoundSummary).spikeDetonated ?? false,
      ceremony: (s as RoundSummary).ceremony ?? null,
      firstVideoOffsetMs: null,
      events: []
    })
  }

  for (const event of allTimelineEvents.value) {
    const r = event.round ?? 0
    if (!roundMap.has(r)) {
      roundMap.set(r, { roundNumber: r, won: false, spikePlanted: false, spikeDefused: false, spikeDetonated: false, ceremony: null, firstVideoOffsetMs: null, events: [] })
    }
    const group = roundMap.get(r)!
    group.events.push(event)
    if (group.firstVideoOffsetMs === null || (event.videoOffsetMs ?? Infinity) < group.firstVideoOffsetMs) {
      group.firstVideoOffsetMs = event.videoOffsetMs ?? null
    }
  }

  return Array.from(roundMap.values()).sort((a, b) => a.roundNumber - b.roundNumber)
})

const roundSeparators = computed(() => {
  if (!duration.value || !roundGroups.value.length) return []
  return roundGroups.value
    .filter(r => r.firstVideoOffsetMs != null && r.firstVideoOffsetMs > 0)
    .map(r => ({ percent: ((r.firstVideoOffsetMs! / 1000) / duration.value) * 100 }))
})

const activeRoundNumber = computed<number | null>(() => {
  if (!roundGroups.value.length) return null
  const timedRounds = roundGroups.value
    .filter(round => round.firstVideoOffsetMs != null)
    .sort((a, b) => (a.firstVideoOffsetMs ?? 0) - (b.firstVideoOffsetMs ?? 0))

  if (!timedRounds.length) return roundGroups.value[0]?.roundNumber ?? null

  const currentMs = currentTime.value * 1000
  for (let index = 0; index < timedRounds.length; index += 1) {
    const currentRound = timedRounds[index]
    const nextRound = timedRounds[index + 1]
    const roundStart = currentRound.firstVideoOffsetMs ?? 0
    const nextStart = nextRound?.firstVideoOffsetMs ?? duration.value * 1000 + 1
    if (currentMs < roundStart && index === 0) return currentRound.roundNumber
    if (currentMs >= roundStart && currentMs < nextStart) return currentRound.roundNumber
  }

  return timedRounds[timedRounds.length - 1]?.roundNumber ?? null
})

const progressMarkers = computed((): ProgressMarker[] => {
  if (!duration.value) return []

  const markers: ProgressMarker[] = []

  for (const round of roundGroups.value) {
    if (round.firstVideoOffsetMs == null) continue
    const timeSeconds = round.firstVideoOffsetMs / 1000
    markers.push({
      key: `round-${round.roundNumber}`,
      kind: 'round',
      label: `Round ${round.roundNumber + 1}`,
      percent: (timeSeconds / duration.value) * 100,
      timeSeconds,
    })
  }

  for (const event of allTimelineEvents.value) {
    if (event.videoOffsetMs == null) continue
    if (!['kill', 'death', 'plant', 'defuse', 'detonation'].includes(event.type)) continue

    let label = 'Event'
    if (event.type === 'kill') label = `Kill · ${event.victimName || 'Unknown'}`
    if (event.type === 'death') label = `Death · ${event.killerName || 'Unknown'}`
    if (event.type === 'plant') label = event.site ? `Plant · Site ${event.site}` : 'Spike Plant'
    if (event.type === 'defuse') label = 'Spike Defuse'
    if (event.type === 'detonation') label = 'Spike Detonation'

    markers.push({
      key: `${event.type}-${event.videoOffsetMs}-${event.round ?? 'na'}-${event.killerName ?? event.planter ?? event.defuser ?? 'event'}`,
      kind: event.type,
      label,
      percent: ((event.videoOffsetMs / 1000) / duration.value) * 100,
      timeSeconds: event.videoOffsetMs / 1000,
    })
  }

  return markers.filter(marker => marker.percent >= 0 && marker.percent <= 100)
})

const spatialSummary = computed(() => timeline.value?.spatialSummary ?? null)
const hasSpatialIntel = computed(() => (spatialSummary.value?.events?.length ?? 0) > 0)

const spatialEventList = computed(() => {
  const events = spatialSummary.value?.events ?? []
  const round = spatialRoundFilter.value
  return events
    .map((ev, index) => ({ ev, index }))
    .filter(x => round == null || x.ev.round === round)
})

const displaySpatialSummary = computed((): MatchSpatialSummary | null => {
  const base = spatialSummary.value
  if (!base) return null
  const filtered = spatialEventList.value.map(x => x.ev)
  if (!filtered.length) return base
  return { ...base, events: filtered }
})

const activeSpatialDisplayIndex = computed(() => {
  if (activeSpatialIndex.value == null) return null
  const idx = spatialEventList.value.findIndex(x => x.index === activeSpatialIndex.value)
  return idx >= 0 ? idx : null
})

const displayDeathCount = computed(
  () => spatialEventList.value.filter(x => x.ev.type === 'death').length,
)

const spatialDeathChips = computed(() =>
  spatialEventList.value
    .map((item, displayIndex) => ({ ...item, displayIndex }))
    .filter(x => x.ev.type === 'death'),
)

const availableSpatialRounds = computed(() => {
  const rounds = new Set<number>()
  for (const e of spatialSummary.value?.events ?? []) rounds.add(e.round)
  return [...rounds].sort((a, b) => a - b)
})

const effectiveSyncMs = computed(
  () => timeline.value?.videoSyncOffsetMs ?? videoSyncOffsetMs.value ?? DEFAULT_SYNC_MS,
)

const syncOffsetLabel = computed(() => {
  const ms = effectiveSyncMs.value
  const sign = ms > 0 ? '+' : ''
  return `${sign}${(ms / 1000).toFixed(1)}s`
})

function preRollSeconds(type: string): number {
  return type === 'death' ? DEATH_PRE_ROLL_SECONDS : EVENT_PRE_ROLL_SECONDS
}

function openUpgrade() {
  window.open('https://upforge.gg/pricing', '_blank')
}

function onSpatialSelect(ev: SpatialTimelineEvent, displayIndex: number) {
  const item = spatialEventList.value[displayIndex]
  activeSpatialIndex.value = item?.index ?? null

  if (!canSeekFromSpatial.value) {
    if (!spatialPreviewUsed.value) {
      markSpatialPreviewUsed()
    } else {
      openUpgrade()
      return
    }
  }

  const preRoll = preRollSeconds(ev.type)
  if (ev.videoOffsetMs != null && !isNaN(ev.videoOffsetMs)) {
    seekToTime(Math.max(0, ev.videoOffsetMs / 1000 - preRoll))
    return
  }
  const death = timeline.value?.deaths?.find(
    d => d.round === ev.round && d.victimName === 'You',
  )
  if (death?.videoOffsetMs != null) {
    seekToTime(Math.max(0, death.videoOffsetMs / 1000 - DEATH_PRE_ROLL_SECONDS))
  }
}

async function reloadTimelineFromStore() {
  if (!recordingId.value) return
  const fresh = await window.api.recordings.getTimeline(recordingId.value)
  if (fresh) {
    timeline.value = fresh
    videoSyncOffsetMs.value = fresh.videoSyncOffsetMs ?? 0
  }
}

async function nudgeTimelineSync(deltaMs: number) {
  if (!recordingId.value) return
  const res = await window.api.recordings.nudgeSync(recordingId.value, deltaMs)
  if (res.ok) {
    videoSyncOffsetMs.value = res.videoSyncOffsetMs ?? 0
    await reloadTimelineFromStore()
  }
}

async function resetTimelineSync() {
  if (!recordingId.value) return
  const res = await window.api.recordings.resetSync(recordingId.value)
  if (res.ok) {
    videoSyncOffsetMs.value = 0
    await reloadTimelineFromStore()
  }
}

const coachingNotes = computed(() => {
  const detail = coachingDetail.value
  const notes: string[] = []

  if (detail?.verdict) notes.push(detail.verdict)
  if (detail?.top_issue) notes.push(detail.top_issue)
  if (detail?.priority_improvements?.length) notes.push(...detail.priority_improvements)
  if (detail?.coaching_tags?.length) {
    notes.push(`Focus areas: ${detail.coaching_tags.map(tag => tag.replace(/_/g, ' ')).join(' · ')}`)
  }

  if (notes.length) return notes.slice(0, 6)

  const kills = timeline.value?.finalStats?.kills ?? 0
  const deaths = timeline.value?.finalStats?.deaths ?? 0
  const firstBloodDeaths = allTimelineEvents.value.filter(event => event.type === 'death' && event.isFirstBlood).length
  const spikeRounds = roundGroups.value.filter(round => round.spikePlanted || round.spikeDefused || round.spikeDetonated).length

  if (deaths > kills) {
    notes.push('Review the rounds where you were picked first. Slowing your first peek and preserving utility should create more stable openings.')
  }
  if (firstBloodDeaths > 0) {
    notes.push(`You were involved in ${firstBloodDeaths} first-blood deaths. Pause those rounds and check your spacing before the duel starts.`)
  }
  if (spikeRounds > 0) {
    notes.push(`There are ${spikeRounds} spike-focused rounds marked in the timeline. Use those timestamps to review your post-plant positioning and timing.`)
  }
  if (!notes.length) {
    notes.push('Use the event markers below the video to jump between rounds, deaths, and clutch moments for a faster review workflow.')
  }

  return notes
})

function eventPercent(event: TimelineEvent): number {
  if (!duration.value || event.videoOffsetMs == null) return 0
  return (event.videoOffsetMs / 1000 / duration.value) * 100
}

function eventVideoSeconds(event: TimelineEvent): number | null {
  if (event.videoOffsetMs == null || isNaN(event.videoOffsetMs)) return null
  return event.videoOffsetMs / 1000
}

function isNearEvent(event: TimelineEvent): boolean {
  const eventSec = eventVideoSeconds(event)
  if (eventSec == null) return false
  // Highlight while in pre-roll window or at the kill/death moment
  return (
    Math.abs(currentTime.value - eventSec) < 1
    || (currentTime.value >= eventSec - preRollSeconds(event.type) && currentTime.value <= eventSec + 0.5)
  )
}

function formatMs(ms: number | undefined): string {
  if (ms == null || isNaN(ms)) return '--'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

function formatSeconds(s: number, zeroAsDash = false): string {
  if (isNaN(s) || (!s && zeroAsDash)) return '--:--'
  if (!s) return '0:00'
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/** Seconds to rewind before an event so the user sees lead-up (markers stay at true event time). */
const EVENT_PRE_ROLL_SECONDS = 2
const DEATH_PRE_ROLL_SECONDS = 4

function togglePlay() {
  if (!videoEl.value) return
  if (videoEl.value.paused) videoEl.value.play().catch(e => {
    if (e.name !== 'AbortError') console.error('[VOD] play() failed:', e)
  })
  else videoEl.value.pause()
}

function skip(secs: number) {
  if (!videoEl.value) return
  videoEl.value.currentTime = Math.max(0, Math.min(duration.value, videoEl.value.currentTime + secs))
}

function cycleSpeed() {
  const speeds = [0.25, 0.5, 1, 1.5, 2]
  const idx = speeds.indexOf(playbackSpeed.value)
  playbackSpeed.value = speeds[(idx + 1) % speeds.length]
  if (videoEl.value) videoEl.value.playbackRate = playbackSpeed.value
}

function cycleSpeedDown() {
  const speeds = [0.25, 0.5, 1, 1.5, 2]
  const idx = speeds.indexOf(playbackSpeed.value)
  playbackSpeed.value = speeds[Math.max(0, idx - 1)]
  if (videoEl.value) videoEl.value.playbackRate = playbackSpeed.value
}

function seekToTime(timeSeconds: number) {
  if (!videoEl.value) return
  videoEl.value.currentTime = Math.max(0, Math.min(duration.value, timeSeconds))
}

function jumpToMarker(marker: ProgressMarker) {
  const preRoll = ['kill', 'death'].includes(marker.kind) ? preRollSeconds(marker.kind) : 0
  seekToTime(Math.max(0, marker.timeSeconds - preRoll))
}

function scrollActiveRoundIntoView(roundNumber: number | null) {
  if (roundNumber == null) return
  nextTick(() => {
    const activeButton = sidebarEl.value?.querySelector(`[data-round-anchor="${roundNumber}"]`) as HTMLElement | null
    activeButton?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

function seekToEvent(event: TimelineEvent) {
  const eventSec = eventVideoSeconds(event)
  if (!videoEl.value || eventSec == null) return
  const wasPlaying = !videoEl.value.paused
  const preRoll = ['kill', 'death'].includes(event.type)
    ? preRollSeconds(event.type)
    : 0
  videoEl.value.currentTime = Math.max(0, eventSec - preRoll)
  if (wasPlaying) videoEl.value.play().catch(e => {
    if (e.name !== 'AbortError') console.error('[VOD] play() failed:', e)
  })
}

function seekToRound(round: RoundGroup) {
  selectedRound.value = round
  scrollActiveRoundIntoView(round.roundNumber)
  if (!videoEl.value || round.firstVideoOffsetMs == null) return
  const wasPlaying = !videoEl.value.paused
  videoEl.value.currentTime = Math.max(0, round.firstVideoOffsetMs / 1000 - 2)
  if (wasPlaying) videoEl.value.play().catch(e => {
    if (e.name !== 'AbortError') console.error('[VOD] play() failed:', e)
  })
}

function seekPrevEvent() {
  const events = allTimelineEvents.value
  const ct = currentTime.value
  const prev = [...events].reverse().find(e => {
    const sec = eventVideoSeconds(e)
    return sec != null && sec < ct - 0.5
  })
  if (prev) seekToEvent(prev)
}

function seekNextEvent() {
  const events = allTimelineEvents.value
  const ct = currentTime.value
  const next = events.find(e => {
    const sec = eventVideoSeconds(e)
    return sec != null && sec > ct + 0.5
  })
  if (next) seekToEvent(next)
}

function onTimeUpdate() {
  if (!videoEl.value) return
  currentTime.value = videoEl.value.currentTime
  // Popup when playback reaches the event (not when pre-roll seek lands early)
  const near = allTimelineEvents.value.find(e => {
    const sec = eventVideoSeconds(e)
    return sec != null && Math.abs(sec - currentTime.value) < 0.35
  })
  if (near && (!activeEventNotif.value || activeEventNotif.value !== near)) {
    activeEventNotif.value = near
    if (notifTimer) clearTimeout(notifTimer)
    notifTimer = setTimeout(() => { activeEventNotif.value = null }, 2500)
  }

  const nearDeath = spatialDeathChips.value.find(item => isNearEvent(item.ev))
  if (nearDeath) {
    activeSpatialIndex.value = nearDeath.index
  }
}

function onLoadedMetadata() {
  if (!videoEl.value) return
  const d = videoEl.value.duration
  if (!isNaN(d) && isFinite(d) && d > 0) duration.value = d
  if (videoEl.value.videoWidth > 0 && videoEl.value.videoHeight > 0) {
    videoAspect.value = videoEl.value.videoWidth / videoEl.value.videoHeight
    updateVideoFrameSize()
  }
  tryInitialGameplaySeek()
}

/** Skip map-load black frames — land on first real gameplay moment for review (and screenshots). */
function pickInitialSeekSeconds(): number | null {
  const MIN_OFFSET_MS = 8000
  const events = allTimelineEvents.value
  const firstGameplay = events.find(e => {
    const ms = e.videoOffsetMs
    return ms != null && !isNaN(ms) && ms >= MIN_OFFSET_MS
  })
  if (firstGameplay?.videoOffsetMs != null) {
    const preRoll = ['kill', 'death'].includes(firstGameplay.type)
      ? preRollSeconds(firstGameplay.type)
      : 2
    return Math.max(0, firstGameplay.videoOffsetMs / 1000 - preRoll)
  }

  const firstRound = roundGroups.value.find(
    r => r.firstVideoOffsetMs != null && r.firstVideoOffsetMs >= MIN_OFFSET_MS,
  )
  if (firstRound?.firstVideoOffsetMs != null) {
    return Math.max(0, firstRound.firstVideoOffsetMs / 1000 - 2)
  }

  if (duration.value > 15) return 12
  return null
}

function tryInitialGameplaySeek() {
  if (initialSeekDone.value) return

  const routeSeekMs = Number(route.query.seekMs)
  if (!Number.isNaN(routeSeekMs) && routeSeekMs >= 0) {
    initialSeekDone.value = true
    return
  }

  if (!videoEl.value || duration.value <= 0) return

  const target = pickInitialSeekSeconds()
  if (target != null && target > 0.5) {
    videoEl.value.currentTime = target
    currentTime.value = target
  }
  initialSeekDone.value = true
}

function onScrubberClick(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  if (videoEl.value) {
    videoEl.value.currentTime = pct * duration.value
  }
}

function onScrubberHover(e: MouseEvent) {
  if (!duration.value || isNaN(duration.value)) return
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  hoverTime.value = Math.max(0, Math.min(duration.value, ((e.clientX - rect.left) / rect.width) * duration.value))
}

function applyTimelineDerivedState() {
  if (!timeline.value) return
  const ownKill = timeline.value.kills?.find((k: KillEvent) => k.killerName === 'You')
  if (ownKill?.killerPuuid) {
    ownPuuid.value = ownKill.killerPuuid
  } else {
    const ownDeath = timeline.value.deaths?.find((d: KillEvent) => d.victimName === 'You')
    if (ownDeath?.victimPuuid) ownPuuid.value = ownDeath.victimPuuid
  }
}

function applyInitialSeek() {
  const seekMs = Number(route.query.seekMs)
  if (Number.isNaN(seekMs) || seekMs < 0) return
  initialSeekDone.value = true
  const trySeek = () => {
    if (videoEl.value && duration.value > 0) {
      seekToTime(seekMs / 1000)
    } else {
      setTimeout(trySeek, 200)
    }
  }
  trySeek()
}

async function loadTimeline() {
  timelineLoading.value = true
  timelineError.value = null
  timeline.value = null
  try {
    const id = route.query.id as string
    const timelineId = route.query.timelineId as string
    const numericTimelineId = Number(timelineId)

    if (timelineId && pendingTimeline.value) {
      timeline.value = pendingTimeline.value
      pendingTimeline.value = null
      videoSyncOffsetMs.value = timeline.value?.videoSyncOffsetMs ?? DEFAULT_SYNC_MS
    } else if (id) {
      recordingId.value = id
      timeline.value = await window.api.recordings.getTimeline(id)
      if (!timeline.value) {
        timelineError.value = 'Recording timeline not found.'
        return
      }
      videoSyncOffsetMs.value = timeline.value.videoSyncOffsetMs ?? DEFAULT_SYNC_MS
    } else if (timelineId && !Number.isNaN(numericTimelineId)) {
      const data = await window.api.analyses.getTimeline(numericTimelineId)
      if (!data) {
        timelineError.value = 'Timeline data is not available for this match yet.'
        return
      }
      timeline.value = data
      videoSyncOffsetMs.value = timeline.value.videoSyncOffsetMs ?? DEFAULT_SYNC_MS
    } else {
      timelineError.value = 'No match selected — open a match from the Dashboard.'
      return
    }

    if (timelineId && !Number.isNaN(numericTimelineId)) {
      coachingDetail.value = await window.api.analyses.getDetail(numericTimelineId).catch(() => null)
    }

    applyTimelineDerivedState()
    applyInitialSeek()
  } catch {
    timelineError.value = 'Could not load match timeline — check your connection and try again.'
  } finally {
    timelineLoading.value = false
  }
}

onMounted(async () => {
  loadSpatialPreviewState()
  loadSpatialUiPrefs()
  window.api.discord.setState('reviewing').catch(() => {})
  window.api.app.getStatus().then(s => {
    if (s.user?.tier) userTier.value = s.user.tier
  }).catch(() => {})

  await loadTimeline()

  window.addEventListener('keydown', handleKeyDown)
  document.addEventListener('fullscreenchange', onFullscreenChange)

  nextTick(() => {
    updateVideoFrameSize()
    if (videoAreaEl.value) {
      videoAreaObserver = new ResizeObserver(() => updateVideoFrameSize())
      videoAreaObserver.observe(videoAreaEl.value)
    }
  })
})

onUnmounted(() => {
  window.api.discord.setState('idle').catch(() => {})
  window.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  videoAreaObserver?.disconnect()
  videoAreaObserver = null
  if (document.fullscreenElement === videoFrameEl.value) {
    document.exitFullscreen().catch(() => {})
  }
})

watch(theaterMode, () => nextTick(() => updateVideoFrameSize()))

function handleKeyDown(e: KeyboardEvent) {
  // Don't capture keyboard events when user is typing in an input
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

  if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    showShortcuts.value = !showShortcuts.value
    return
  }

  if (showShortcuts.value && e.key === 'Escape') {
    e.preventDefault()
    showShortcuts.value = false
    return
  }

  switch (e.key) {
    case ' ':
      e.preventDefault()
      togglePlay()
      break
    case 'ArrowLeft':
      e.preventDefault()
      skip(e.shiftKey ? -1 : -5)
      break
    case 'ArrowRight':
      e.preventDefault()
      skip(e.shiftKey ? 1 : 5)
      break
    case 'j':
    case 'J':
      seekPrevEvent()
      break
    case 'l':
    case 'L':
      seekNextEvent()
      break
    case ']':
      cycleSpeed()
      break
    case '[':
      cycleSpeedDown()
      break
    case 'Escape':
      if (document.fullscreenElement) {
        e.preventDefault()
        document.exitFullscreen().catch(() => {})
      } else if (theaterMode.value) {
        e.preventDefault()
        theaterMode.value = false
        nextTick(() => updateVideoFrameSize())
      } else {
        router.back()
      }
      break
    case 'f':
    case 'F':
      e.preventDefault()
      toggleFullscreen()
      break
    case 't':
    case 'T':
      e.preventDefault()
      toggleTheaterMode()
      break
    case 'm':
    case 'M':
      if (hasSpatialIntel.value) {
        e.preventDefault()
        spatialMapVisible.value = !spatialMapVisible.value
      }
      break
    case 'r':
    case 'R':
      if (selectedRound.value) {
        e.preventDefault()
        roundDetailExpanded.value = !roundDetailExpanded.value
      }
      break
    case 's':
    case 'S':
      showScoreboard.value = !showScoreboard.value
      break
  }
}

watch(playbackSpeed, (val) => {
  if (videoEl.value) videoEl.value.playbackRate = val
})

watch(activeRoundNumber, (roundNumber) => {
  if (roundNumber == null) return
  if (roundDetailExpanded.value) {
    const activeRound = roundGroups.value.find(round => round.roundNumber === roundNumber) ?? null
    if (activeRound) selectedRound.value = activeRound
  }
  scrollActiveRoundIntoView(roundNumber)
})
</script>

<style scoped>
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

.event-pop-enter-active,
.event-pop-leave-active { transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
.event-pop-enter-from { opacity: 0; transform: translateY(-6px) scale(0.9); }
.event-pop-leave-to { opacity: 0; transform: translateY(-4px) scale(0.95); }
</style>
