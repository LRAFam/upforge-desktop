<template>
  <div class="flex flex-col h-full bg-[#080808] text-white overflow-hidden">

    <!-- Header bar -->
    <div class="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0 bg-[#0c0c0c]">
      <button
        class="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition-colors text-xs"
        @click="$router.back()"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        Back
      </button>
      <div class="w-px h-4 bg-white/[0.08]" />
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <img v-if="agentImageUrl" :src="agentImageUrl" class="w-7 h-7 object-contain rounded" />
        <span class="text-xs font-semibold text-gray-200 truncate">
          {{ timeline?.agent || 'VOD Review' }}<span v-if="timeline?.map" class="text-gray-500 font-normal"> · {{ timeline.map }}</span>
        </span>
        <span
          v-if="timeline?.gameMode"
          class="flex-shrink-0 text-xs font-semibold px-1.5 py-px rounded bg-white/[0.06] text-gray-400 uppercase tracking-wide"
        >{{ timeline.gameMode }}</span>
      </div>

      <!-- KDA summary -->
      <div v-if="timeline?.finalStats" class="flex items-center gap-2 flex-shrink-0">
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
        class="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-gray-300 transition-colors hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-white"
        @click="showInsightsPanel = !showInsightsPanel"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 20 20">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M6.75 6.75h6.5M6.75 10h6.5M6.75 13.25h4.5M4.75 3.75h10.5a1 1 0 0 1 1 1v10.5a1 1 0 0 1-1 1H4.75a1 1 0 0 1-1-1V4.75a1 1 0 0 1 1-1Z"/>
        </svg>
        {{ showInsightsPanel ? 'Hide Notes' : 'Show Notes' }}
      </button>
    </div>

    <!-- Main content -->
    <div class="flex flex-1 min-h-0">

      <!-- Left sidebar: event feed -->
      <div class="w-52 flex-shrink-0 border-r border-white/[0.05] flex flex-col overflow-hidden bg-[#0a0a0a]">
        <div class="px-3 py-2 border-b border-white/[0.05]">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-widest">Timeline</p>
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
                  <p v-if="event.planter || event.defuser" class="text-[8px] text-gray-600 truncate">{{ event.planter || event.defuser }}</p>
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

      <!-- Video + timeline -->
      <div class="flex-1 flex flex-col min-w-0 min-h-0">

        <!-- Video area -->
        <div class="flex-1 relative bg-black min-h-0" @click="togglePlay">
          <video
            v-if="timeline?.videoPath"
            ref="videoEl"
            class="w-full h-full object-contain"
            :src="videoSrc"
            preload="metadata"
            @timeupdate="onTimeUpdate"
            @loadedmetadata="onLoadedMetadata"
            @durationchange="onLoadedMetadata"
            @play="isPlaying = true"
            @pause="isPlaying = false"
            @ended="isPlaying = false"
          />
          <div v-else class="w-full h-full flex flex-col items-center justify-center gap-3 text-gray-600 pointer-events-none select-none">
            <svg class="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.867v6.266a1 1 0 01-1.447.902L15 14M5 8a2 2 0 00-2 2v4a2 2 0 002 2h8a2 2 0 002-2v-4a2 2 0 00-2-2H5z"/>
            </svg>
            <span class="text-xs text-gray-600">No video for this session</span>
            <span class="text-[10px] text-gray-700">OBS was not recording when this match was captured</span>
          </div>

          <!-- Play/pause overlay -->
          <div
            class="absolute inset-0 flex items-center justify-center pointer-events-none"
            :class="{ 'opacity-0': isPlaying }"
            style="transition: opacity 0.2s"
          >
            <div class="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
              <svg class="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>

          <!-- Kill/death notification popup (shown when video reaches an event) -->
          <Transition name="event-pop">
            <div
              v-if="activeEventNotif"
              class="absolute top-3 right-3 flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs pointer-events-none backdrop-blur-sm"
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

        <!-- Controls + timeline scrubber -->
        <div class="flex-shrink-0 border-t border-white/[0.06] bg-[#0c0c0c] px-3 pt-2 pb-3">
          <div class="backdrop-blur-sm bg-black/40 border border-white/[0.08] rounded-2xl px-4 py-3 space-y-3 shadow-[0_16px_50px_rgba(0,0,0,0.35)]">
            <div class="relative group cursor-pointer h-8 flex items-center" @click="onScrubberClick" @mousemove="onScrubberHover" @mouseleave="hoverTime = null">
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

            <div class="flex items-center gap-2.5">
              <button class="h-10 w-10 flex items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.06] text-gray-100 transition-all hover:border-white/[0.16] hover:bg-white/[0.12] hover:text-white" title="Play/Pause (Space)" @click="togglePlay">
                <svg v-if="isPlaying" class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.75 4.5h2.75v11H5.75zM11.5 4.5h2.75v11H11.5z"/>
                </svg>
                <svg v-else class="ml-0.5 h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.75 4.75v10.5l8-5.25-8-5.25Z"/>
                </svg>
              </button>

              <button class="h-10 w-10 flex items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-gray-400 transition-all hover:border-white/[0.16] hover:bg-white/[0.1] hover:text-gray-100" title="Skip back 5s (←)" @click="skip(-5)">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 20 20">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9.75 14.5 5.5 10l4.25-4.5m5.5 9-4.25-4.5 4.25-4.5"/>
                </svg>
              </button>

              <button class="h-10 w-10 flex items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-gray-400 transition-all hover:border-white/[0.16] hover:bg-white/[0.1] hover:text-gray-100" title="Skip forward 5s (→)" @click="skip(5)">
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
                class="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-gray-400 transition-all hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-gray-200"
                @click="showScoreboard = !showScoreboard"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 20 20">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M4.5 15.5h2.5v-5H4.5v5Zm4.25 0h2.5V7.75h-2.5V15.5Zm4.25 0h2.5V4.5h-2.5v11Z"/>
                </svg>
                Score
              </button>

              <div class="hidden xl:flex items-center gap-3 ml-1">
                <div class="flex items-center gap-1.5">
                  <div class="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span class="text-xs text-gray-500">Kill</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class="h-2.5 w-2.5 rounded-full bg-red-500" />
                  <span class="text-xs text-gray-500">Death</span>
                </div>
                <div v-if="(timeline?.spikePlants?.length ?? 0) > 0" class="flex items-center gap-1.5">
                  <div class="h-3 w-2 rounded-full bg-orange-500" />
                  <span class="text-xs text-gray-500">Plant</span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-3 px-1 pb-1 flex-wrap">
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
            </div>
          </div>
        </div>
        <div
          v-if="selectedRound"
          class="flex-shrink-0 bg-[#0a0a0a] border-t border-white/[0.06] max-h-52 overflow-y-auto scrollbar-hide"
        >
          <!-- Round header -->
          <div class="flex items-center gap-2.5 px-3 py-2 sticky top-0 bg-[#0a0a0a] border-b border-white/[0.04] z-10">
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
              @click="selectedRound = null"
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
                  <p v-if="event.planter || event.defuser" class="text-[9px] text-gray-600">{{ event.planter || event.defuser }}</p>
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
          v-if="showScoreboard && sortedTeamSnapshot.length"
          class="flex-shrink-0 bg-[#0a0a0a] border-t border-white/[0.06] max-h-52 overflow-y-auto scrollbar-hide"
        >
          <!-- Column headers -->
          <div class="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3 py-1.5 border-b border-white/[0.04] sticky top-0 bg-[#0a0a0a]">
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
              <!-- Ability casts (C/Q/E/X) -->
              <div v-if="p.abilityCasts" class="text-[8px] tabular-nums text-right text-gray-600 font-mono space-x-0.5">
                <span title="C slot">{{ p.abilityCasts.grenade }}C</span>
                <span title="Q slot">{{ p.abilityCasts.ability1 }}Q</span>
                <span title="E slot">{{ p.abilityCasts.ability2 }}E</span>
                <span title="X (ult)">{{ p.abilityCasts.ultimate }}X</span>
              </div>
              <div v-else class="text-[8px] text-gray-700 text-right">—</div>
            </div>
          </template>
        </div>
      </div>

      <div
        v-if="showInsightsPanel"
        class="w-80 flex-shrink-0 border-l border-white/[0.05] bg-[#090909] flex flex-col min-h-0"
      >
        <div class="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
          <div class="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-red-400">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 20 20">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M10 3.75c-2.071 0-3.75 1.679-3.75 3.75 0 1.349.712 2.53 1.781 3.191.61.378.969 1.036.969 1.754v.3h2v-.3c0-.718.359-1.376.969-1.754A3.748 3.748 0 0 0 13.75 7.5c0-2.071-1.679-3.75-3.75-3.75Zm-1.5 10.25h3m-2.5 2h2"/>
            </svg>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-white">Coaching Notes</p>
            <p class="text-xs text-gray-500">Pinned review takeaways for this session</p>
          </div>
          <button
            class="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-gray-500 transition-colors hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-gray-200"
            @click="showInsightsPanel = false"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 20 20">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="m12.5 5.5-5 4.5 5 4.5"/>
            </svg>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 space-y-3">
          <div
            v-for="(note, index) in coachingNotes"
            :key="`${index}-${note}`"
            class="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-3"
          >
            <div class="flex items-start gap-3">
              <span class="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-red-400" />
              <p class="text-sm leading-relaxed text-gray-300">{{ note }}</p>
            </div>
          </div>
          <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
            <p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-600">Review flow</p>
            <p class="mt-2 text-xs leading-relaxed text-gray-500">Use the timeline on the left and the clickable markers under the player to jump straight into round starts, kills, deaths, and spike moments.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getWeaponImage, getAgentImage, getAbilityIcon } from '../lib/valorant'
