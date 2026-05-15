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
    </div>

    <!-- Main content -->
    <div class="flex flex-1 min-h-0">

      <!-- Left sidebar: event feed -->
      <div class="w-44 flex-shrink-0 border-r border-white/[0.05] flex flex-col overflow-hidden bg-[#0a0a0a]">
        <div class="px-3 py-2 border-b border-white/[0.05]">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-widest">Timeline</p>
        </div>
        <div ref="sidebarEl" class="flex-1 overflow-y-auto scrollbar-hide space-y-px py-1">
          <template v-for="round in roundGroups" :key="round.roundNumber">
            <!-- Round header -->
            <button
              class="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-white/[0.05] transition-colors text-left border-l-2 rounded-sm"
              :class="selectedRound?.roundNumber === round.roundNumber
                ? (round.won ? 'border-teal-500 bg-teal-500/[0.06]' : 'border-red-500 bg-red-500/[0.04]')
                : 'border-transparent'"
              @click="seekToRound(round)"
            >
              <!-- Outcome icon: CDN image or SVG badge -->
              <div class="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                <img
                  v-if="roundOutcomeIcon(round)"
                  :src="roundOutcomeIcon(round)!"
                  class="w-5 h-5 object-contain"
                />
                <div
                  v-else
                  class="w-4 h-4 rounded-full flex items-center justify-center"
                  :class="round.won ? 'bg-teal-500' : 'bg-red-500'"
                >
                  <svg v-if="round.won" class="w-2.5 h-2.5 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 8l3.5 3.5L13 5"/>
                  </svg>
                  <svg v-else class="w-2.5 h-2.5 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <path d="M4 4l8 8M12 4l-8 8"/>
                  </svg>
                </div>
              </div>
              <span class="text-xs font-semibold text-gray-400">R{{ round.roundNumber + 1 }}</span>
              <span class="text-[9px] font-bold leading-tight truncate" :class="round.won ? 'text-teal-400/80' : 'text-red-400/60'">
                {{ roundOutcomeLabel(round) }}
              </span>
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
                <div class="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded"
                     :class="event.type === 'plant' ? 'bg-orange-500/20' : event.type === 'defuse' ? 'bg-cyan-500/20' : 'bg-yellow-500/20'">
                  <svg class="w-2.5 h-2.5" :class="event.type === 'plant' ? 'text-orange-400' : event.type === 'defuse' ? 'text-cyan-400' : 'text-yellow-400'" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 3a1 1 0 011 1v4a1 1 0 01-2 0V6a1 1 0 011-1zm0 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
                  </svg>
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
                    <span class="text-[10px]">{{ event.type === 'kill' ? '🎯' : '💀' }}</span>
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
                    <span v-else class="text-[8px]" :class="event.weapon === 'Ultimate' ? 'text-yellow-400' : 'text-purple-400'">
                      {{ event.weapon === 'Ultimate' ? 'X' : '⚡' }}
                    </span>
                  </div>
                  <span v-else-if="event.weapon === 'Spike'" class="text-[9px] text-orange-400">💣</span>
                  <span v-else-if="event.weapon === 'Fall'" class="text-[9px] text-gray-500">⬇</span>
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
            <span class="text-xs text-gray-600">No video available for this analysis</span>
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
                  {{ activeEventNotif.type === 'kill' ? '🎯' : '💀' }}
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
        <div class="flex-shrink-0 bg-[#0c0c0c] border-t border-white/[0.06] px-3 pt-2 pb-3 space-y-2">

          <!-- Custom scrubber with event markers -->
          <div class="relative group cursor-pointer h-6 flex items-center" @click="onScrubberClick" @mousemove="onScrubberHover" @mouseleave="hoverTime = null">
            <!-- Track -->
            <div class="w-full h-1.5 bg-white/[0.08] rounded-full relative overflow-visible">
              <!-- Played fill -->
              <div
                class="h-full bg-red-500 rounded-full pointer-events-none"
                :style="{ width: progressPercent + '%' }"
              />
              <!-- Round separator lines -->
              <div
                v-for="sep in roundSeparators"
                :key="sep.percent"
                class="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-white/20 pointer-events-none"
                :style="{ left: sep.percent + '%' }"
              />
              <!-- Kill markers -->
              <div
                v-for="(event, i) in allTimelineEvents"
                :key="i"
                class="absolute top-1/2 -translate-y-1/2 rounded-full border pointer-events-none transition-transform group-hover:scale-125"
                :class="[
                  event.type === 'kill' ? 'bg-green-500 border-green-300 w-2.5 h-2.5 border-2' : '',
                  event.type === 'death' ? 'bg-red-500 border-red-300 w-2.5 h-2.5 border-2' : '',
                  event.type === 'neutral' ? 'bg-gray-600 border-gray-500 w-1.5 h-1.5 border' : '',
                  event.type === 'plant' ? 'bg-orange-500 border-orange-300 w-2 h-3 border-2' : '',
                  event.type === 'defuse' ? 'bg-cyan-500 border-cyan-300 w-2 h-3 border-2' : '',
                  event.type === 'detonation' ? 'bg-yellow-500 border-yellow-300 w-2.5 h-2.5 border-2' : '',
                ]"
                :style="{ left: `calc(${eventPercent(event)}% - 5px)` }"
                :title="event.type === 'kill' ? `Kill: ${event.victimName}` : event.type === 'death' ? `Death: ${event.killerName}` : event.type === 'neutral' ? `${event.killerName} → ${event.victimName}` : event.type === 'plant' ? `Spike planted (${event.site ?? '?'})` : event.type === 'defuse' ? 'Spike defused' : 'Spike detonated'"
              />
              <!-- Hover time indicator -->
              <div
                v-if="hoverTime !== null"
                class="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white/60 pointer-events-none"
                :style="{ left: (hoverTime / duration * 100) + '%' }"
              />
            </div>
            <!-- Thumb -->
            <div
              class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md pointer-events-none transition-transform group-hover:scale-125"
              :style="{ left: `calc(${progressPercent}% - 6px)` }"
            />
            <!-- Hover time tooltip -->
            <div
              v-if="hoverTime !== null"
              class="absolute bottom-full mb-2 px-1.5 py-0.5 bg-black/80 rounded text-xs text-gray-200 tabular-nums pointer-events-none -translate-x-1/2"
              :style="{ left: (hoverTime / duration * 100) + '%' }"
            >{{ formatMs(hoverTime * 1000) }}</div>
          </div>

          <!-- Playback controls row -->
          <div class="flex items-center gap-3">
            <!-- Play/Pause -->
            <button class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors text-gray-300 hover:text-white" @click="togglePlay">
              <svg v-if="isPlaying" class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
              <svg v-else class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>

            <!-- Skip back 5s -->
            <button class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors text-gray-500 hover:text-gray-300" @click="skip(-5)">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
              </svg>
            </button>

            <!-- Skip forward 5s -->
            <button class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors text-gray-500 hover:text-gray-300" @click="skip(5)">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
              </svg>
            </button>

            <!-- Prev event / Next event -->
            <button class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors text-gray-500 hover:text-gray-300" title="Previous event" @click="seekPrevEvent">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
            <button class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors text-gray-500 hover:text-gray-300" title="Next event" @click="seekNextEvent">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 18l6-6-6-6"/>
              </svg>
            </button>

            <!-- Playback speed -->
            <button
              class="text-xs font-mono px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-gray-400 hover:text-gray-200 transition-colors"
              @click="cycleSpeed"
            >{{ playbackSpeed }}x</button>

            <!-- Time display -->
            <div class="flex-1" />
            <span class="text-xs font-mono text-gray-500 tabular-nums">
              {{ formatSeconds(currentTime) }} / {{ formatSeconds(duration, true) }}
            </span>

            <!-- Scoreboard toggle -->
            <button
              class="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400 transition-colors"
              @click="showScoreboard = !showScoreboard"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
              Score
            </button>

            <!-- Legend -->
            <div class="flex items-center gap-2 ml-1">
              <div class="flex items-center gap-1">
                <div class="w-2 h-2 rounded-full bg-green-500" />
                <span class="text-xs text-gray-600">Kill</span>
              </div>
              <div class="flex items-center gap-1">
                <div class="w-2 h-2 rounded-full bg-red-500" />
                <span class="text-xs text-gray-600">Death</span>
              </div>
              <div v-if="(timeline?.spikePlants?.length ?? 0) > 0" class="flex items-center gap-1">
                <div class="w-1.5 h-2.5 rounded-sm bg-orange-500" />
                <span class="text-xs text-gray-600">Plant</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Round detail panel (tracker.gg-inspired, shown when a round is selected) -->
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
              <span v-if="selectedRound.spikePlanted" class="text-[9px] font-semibold text-orange-400 bg-orange-500/10 px-1.5 py-px rounded">PLANTED</span>
              <span v-if="selectedRound.spikeDefused" class="text-[9px] font-semibold text-cyan-400 bg-cyan-500/10 px-1.5 py-px rounded">DEFUSED</span>
              <span v-if="selectedRound.spikeDetonated" class="text-[9px] font-semibold text-red-400 bg-red-500/10 px-1.5 py-px rounded">DETONATED</span>
            </div>
            <div class="flex-1" />
            <button class="text-gray-600 hover:text-gray-300 transition-colors text-base leading-none" @click="selectedRound = null">✕</button>
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
                <div class="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
                     :class="event.type === 'plant' ? 'bg-orange-500/20' : event.type === 'defuse' ? 'bg-cyan-500/20' : 'bg-yellow-500/20'">
                  <svg class="w-4 h-4" :class="event.type === 'plant' ? 'text-orange-400' : event.type === 'defuse' ? 'text-cyan-400' : 'text-yellow-400'" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 3a1 1 0 011 1v4a1 1 0 01-2 0V6a1 1 0 011-1zm0 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
                  </svg>
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
                  <div v-else class="w-full h-full flex items-center justify-center text-xs">{{ event.type === 'kill' ? '🎯' : '💀' }}</div>
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
                    <span v-else class="text-xs" :class="event.weapon === 'Ultimate' ? 'text-yellow-400' : 'text-purple-400'">
                      {{ event.weapon === 'Ultimate' ? 'X' : '⚡' }}
                    </span>
                  </div>
                  <span v-else-if="event.weapon === 'Spike'" class="text-xs text-orange-400">💣</span>
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
                  <div v-else class="w-full h-full flex items-center justify-center text-xs">💀</div>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
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

