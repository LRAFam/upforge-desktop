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
        <img v-if="agentImageUrl" :src="agentImageUrl" class="w-5 h-5 object-contain" />
        <span class="text-xs font-semibold text-gray-200 truncate">
          {{ timeline?.agent || 'VOD Review' }}<span v-if="timeline?.map" class="text-gray-500 font-normal"> · {{ timeline.map }}</span>
        </span>
        <span
          v-if="timeline?.gameMode"
          class="flex-shrink-0 text-[9px] font-semibold px-1.5 py-px rounded bg-white/[0.06] text-gray-400 uppercase tracking-wide"
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
          <span class="text-[10px] text-gray-600 ml-0.5">KDA</span>
        </div>
        <div
          v-if="timeline.finalStats.won !== undefined"
          class="text-[10px] font-bold px-1.5 py-0.5 rounded"
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
          <p class="text-[9px] font-semibold text-gray-600 uppercase tracking-widest">Timeline</p>
        </div>
        <div ref="sidebarEl" class="flex-1 overflow-y-auto scrollbar-hide space-y-px py-1">
          <template v-for="round in roundGroups" :key="round.roundNumber">
            <!-- Round header -->
            <button
              class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.04] transition-colors text-left"
              @click="seekToRound(round)"
            >
              <div
                class="w-1.5 h-1.5 rounded-full flex-shrink-0"
                :class="round.won ? 'bg-green-500' : 'bg-red-500/70'"
              />
              <span class="text-[10px] font-semibold text-gray-400">R{{ round.roundNumber + 1 }}</span>
              <span v-if="round.spikePlanted" class="text-[8px] text-orange-400">💣</span>
              <span v-if="round.spikeDefused" class="text-[8px] text-cyan-400">✂</span>
            </button>

            <!-- Kill events in this round -->
            <button
              v-for="event in round.events"
              :key="`${event.type}-${event.videoOffsetMs}`"
              class="w-full flex items-center gap-2 px-3 py-1 pl-6 hover:bg-white/[0.04] transition-colors text-left group"
              :class="{ 'bg-white/[0.03]': isNearEvent(event) }"
              @click="seekToEvent(event)"
            >
              <span class="text-[10px] flex-shrink-0" :title="event.type === 'kill' ? 'Kill' : 'Death'">
                {{ event.type === 'kill' ? '🎯' : '💀' }}
              </span>
              <div class="flex-1 min-w-0">
                <p class="text-[9px] text-gray-400 truncate group-hover:text-gray-200 transition-colors">
                  <span v-if="event.type === 'kill'">{{ event.victimName }}</span>
                  <span v-else>by {{ event.killerName }}</span>
                </p>
                <p v-if="event.weapon" class="text-[8px] text-gray-700 truncate">{{ event.weapon }}</p>
              </div>
              <span class="text-[8px] text-gray-700 flex-shrink-0 tabular-nums">{{ formatMs(event.videoOffsetMs) }}</span>
            </button>
          </template>

          <!-- No events -->
          <div v-if="!roundGroups.length" class="px-3 py-4 text-center">
            <p class="text-[10px] text-gray-600">No timeline data</p>
          </div>
        </div>
      </div>

      <!-- Video + timeline -->
      <div class="flex-1 flex flex-col min-w-0 min-h-0">

        <!-- Video area -->
        <div class="flex-1 relative bg-black min-h-0" @click="togglePlay">
          <video
            ref="videoEl"
            class="w-full h-full object-contain"
            :src="videoSrc"
            preload="metadata"
            @timeupdate="onTimeUpdate"
            @loadedmetadata="onLoadedMetadata"
            @play="isPlaying = true"
            @pause="isPlaying = false"
            @ended="isPlaying = false"
          />

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
              class="absolute top-3 right-3 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs pointer-events-none"
              :class="activeEventNotif.type === 'kill'
                ? 'bg-green-500/10 border-green-500/20 text-green-300'
                : 'bg-red-500/10 border-red-500/20 text-red-300'"
            >
              <span>{{ activeEventNotif.type === 'kill' ? '🎯' : '💀' }}</span>
              <span class="font-medium">{{ activeEventNotif.type === 'kill' ? activeEventNotif.victimName : `Killed by ${activeEventNotif.killerName}` }}</span>
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
                class="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 pointer-events-none transition-transform group-hover:scale-125"
                :class="event.type === 'kill' ? 'bg-green-500 border-green-300' : 'bg-red-500 border-red-300'"
                :style="{ left: `calc(${eventPercent(event)}% - 5px)` }"
                :title="event.type === 'kill' ? `Kill: ${event.victimName}` : `Death: ${event.killerName}`"
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
              class="absolute bottom-full mb-2 px-1.5 py-0.5 bg-black/80 rounded text-[9px] text-gray-200 tabular-nums pointer-events-none -translate-x-1/2"
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
              class="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-gray-400 hover:text-gray-200 transition-colors"
              @click="cycleSpeed"
            >{{ playbackSpeed }}x</button>

            <!-- Time display -->
            <div class="flex-1" />
            <span class="text-[10px] font-mono text-gray-500 tabular-nums">
              {{ formatSeconds(currentTime) }} / {{ formatSeconds(duration) }}
            </span>

            <!-- Legend -->
            <div class="flex items-center gap-2 ml-2">
              <div class="flex items-center gap-1">
                <div class="w-2 h-2 rounded-full bg-green-500" />
                <span class="text-[9px] text-gray-600">Kill</span>
              </div>
              <div class="flex items-center gap-1">
                <div class="w-2 h-2 rounded-full bg-red-500" />
                <span class="text-[9px] text-gray-600">Death</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'