import { pendingTimeline } from '../stores/pendingTimeline'

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
const sidebarEl = ref<HTMLElement | null>(null)

const timeline = ref<RecordingTimeline | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const hoverTime = ref<number | null>(null)
const playbackSpeed = ref(1)
const activeEventNotif = ref<TimelineEvent | null>(null)
const showScoreboard = ref(false)
const showInsightsPanel = ref(true)
const selectedRound = ref<RoundGroup | null>(null)
const coachingDetail = ref<AnalysisDetail | null>(null)
const ownPuuid = ref<string | null>(null)
let notifTimer: ReturnType<typeof setTimeout> | null = null

// Weapon icon URLs — delegate to shared valorant.ts helper
function getWeaponIcon(weapon: string): string | undefined {
  return getWeaponImage(weapon) || undefined
}

/** Returns an ability icon URL for a kill event where weapon is Ability/Ultimate. */
function getAbilityKillIcon(event: TimelineEvent): string {
  const killerAgent = agentByPuuid(event.killerPuuid)
  if (!killerAgent) return ''
  if (event.weapon === 'Ultimate') return getAbilityIcon(killerAgent, 'Ultimate')
  // Generic ability kill — show signature (E slot) as best guess
  return getAbilityIcon(killerAgent, 'Ability2')
}