const route = useRoute()
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
const selectedRound = ref<RoundGroup | null>(null)
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
  return `file://${timeline.value.videoPath}`
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

function togglePlay() {
  if (!videoEl.value) return
  if (videoEl.value.paused) videoEl.value.play()
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

function seekToEvent(event: TimelineEvent) {
  if (!videoEl.value || event.videoOffsetMs == null) return
  videoEl.value.currentTime = event.videoOffsetMs / 1000
  videoEl.value.play()
}

function seekToRound(round: RoundGroup) {
  selectedRound.value = round
  if (!videoEl.value || round.firstVideoOffsetMs == null) return
  videoEl.value.currentTime = Math.max(0, round.firstVideoOffsetMs / 1000 - 2)
  videoEl.value.play()
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
  const pct = (e.clientX - rect.left) / rect.width
  if (videoEl.value) {
    videoEl.value.currentTime = pct * duration.value
  }
}

function onScrubberHover(e: MouseEvent) {
  if (!duration.value || isNaN(duration.value)) return
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  hoverTime.value = ((e.clientX - rect.left) / rect.width) * duration.value
}

onMounted(async () => {
  const id = route.query.id as string
  const timelineId = route.query.timelineId as string

  if (timelineId && pendingTimeline.value) {
    timeline.value = pendingTimeline.value
    pendingTimeline.value = null
  } else if (id) {
    timeline.value = await window.api.recordings.getTimeline(id)
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
})

watch(playbackSpeed, (val) => {
  if (videoEl.value) videoEl.value.playbackRate = val
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