interface KillEvent {
  killerName: string
  victimName: string
  weapon?: string
  videoOffsetMs?: number
  round?: number
  type?: 'kill' | 'death'
}

interface TimelineEvent extends KillEvent {
  type: 'kill' | 'death'
}

interface RoundGroup {
  roundNumber: number
  won: boolean
  spikePlanted: boolean
  spikeDefused: boolean
  firstVideoOffsetMs: number | null
  events: TimelineEvent[]
}

interface RoundSummary {
  roundNumber: number
  winningTeam: string | null
  spikePlanted: boolean
  spikeDefused: boolean
}

interface FinalStats {
  kills: number
  deaths: number
  assists: number
  won?: boolean
}

interface RecordingTimeline {
  id: string
  videoPath: string
  map: string | null
  agent: string | null
  game: string
  gameMode: string
  recordedAt: number
  kills: KillEvent[]
  deaths: KillEvent[]
  roundSummaries: RoundSummary[]
  finalStats: FinalStats | null
  teamSnapshot: unknown[]
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
let notifTimer: ReturnType<typeof setTimeout> | null = null

const AGENT_IMAGES: Record<string, string> = {
  Jett: 'https://media.valorant-api.com/agents/add6443a-41bd-e414-f6ad-e58d267f4e95/displayicon.png',
  Reyna: 'https://media.valorant-api.com/agents/a3bfb853-43b2-7238-a4f1-ad90e9e46bcc/displayicon.png',
  Phoenix: 'https://media.valorant-api.com/agents/eb93336a-449b-9c1b-0a54-a891f7921d69/displayicon.png',
  Sage: 'https://media.valorant-api.com/agents/569fdd95-4d10-43ab-ca70-79becc718b46/displayicon.png',
  Sova: 'https://media.valorant-api.com/agents/320b2a48-4d9b-a075-30f1-1f93a9b638fa/displayicon.png',
  Cypher: 'https://media.valorant-api.com/agents/117ed9e3-49f3-6512-3ccf-0cada7e3823b/displayicon.png',
  Killjoy: 'https://media.valorant-api.com/agents/1e58de9c-4950-5125-93e9-a0aee9f98746/displayicon.png',
  Breach: 'https://media.valorant-api.com/agents/5f8d3a7f-467b-97f3-062c-0390fdc621d6/displayicon.png',
  Omen: 'https://media.valorant-api.com/agents/8e253930-4c05-31dd-1b6c-968525494517/displayicon.png',
  Viper: 'https://media.valorant-api.com/agents/707eab51-4836-f488-046a-cda6bf494859/displayicon.png',
  Brimstone: 'https://media.valorant-api.com/agents/6f2a04ca-43e0-be17-7f36-b3908627744d/displayicon.png',
  Raze: 'https://media.valorant-api.com/agents/f94c3b30-42be-e959-889c-5aa313dba261/displayicon.png',
  Skye: 'https://media.valorant-api.com/agents/6ebc1aad-4bce-1387-2e2c-e529bf70abb7/displayicon.png',
  Yoru: 'https://media.valorant-api.com/agents/7f94d92c-4234-0a36-9646-3a87eb8b5c89/displayicon.png',
  Astra: 'https://media.valorant-api.com/agents/41fb69c1-4189-7b37-f117-bcaf1e96f1bf/displayicon.png',
  KAY_O: 'https://media.valorant-api.com/agents/601dbbe7-43ce-be57-2a40-4abd24953621/displayicon.png',
  Chamber: 'https://media.valorant-api.com/agents/22697054-9a77-4711-1c74-7f9724e2c4b4/displayicon.png',
  Neon: 'https://media.valorant-api.com/agents/bb2a4828-46eb-8cd1-e765-15848195d751/displayicon.png',
  Fade: 'https://media.valorant-api.com/agents/dade69b4-4f5a-8528-247b-219e5a1facd6/displayicon.png',
  Harbor: 'https://media.valorant-api.com/agents/95b78ed7-4637-86d9-7e41-71ba8c293152/displayicon.png',
  Gekko: 'https://media.valorant-api.com/agents/e370fa57-4757-3604-3648-499e1f642d3f/displayicon.png',
  Deadlock: 'https://media.valorant-api.com/agents/cc8b64c8-4b25-4ff9-6e7f-37b4da43d235/displayicon.png',
  Iso: 'https://media.valorant-api.com/agents/0e38b510-41a8-5780-5e8f-568b2a4f2d6c/displayicon.png',
  Clove: 'https://media.valorant-api.com/agents/1dbf2edd-4729-0984-3115-daa5eed44993/displayicon.png',
  Vyse: 'https://media.valorant-api.com/agents/efba5359-4016-a1e5-7626-b1ae76895940/displayicon.png',
  Tejo: 'https://media.valorant-api.com/agents/b444168c-4b4c-b691-11e9-b7ace45c39d4/displayicon.png',
  Waylay: 'https://media.valorant-api.com/agents/a3fe41f2-4a42-f4a4-2c0c-53d9b35e28a9/displayicon.png',
}

const agentImageUrl = computed(() => {
  if (!timeline.value?.agent) return null
  return AGENT_IMAGES[timeline.value.agent] ?? null
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
  const kills: TimelineEvent[] = (timeline.value.kills ?? [])
    .filter(k => k.videoOffsetMs != null)
    .map(k => ({ ...k, type: 'kill' as const }))
  const deaths: TimelineEvent[] = (timeline.value.deaths ?? [])
    .filter(d => d.videoOffsetMs != null)
    .map(d => ({ ...d, type: 'death' as const }))
  return [...kills, ...deaths].sort((a, b) => (a.videoOffsetMs ?? 0) - (b.videoOffsetMs ?? 0))
})

const roundGroups = computed((): RoundGroup[] => {
  if (!timeline.value) return []
  const roundMap = new Map<number, RoundGroup>()

  const summaries = timeline.value.roundSummaries ?? []
  for (const s of summaries) {
    roundMap.set(s.roundNumber, {
      roundNumber: s.roundNumber,
      won: s.winningTeam !== null,
      spikePlanted: s.spikePlanted,
      spikeDefused: s.spikeDefused,
      firstVideoOffsetMs: null,
      events: []
    })
  }

  for (const event of allTimelineEvents.value) {
    const r = event.round ?? 0
    if (!roundMap.has(r)) {
      roundMap.set(r, { roundNumber: r, won: false, spikePlanted: false, spikeDefused: false, firstVideoOffsetMs: null, events: [] })
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
  if (ms == null) return '--'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

function formatSeconds(s: number): string {
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
  duration.value = videoEl.value.duration
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
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  hoverTime.value = ((e.clientX - rect.left) / rect.width) * duration.value
}

onMounted(async () => {
  const id = route.query.id as string
  if (id) {
    timeline.value = await window.api.recordings.getTimeline(id)
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