/** Returns whether a timeline event is a spike-related event type. */
function isSpikeEvent(event: TimelineEvent): boolean {
  return event.type === 'plant' || event.type === 'defuse' || event.type === 'detonation'
}

/** Looks up the agent name for a player by puuid from the team snapshot. */
function agentByPuuid(puuid: string | null | undefined): string | null {
  if (!puuid || !timeline.value?.teamSnapshot) return null
  return timeline.value.teamSnapshot.find(p => p.puuid === puuid)?.agent ?? null
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

const videoSrc = computed(() => {
  if (!timeline.value?.videoPath) return ''
  const normalized = timeline.value.videoPath.replace(/\\/g, '/')
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

function isNearEvent(event: TimelineEvent): boolean {
  if (event.videoOffsetMs == null) return false
  return Math.abs(currentTime.value - event.videoOffsetMs / 1000) < 1
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

const EVENT_PRE_ROLL_SECONDS = 5

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
  seekToTime(marker.timeSeconds)
}

function scrollActiveRoundIntoView(roundNumber: number | null) {
  if (roundNumber == null) return
  nextTick(() => {
    const activeButton = sidebarEl.value?.querySelector(`[data-round-anchor="${roundNumber}"]`) as HTMLElement | null
    activeButton?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

function seekToEvent(event: TimelineEvent) {
  if (!videoEl.value || event.videoOffsetMs == null) return
  const wasPlaying = !videoEl.value.paused
  videoEl.value.currentTime = Math.max(0, event.videoOffsetMs / 1000 - EVENT_PRE_ROLL_SECONDS)
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
  const prev = [...events].reverse().find(e => e.videoOffsetMs != null && e.videoOffsetMs / 1000 < ct - 0.5)
  if (prev) seekToEvent(prev)
}

function seekNextEvent() {
  const events = allTimelineEvents.value
  const ct = currentTime.value
  const next = events.find(e => e.videoOffsetMs != null && e.videoOffsetMs / 1000 > ct + 0.5)
  if (next) seekToEvent(next)
}

function onTimeUpdate() {
  if (!videoEl.value) return
  currentTime.value = videoEl.value.currentTime
  // Check if we're near a timeline event and show popup
  const near = allTimelineEvents.value.find(e => e.videoOffsetMs != null && Math.abs(e.videoOffsetMs / 1000 - currentTime.value) < 0.3)
  if (near && (!activeEventNotif.value || activeEventNotif.value !== near)) {
    activeEventNotif.value = near
    if (notifTimer) clearTimeout(notifTimer)
    notifTimer = setTimeout(() => { activeEventNotif.value = null }, 2500)
  }
}

function onLoadedMetadata() {
  if (!videoEl.value) return
  const d = videoEl.value.duration
  if (!isNaN(d) && isFinite(d) && d > 0) duration.value = d
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

onMounted(async () => {
  window.api.discord.setState('reviewing').catch(() => {})
  const id = route.query.id as string
  const timelineId = route.query.timelineId as string

  if (timelineId && pendingTimeline.value) {
    timeline.value = pendingTimeline.value
    pendingTimeline.value = null
  } else if (id) {
    timeline.value = await window.api.recordings.getTimeline(id)
  }

  const numericTimelineId = Number(timelineId)
  if (timelineId && !Number.isNaN(numericTimelineId)) {
    coachingDetail.value = await window.api.analyses.getDetail(numericTimelineId).catch(() => null)
  }

  // Derive ownPuuid from kill/death events where name === 'You'
  if (timeline.value) {
    const ownKill = timeline.value.kills?.find((k: any) => k.killerName === 'You')
    if (ownKill?.killerPuuid) {
      ownPuuid.value = ownKill.killerPuuid
    } else {
      const ownDeath = timeline.value.deaths?.find((d: any) => d.victimName === 'You')
      if (ownDeath?.victimPuuid) ownPuuid.value = ownDeath.victimPuuid
    }
  }

  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.api.discord.setState('idle').catch(() => {})
  window.removeEventListener('keydown', handleKeyDown)
})

function handleKeyDown(e: KeyboardEvent) {
  // Don't capture keyboard events when user is typing in an input
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

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
      router.back()
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
  const activeRound = roundGroups.value.find(round => round.roundNumber === roundNumber) ?? null
  if (activeRound) selectedRound.value = activeRound
  scrollActiveRoundIntoView(roundNumber)
}, { immediate: true })
</script>

<style scoped>
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

.event-pop-enter-active,
.event-pop-leave-active { transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
.event-pop-enter-from { opacity: 0; transform: translateY(-6px) scale(0.9); }
.event-pop-leave-to { opacity: 0; transform: translateY(-4px) scale(0.95); }
</style>
