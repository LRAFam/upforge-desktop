<template>
  <div class="px-3 py-3 space-y-3">

    <!-- System warning banner (low disk space, etc.) -->
    <div
      v-if="warning"
      class="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/25 text-orange-300 text-xs"
    >
      <span class="text-orange-400">⚠</span>
      <span>{{ warning }}</span>
      <button class="ml-auto text-white/40 hover:text-white/70 leading-none" @click="warning = null">✕</button>
    </div>

    <!-- Status card -->
    <div
      :class="[
        'rounded-xl border transition-all overflow-hidden',
        !status.ffmpegOk
          ? 'bg-yellow-500/[0.07] border-yellow-500/25'
          : status.recording
            ? 'bg-red-500/[0.08] border-red-500/25'
            : status.recordingStarting
              ? 'bg-yellow-500/[0.07] border-yellow-500/20'
              : status.currentGame
                ? 'bg-orange-500/[0.07] border-orange-500/20'
                : 'bg-white/[0.02] border-white/[0.05]'
      ]"
    >
      <!-- Main row -->
      <div class="flex items-center gap-3 px-3 py-2.5">
        <!-- Indicator -->
        <div class="relative flex-shrink-0">
          <div :class="[
            'w-2.5 h-2.5 rounded-full',
            !status.ffmpegOk ? 'bg-yellow-400' :
            status.recording ? 'bg-red-500' :
            status.recordingStarting ? 'bg-yellow-400' :
            status.currentGame ? 'bg-orange-400' : 'bg-gray-700'
          ]" />
          <div v-if="status.recording" class="absolute inset-0 w-2.5 h-2.5 rounded-full bg-red-500 animate-ping opacity-70" />
          <div v-else-if="status.recordingStarting" class="absolute inset-0 w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping opacity-50" />
          <div v-else-if="status.waitingForMatch" class="absolute inset-0 w-2.5 h-2.5 rounded-full bg-orange-400 animate-ping opacity-50" />
        </div>

        <!-- Label -->
        <div class="flex-1 min-w-0">
          <!-- ffmpeg missing -->
          <template v-if="!status.ffmpegOk">
            <p class="text-xs font-semibold text-yellow-400">Recording unavailable</p>
            <p class="text-[10px] text-yellow-600 mt-0.5">Reinstall the app to restore recording</p>
          </template>
          <!-- Active recording -->
          <template v-else-if="status.recording">
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-bold tracking-widest uppercase text-red-400">REC</span>
              <span class="text-xs font-semibold capitalize">{{ status.currentGame || 'Valorant' }}</span>
              <span v-if="recordingElapsed" class="text-[11px] font-mono tabular-nums text-red-400/80">{{ recordingElapsed }}</span>
            </div>
            <p class="text-[10px] text-gray-500 mt-0.5">{{ recordingModeLabel }}</p>
          </template>
          <!-- Starting recorder (2s confirmation window) -->
          <template v-else-if="status.recordingStarting">
            <p class="text-xs font-semibold text-yellow-300">Starting recorder…</p>
            <p class="text-[10px] text-yellow-600/70 mt-0.5">Confirming ffmpeg started</p>
          </template>
          <!-- Game running, waiting for a match to load -->
          <template v-else-if="status.waitingForMatch">
            <p class="text-xs font-semibold text-orange-300">{{ status.currentGame || 'Valorant' }} running</p>
            <p class="text-[10px] text-orange-500/70 mt-0.5">Waiting for a match to start…</p>
          </template>
          <!-- Game detected (fallback — shouldn't usually be seen) -->
          <template v-else-if="status.currentGame">
            <p class="text-xs font-semibold text-orange-300">{{ status.currentGame }} detected</p>
            <p class="text-[10px] text-orange-500/70 mt-0.5">Waiting for match…</p>
          </template>
          <!-- Mac / no detection -->
          <template v-else-if="platform && platform !== 'win32'">
            <p class="text-xs text-gray-500">macOS — preview mode</p>
            <p class="text-[10px] text-gray-700 mt-0.5">Automatic recording requires Windows</p>
          </template>
          <!-- Idle -->
          <template v-else>
            <p class="text-xs text-gray-400">Watching for Valorant</p>
            <p v-if="status.recordedModes && status.recordedModes.length" class="text-[10px] text-gray-600 mt-0.5">
              Recording: {{ status.recordedModes.map(formatMode).join(' · ') }}
            </p>
            <p v-else class="text-[10px] text-gray-700 mt-0.5">No game modes selected — check Settings</p>
          </template>
        </div>

        <!-- Stop button (only while recording) -->
        <button
          v-if="status.recording"
          :disabled="stopping"
          class="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-red-500/[0.12] hover:bg-red-500/[0.2] border border-red-500/20 text-red-400 transition-all disabled:opacity-50"
          @click="stopRecording"
        >
          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="1"/>
          </svg>
          {{ stopping ? 'Stopping…' : 'Stop' }}
        </button>
      </div>
    </div>

    <!-- Activity log — compact event history -->
    <div v-if="activityLog.length" class="bg-white/[0.02] border border-white/[0.05] rounded-xl overflow-hidden">
      <div class="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
        <span class="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Recent Activity</span>
        <button class="text-gray-700 hover:text-gray-500 transition-colors" @click="clearLog">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="px-3 py-2 space-y-1.5 max-h-28 overflow-y-auto">
        <div
          v-for="entry in [...activityLog].reverse().slice(0, 8)"
          :key="entry.time"
          class="flex items-start gap-2"
        >
          <span class="text-[9px] text-gray-700 tabular-nums flex-shrink-0 mt-px pt-[1px]">{{ formatLogTime(entry.time) }}</span>
          <span class="text-[10px] text-gray-400 leading-snug">{{ entry.message }}</span>
        </div>
      </div>
    </div>

    <!-- Profile card -->
    <div v-if="profile" class="bg-white/[0.02] border border-white/[0.05] rounded-xl overflow-hidden">
      <div class="flex items-center gap-3 px-3 pt-3 pb-2.5">
        <div class="relative flex-shrink-0">
          <img
            v-if="playerCardUrl"
            :src="playerCardUrl"
            class="w-9 h-9 rounded-lg object-cover"
            @error="playerCardUrl = ''"
          />
          <div
            v-else
            class="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500/30 to-orange-600/30 border border-white/[0.08] flex items-center justify-center"
          >
            <span class="text-sm font-bold text-red-400">{{ profile.user.name?.charAt(0).toUpperCase() }}</span>
          </div>
          <div
            v-if="profile.user.tier && profile.user.tier !== 'free'"
            :class="['absolute -bottom-1 -right-1 px-1 py-px rounded text-[8px] font-bold uppercase', tierBadgeClass(profile.user.tier)]"
          >{{ profile.user.tier.charAt(0) }}</div>
        </div>

        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold leading-tight truncate">{{ profile.user.name }}</p>
          <p class="text-[10px] text-gray-500 leading-tight truncate mt-px">
            <span v-if="profile.user.riot_name">{{ profile.user.riot_name }}#{{ profile.user.riot_tag }}</span>
            <span v-else class="text-gray-600">No Riot ID linked</span>
          </p>
        </div>

        <div v-if="profile.latest_stats?.current_rank" class="flex-shrink-0 text-right">
          <span :class="['text-[11px] font-bold', rankColor(profile.latest_stats.current_rank)]">
            {{ profile.latest_stats.current_rank }}
          </span>
          <p v-if="profile.latest_stats.rr != null" class="text-[9px] text-gray-600 mt-px">{{ profile.latest_stats.rr }} RR</p>
        </div>
        <button class="text-gray-700 hover:text-gray-400 transition-colors flex-shrink-0" @click="refreshProfile">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </button>
        <button class="text-gray-700 hover:text-gray-400 transition-colors flex-shrink-0" @click="openBrowser">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
        </button>
      </div>

      <div v-if="profile.latest_stats" class="grid grid-cols-4 divide-x divide-white/[0.04] border-t border-white/[0.04]">
        <div class="flex flex-col items-center py-2">
          <span class="text-[11px] font-bold">{{ profile.latest_stats.kd_ratio?.toFixed(2) ?? '—' }}</span>
          <span class="text-[9px] text-gray-600 mt-px">K/D</span>
        </div>
        <div class="flex flex-col items-center py-2">
          <span class="text-[11px] font-bold">{{ profile.latest_stats.win_rate != null ? Math.round(profile.latest_stats.win_rate) + '%' : '—' }}</span>
          <span class="text-[9px] text-gray-600 mt-px">Win</span>
        </div>
        <div class="flex flex-col items-center py-2">
          <span class="text-[11px] font-bold">{{ profile.latest_stats.avg_combat_score ?? '—' }}</span>
          <span class="text-[9px] text-gray-600 mt-px">ACS</span>
        </div>
        <div class="flex flex-col items-center py-2">
          <span class="text-[11px] font-bold">{{ profile.latest_stats.headshot_percentage != null ? Math.round(profile.latest_stats.headshot_percentage) + '%' : '—' }}</span>
          <span class="text-[9px] text-gray-600 mt-px">HS%</span>
        </div>
      </div>
      <div v-else class="px-3 pb-2 pt-1">
        <p class="text-[10px] text-gray-600">No Valorant stats yet — link your Riot ID on upforge.gg</p>
      </div>
      <!-- Quota row -->
      <div v-if="profile.user.analysis_stats" class="px-3 py-2 border-t border-white/[0.04] flex items-center justify-between gap-2">
        <span class="text-[10px] text-gray-600">Analyses left</span>
        <div class="flex items-center gap-2">
          <div class="h-1 w-16 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              :class="quotaPercent >= 80 ? 'bg-red-500' : quotaPercent >= 50 ? 'bg-yellow-500' : 'bg-green-500'"
              :style="{ width: (100 - quotaPercent) + '%' }"
            />
          </div>
          <span class="text-[10px] font-medium tabular-nums" :class="(profile.user.analysis_stats.limit - profile.user.analysis_stats.total) <= 0 ? 'text-red-400' : 'text-gray-300'">
            {{ Math.max(0, profile.user.analysis_stats.limit - profile.user.analysis_stats.total) }}/{{ profile.user.analysis_stats.limit }}
          </span>
        </div>
      </div>
    </div>
    <div v-else-if="profileLoading" class="h-[88px] bg-white/[0.02] rounded-xl animate-pulse border border-white/[0.04]" />

    <!-- Pending recordings -->
    <div v-if="pendingRecordings.length > 0" class="space-y-1.5">
      <div class="flex items-center justify-between px-0.5">
        <h2 class="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">Pending Analysis</h2>
      </div>
      <div
        v-for="rec in pendingRecordings"
        :key="rec.id"
        class="flex items-center gap-3 px-3 py-2.5 bg-blue-500/[0.04] border border-blue-500/[0.12] rounded-xl"
      >
        <div class="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center bg-blue-500/[0.1]">
          <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-medium text-gray-200 truncate">
            {{ rec.agent || 'Unknown' }}<span v-if="rec.map" class="text-gray-600"> &middot; {{ rec.map }}</span>
          </p>
          <p class="text-[10px] text-gray-600 mt-0.5">{{ formatDate(new Date(rec.recordedAt).toISOString()) }} &middot; {{ formatMode(rec.gameMode) }}</p>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button
            :disabled="analysingIds.has(rec.id)"
            class="px-2.5 py-1 text-[10px] font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-lg transition-colors"
            @click="analyseRecording(rec.id)"
          >{{ analysingIds.has(rec.id) ? '...' : 'Analyse' }}</button>
          <button
            class="p-1.5 text-gray-600 hover:text-gray-400 transition-colors rounded-lg hover:bg-white/[0.04]"
            @click="dismissRecording(rec.id)"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Section header -->
    <div class="flex items-center justify-between px-0.5 pt-0.5">
      <h2 class="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">Recent Analyses</h2>
      <button v-if="analyses.length > 0" class="text-[10px] text-gray-600 hover:text-gray-400 transition-colors" @click="openBrowser">View all</button>
    </div>

    <!-- Loading skeleton -->
    <div v-if="analysesLoading" class="space-y-2">
      <div v-for="i in 3" :key="i" class="h-[52px] bg-white/[0.02] rounded-xl animate-pulse border border-white/[0.04]" />
    </div>

    <!-- Empty state -->
    <div v-else-if="analyses.length === 0" class="flex flex-col items-center justify-center py-8 text-center">
      <div class="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-3">
        <svg class="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
        </svg>
      </div>
      <p class="text-xs text-gray-600">No analyses yet</p>
      <p class="text-[10px] text-gray-700 mt-0.5">Play Valorant to get started</p>
    </div>

    <!-- Analysis list -->
    <div v-else class="space-y-1.5">
      <button
        v-for="a in analyses"
        :key="a.id"
        class="w-full flex items-center gap-3 px-3 py-2.5 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] hover:border-white/[0.08] rounded-xl transition-all text-left"
        @click="openAnalysis(a.id)"
      >
        <div :class="['w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center', a.job_id ? 'bg-red-500/[0.12]' : 'bg-white/[0.04]']">
          <svg v-if="a.job_id" class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8" stroke-width="1.5"/>
            <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>
          </svg>
          <svg v-else class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-medium text-gray-200 truncate">
            {{ a.agent || 'Unknown' }}
            <span class="text-gray-600">&middot;</span>
            {{ a.map || 'Unknown' }}
          </p>
          <p class="text-[10px] text-gray-600 mt-0.5 flex items-center gap-1.5">
            <span>{{ formatDate(a.created_at) }}</span>
            <span v-if="a.won != null" :class="a.won ? 'text-green-500/70' : 'text-red-500/60'">{{ a.won ? 'W' : 'L' }}</span>
            <span v-if="a.kda != null">{{ a.kda.toFixed(2) }} K/D</span>
          </p>
        </div>
        <div v-if="a.overall_score != null" class="flex-shrink-0 text-right">
          <span class="text-[11px] font-bold tabular-nums" :class="a.overall_score >= 80 ? 'text-green-400' : a.overall_score >= 60 ? 'text-yellow-400' : 'text-red-400'">{{ a.overall_score }}</span>
          <span class="block text-[9px] text-gray-700">/100</span>
        </div>
        <div v-else-if="a.combat_score" class="flex-shrink-0 text-right">
          <span class="text-[11px] font-bold text-gray-400 tabular-nums">{{ a.combat_score }}</span>
          <span class="block text-[9px] text-gray-700">ACS</span>
        </div>
        <svg v-else class="w-3.5 h-3.5 text-gray-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </button>
    </div>

    <!-- Dev tools -->
    <div v-if="isDev || (platform && platform !== 'win32')" class="mt-2 border border-dashed border-yellow-500/20 rounded-xl overflow-hidden">
      <button
        class="w-full flex items-center justify-between px-3 py-2 text-[10px] text-yellow-600/60 hover:text-yellow-500/70 transition-colors"
        @click="devOpen = !devOpen"
      >
        <span class="font-semibold uppercase tracking-wider">Dev Tools</span>
        <svg class="w-3 h-3 transition-transform" :class="devOpen ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      <div v-if="devOpen" class="px-3 pb-3 space-y-2">
        <div class="flex gap-2">
          <button
            class="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-yellow-500/[0.08] text-yellow-500/70 hover:bg-yellow-500/[0.14] transition-colors border border-yellow-500/10"
            :disabled="simulating"
            @click="simulateGame('valorant', 8000)"
          >{{ simulating ? 'Simulating...' : 'Simulate Valorant (8s)' }}</button>
          <button
            class="px-2 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.04] text-gray-500 hover:bg-white/[0.07] transition-colors border border-white/[0.05]"
            @click="$router.push('/post-game-preview')"
          >Post-game</button>
        </div>
        <p v-if="simStatus" class="text-[10px] text-yellow-500/50">{{ simStatus }}</p>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import type { ProfileData, AnalysisItem, PendingRecording } from '../env.d.ts'

const router = useRouter()

const profile = ref<ProfileData | null>(null)
const profileLoading = ref(true)
const playerCardUrl = ref('')
const analyses = ref<AnalysisItem[]>([])
const analysesLoading = ref(true)
const pendingRecordings = ref<PendingRecording[]>([])
const analysingIds = ref(new Set<string>())
const status = ref<{ recording: boolean; recordingStarting: boolean; currentGame: string | null; waitingForMatch: boolean; ffmpegOk: boolean; recordedModes: string[] }>({ recording: false, recordingStarting: false, currentGame: null, waitingForMatch: false, ffmpegOk: true, recordedModes: [] })
const isDev = ref(false)
const platform = ref('')
const devOpen = ref(false)
const simulating = ref(false)
const simStatus = ref('')
const recordingStartedAt = ref<number | null>(null)
const recordingElapsed = ref('')
const stopping = ref(false)
const warning = ref<string | null>(null)
const activityLog = ref<{ time: number; message: string }[]>([])

const quotaPercent = computed(() => {
  const stats = profile.value?.user?.analysis_stats
  if (!stats || !stats.limit) return 0
  return Math.min(100, Math.round((stats.total / stats.limit) * 100))
})

const recordingModeLabel = computed(() => {
  const modes = status.value.recordedModes
  if (!modes || !modes.length) return 'Recording…'
  const current = modes.map(formatMode).join(' · ')
  return `Recording ${current} matches`
})

let pollInterval: ReturnType<typeof setInterval>
let durationInterval: ReturnType<typeof setInterval>

function updateRecordingElapsed() {
  if (!recordingStartedAt.value) { recordingElapsed.value = ''; return }
  const secs = Math.floor((Date.now() - recordingStartedAt.value) / 1000)
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  recordingElapsed.value = `${m}:${s}`
}

function formatLogTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function clearLog() {
  activityLog.value = []
}

onMounted(async () => {
  try {
    const s = await window.api.app.getStatus()
    isDev.value = s.isDev
    platform.value = s.platform ?? ''
    if (!s.authenticated) {
      router.push(s.firstRun ? '/welcome' : '/login')
      return
    }
    status.value = { recording: s.recording, recordingStarting: false, currentGame: s.currentGame, waitingForMatch: s.waitingForMatch ?? false, ffmpegOk: s.ffmpegOk !== false, recordedModes: s.recordedModes ?? [] }
    if (s.recording) { recordingStartedAt.value = Date.now() }
  } catch {
    router.push('/login')
    return
  }

  const [prof, recent] = await Promise.all([
    window.api.profile.get().catch(() => null),
    window.api.analyses.get(10).catch(() => [] as AnalysisItem[])
  ])

  profile.value = prof
  profileLoading.value = false

  if (prof?.latest_stats?.player_card_id) {
    playerCardUrl.value = `https://media.valorant-api.com/playercards/${prof.latest_stats.player_card_id}/smallart.png`
  }

  analyses.value = recent
  analysesLoading.value = false

  // Load pending (unanalysed) recordings
  pendingRecordings.value = await window.api.recordings.get().catch(() => [])

  // Load activity log history
  activityLog.value = await window.api.app.getActivityLog().catch(() => [])

  pollInterval = setInterval(async () => {
    try {
      const s = await window.api.app.getStatus()
      const wasRecording = status.value.recording
      status.value = { recording: s.recording, recordingStarting: status.value.recordingStarting, currentGame: s.currentGame, waitingForMatch: s.waitingForMatch ?? false, ffmpegOk: s.ffmpegOk !== false, recordedModes: s.recordedModes ?? [] }
      if (s.recording && !wasRecording) recordingStartedAt.value = Date.now()
      if (!s.recording) { recordingStartedAt.value = null; stopping.value = false }
    } catch { /* ignore */ }
  }, 5000)

  durationInterval = setInterval(updateRecordingElapsed, 1000)

  window.api.on('dashboard:refresh', refreshProfile)
  window.api.on('recordings:updated', loadPendingRecordings)
  window.api.on('app:activity-log', ((...args: unknown[]) => {
    activityLog.value = args[0] as { time: number; message: string }[]
  }) as (...args: unknown[]) => void)
  window.api.on('app:ffmpeg-status', ((...args: unknown[]) => {
    const data = args[0] as { ok: boolean }
    status.value = { ...status.value, ffmpegOk: data.ok }
  }) as (...args: unknown[]) => void)
  window.api.on('recording:status-changed', ((...args: unknown[]) => {
    const data = args[0] as { recording: boolean; error: string | null }
    const wasRecording = status.value.recording
    status.value = { ...status.value, recording: data.recording, recordingStarting: false }
    if (data.recording && !wasRecording) recordingStartedAt.value = Date.now()
    if (!data.recording) { recordingStartedAt.value = null; stopping.value = false }
    if (!data.recording && data.error) {
      console.error('[Dashboard] Recording stopped with error:', data.error)
      warning.value = `Recording stopped: ${data.error}`
      setTimeout(() => { warning.value = null }, 15000)
    }
  }) as (...args: unknown[]) => void)
  window.api.on('recording:starting', ((...args: unknown[]) => {
    const data = args[0] as { starting: boolean }
    status.value = { ...status.value, recordingStarting: data.starting }
  }) as (...args: unknown[]) => void)
  window.api.on('app:warning', ((...args: unknown[]) => {
    const data = args[0] as { message: string }
    warning.value = data.message
    setTimeout(() => { warning.value = null }, 12000)
  }) as (...args: unknown[]) => void)
  window.api.on('recording:waiting-for-match', ((...args: unknown[]) => {
    const data = args[0] as { waiting: boolean }
    status.value = { ...status.value, waitingForMatch: data.waiting }
  }) as (...args: unknown[]) => void)
})

onUnmounted(() => {
  clearInterval(pollInterval)
  clearInterval(durationInterval)
  recordingStartedAt.value = null
  recordingElapsed.value = ''
})

async function loadAnalyses() {
  analysesLoading.value = true
  try {
    analyses.value = await window.api.analyses.get(10)
  } catch {
    analyses.value = []
  } finally {
    analysesLoading.value = false
  }
}

async function refreshProfile() {
  profileLoading.value = true
  try {
    const prof = await window.api.profile.get()
    profile.value = prof
    if (prof?.latest_stats?.player_card_id) {
      playerCardUrl.value = `https://media.valorant-api.com/playercards/${prof.latest_stats.player_card_id}/smallart.png`
    }
  } catch { /* ignore */ } finally {
    profileLoading.value = false
  }
  loadAnalyses()
}

async function loadPendingRecordings() {
  pendingRecordings.value = await window.api.recordings.get().catch(() => [])
}

async function analyseRecording(id: string) {
  if (analysingIds.value.has(id)) return

  // Quota gate — prevent upload if user has no analyses remaining
  const stats = profile.value?.user?.analysis_stats
  if (stats && (stats.limit - stats.total) <= 0) {
    warning.value = 'No analyses remaining this month. Upgrade your plan at upforge.gg to get more.'
    setTimeout(() => { warning.value = null }, 10000)
    return
  }

  analysingIds.value.add(id)
  analysingIds.value = new Set(analysingIds.value) // trigger reactivity
  try {
    await window.api.recordings.analyse(id)
    // Remove from pending list — will come back as an analysis via dashboard:refresh
    pendingRecordings.value = pendingRecordings.value.filter(r => r.id !== id)
  } catch {
    analysingIds.value.delete(id)
    analysingIds.value = new Set(analysingIds.value)
  }
}

async function dismissRecording(id: string) {
  await window.api.recordings.dismiss(id).catch(() => {})
  pendingRecordings.value = pendingRecordings.value.filter(r => r.id !== id)
}

function formatMode(mode: string): string {
  const map: Record<string, string> = {
    COMPETITIVE: 'Competitive', PREMIER: 'Premier', CLASSIC: 'Unrated',
    DEATHMATCH: 'Deathmatch', TEAMDEATHMATCH: 'Team Deathmatch',
    SPIKERUSH: 'Spike Rush', SWIFTPLAY: 'Swift Play', SNOWBALL: 'Snowball Fight'
  }
  return map[mode] ?? mode
}

async function stopRecording() {
  if (stopping.value) return
  stopping.value = true
  try {
    await window.api.recorder.stop()
    // Optimistically update state — the poll interval will confirm within 5s
    status.value = { ...status.value, recording: false }
    recordingStartedAt.value = null
  } catch {
    stopping.value = false
  }
}

function simulateGame(game: string, durationMs: number) {
  simulating.value = true
  simStatus.value = `Simulating ${game} for ${durationMs / 1000}s...`
  window.api.dev.simulateGame(game, durationMs)
  setTimeout(() => { simulating.value = false; simStatus.value = 'Done' }, durationMs + 500)
}

function openAnalysis(id: number) { window.open(`https://upforge.gg/results/${id}`, '_blank') }
function openBrowser() { window.open('https://upforge.gg/dashboard', '_blank') }

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function tierBadgeClass(tier: string): string {
  switch (tier?.toLowerCase()) {
    case 'pro': return 'bg-purple-500/20 text-purple-400'
    case 'elite': return 'bg-yellow-500/20 text-yellow-400'
    case 'premium': return 'bg-red-500/20 text-red-400'
    default: return 'bg-white/10 text-gray-400'
  }
}

function rankColor(rank: string): string {
  const r = rank?.toLowerCase() ?? ''
  if (r.includes('radiant')) return 'text-yellow-300'
  if (r.includes('immortal')) return 'text-red-400'
  if (r.includes('ascendant')) return 'text-emerald-400'
  if (r.includes('diamond')) return 'text-blue-400'
  if (r.includes('platinum')) return 'text-cyan-400'
  if (r.includes('gold')) return 'text-yellow-400'
  if (r.includes('silver')) return 'text-slate-300'
  if (r.includes('bronze')) return 'text-amber-600'
  return 'text-gray-500'
}
</script>
