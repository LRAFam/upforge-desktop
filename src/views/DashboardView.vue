<template>
  <div class="px-3 py-3 space-y-3">

    <!-- Status card -->
    <div
      :class="[
        'flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs transition-all',
        status.recording
          ? 'bg-red-500/[0.08] border-red-500/20 text-red-300'
          : status.currentGame
            ? 'bg-orange-500/[0.08] border-orange-500/20 text-orange-300'
            : 'bg-white/[0.02] border-white/[0.05] text-gray-500'
      ]"
    >
      <div class="relative flex-shrink-0">
        <div :class="['w-2 h-2 rounded-full', status.recording ? 'bg-red-500' : status.currentGame ? 'bg-orange-500' : 'bg-gray-700']" />
        <div v-if="status.recording" class="absolute inset-0 w-2 h-2 rounded-full bg-red-500 animate-ping opacity-75" />
      </div>
      <span v-if="status.recording" class="font-medium">Recording {{ status.currentGame }}...</span>
      <span v-else-if="status.currentGame">{{ status.currentGame }} detected</span>
      <span v-else-if="platform !== 'win32'" class="text-gray-500">Game detection requires Windows — use simulate below</span>
      <span v-else>Waiting for Valorant to launch</span>
    </div>

    <!-- User strip -->
    <div v-if="user" class="flex items-center justify-between px-1">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-red-500/30 to-orange-600/30 border border-white/[0.08] flex items-center justify-center flex-shrink-0">
          <span class="text-[11px] font-bold text-red-400">{{ user.name?.charAt(0).toUpperCase() }}</span>
        </div>
        <div class="min-w-0">
          <p class="text-xs font-medium leading-tight truncate">{{ user.name }}</p>
          <p class="text-[10px] text-gray-500 leading-tight truncate">
            {{ user.riot_name ? `${user.riot_name}#${user.riot_tag}` : 'No Riot ID linked' }}
            <span class="text-gray-600">&nbsp;&middot;&nbsp;</span>
            <span class="capitalize">{{ user.tier }}</span>
          </p>
        </div>
      </div>
      <button class="text-[11px] text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0 ml-2" @click="openBrowser">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
        </svg>
      </button>
    </div>

    <!-- Section header -->
    <div class="flex items-center justify-between px-0.5 pt-1">
      <h2 class="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">Recent Analyses</h2>
      <button v-if="analyses.length > 0" class="text-[10px] text-gray-600 hover:text-gray-400 transition-colors" @click="openBrowser">View all</button>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="space-y-2">
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
      <p class="text-[10px] text-gray-700 mt-0.5">Play Valorant and your sessions will appear here</p>
    </div>

    <!-- Analysis list -->
    <div v-else class="space-y-1.5">
      <button
        v-for="a in analyses"
        :key="a.id"
        class="w-full flex items-center gap-3 px-3 py-2.5 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] hover:border-white/[0.08] rounded-xl transition-all text-left"
        @click="openAnalysis(a.id)"
      >
        <div :class="['w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center', a.source === 'desktop' ? 'bg-red-500/[0.12]' : 'bg-white/[0.04]']">
          <svg v-if="a.source === 'desktop'" class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <p class="text-[10px] text-gray-600 mt-0.5">{{ formatDate(a.created_at) }}</p>
        </div>
        <div class="flex-shrink-0">
          <span v-if="a.overall_score" class="text-[11px] font-bold tabular-nums" :class="scoreClass(a.overall_score)">{{ a.overall_score }}</span>
          <span v-else-if="a.status === 'processing'" class="text-[10px] text-orange-400/80 animate-pulse">...</span>
        </div>
      </button>
    </div>

    <!-- Dev tools (show in dev mode, or always on Mac since game detection is Windows-only) -->
    <div v-if="isDev || platform !== 'win32'" class="mt-2 border border-dashed border-yellow-500/20 rounded-xl overflow-hidden">
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
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

interface Analysis {
  id: number; agent: string | null; map: string | null
  overall_score: number | null; status: string; source: 'web' | 'desktop'; created_at: string
}

type AppUser = { name: string; email: string; tier: string; riot_name: string | null; riot_tag: string | null } | null

const user = ref<AppUser>(null)
const status = ref<{ recording: boolean; currentGame: string | null }>({ recording: false, currentGame: null })
const analyses = ref<Analysis[]>([])
const loading = ref(true)
const isDev = ref(false)
const platform = ref('')
const devOpen = ref(false)
const simulating = ref(false)
const simStatus = ref('')

let pollInterval: ReturnType<typeof setInterval>

onMounted(async () => {
  const s = await window.api.app.getStatus()
  isDev.value = s.isDev
  platform.value = s.platform ?? ''
  if (!s.authenticated) {
    router.push(s.firstRun ? '/welcome' : '/login')
    return
  }
  user.value = s.user
  status.value = { recording: s.recording, currentGame: s.currentGame }
  await loadAnalyses()
  pollInterval = setInterval(async () => {
    const s = await window.api.app.getStatus()
    status.value = { recording: s.recording, currentGame: s.currentGame }
  }, 5000)
  window.api.on('dashboard:refresh', loadAnalyses)
})

onUnmounted(() => clearInterval(pollInterval))

async function loadAnalyses() {
  loading.value = true
  try { analyses.value = [] }
  catch { analyses.value = [] }
  finally { loading.value = false }
}

async function simulateGame(game: string, durationMs: number) {
  simulating.value = true
  simStatus.value = `Simulating ${game} for ${durationMs / 1000}s...`
  await window.api.dev.simulateGame(game, durationMs)
  setTimeout(() => { simulating.value = false; simStatus.value = 'Done - post-game flow triggered' }, durationMs + 500)
}

function openAnalysis(id: number) { window.open(`https://upforge.gg/results/${id}`, '_blank') }
function openBrowser() { window.open('https://upforge.gg/dashboard', '_blank') }

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function scoreClass(s: number): string {
  return s >= 80 ? 'text-green-400' : s >= 60 ? 'text-yellow-400' : 'text-red-400'
}
</script>
