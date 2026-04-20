<template>
  <div class="px-4 py-4 space-y-4">
    <!-- Status banner -->
    <div
      :class="[
        'flex items-center gap-3 px-4 py-3 rounded-xl border text-sm',
        status.recording
          ? 'bg-red-500/10 border-red-500/20 text-red-300'
          : status.currentGame
            ? 'bg-orange-500/10 border-orange-500/20 text-orange-300'
            : 'bg-white/[0.03] border-white/[0.06] text-gray-400'
      ]"
    >
      <span
        :class="[
          'w-2 h-2 rounded-full flex-shrink-0',
          status.recording ? 'bg-red-400 animate-pulse' : 'bg-gray-600'
        ]"
      />
      <span v-if="status.recording">Recording {{ status.currentGame }}...</span>
      <span v-else-if="status.currentGame">{{ status.currentGame }} detected</span>
      <span v-else>Waiting for Valorant to launch</span>
    </div>

    <!-- User info -->
    <div v-if="user" class="flex items-center justify-between px-1">
      <div>
        <p class="text-sm font-medium">{{ user.name }}</p>
        <p class="text-xs text-gray-500">
          {{ user.riot_name ? `${user.riot_name}#${user.riot_tag}` : 'No Riot ID linked' }}
          &middot;
          <span class="capitalize">{{ user.tier }}</span>
        </p>
      </div>
      <button
        class="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        @click="openBrowser"
      >
        View on site ↗
      </button>
    </div>

    <!-- Recent analyses -->
    <div>
      <h2 class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 px-1">
        Recent Analyses
      </h2>

      <div v-if="loading" class="space-y-2">
        <div v-for="i in 3" :key="i" class="h-14 bg-white/[0.03] rounded-xl animate-pulse" />
      </div>

      <div v-else-if="analyses.length === 0" class="text-center py-8 text-gray-600 text-sm">
        <p>No analyses yet.</p>
        <p class="text-xs mt-1">Launch Valorant to start recording automatically.</p>
      </div>

      <div v-else class="space-y-2">
        <button
          v-for="analysis in analyses"
          :key="analysis.id"
          class="w-full flex items-center justify-between px-3 py-2.5 bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] rounded-xl transition-colors text-left"
          @click="openAnalysis(analysis.id)"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <div
              :class="[
                'w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold',
                analysis.source === 'desktop'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-white/[0.06] text-gray-400'
              ]"
            >
              {{ analysis.source === 'desktop' ? '⏺' : '▶' }}
            </div>
            <div class="min-w-0">
              <p class="text-xs font-medium truncate">
                {{ analysis.agent || 'Unknown' }} &middot; {{ analysis.map || 'Unknown' }}
              </p>
              <p class="text-xs text-gray-500">{{ formatDate(analysis.created_at) }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0 ml-2">
            <div
              v-if="analysis.overall_score"
              class="text-xs font-semibold px-2 py-0.5 rounded-full"
              :class="scoreClass(analysis.overall_score)"
            >
              {{ analysis.overall_score }}
            </div>
            <span
              v-if="analysis.status === 'processing'"
              class="text-xs text-orange-400 animate-pulse"
            >Analysing...</span>
          </div>
        </button>
      </div>
    </div>

    <!-- Dev tools (only shown in dev mode on Mac) -->
    <div v-if="isDev" class="border border-dashed border-yellow-500/30 rounded-xl p-3 space-y-2">
      <p class="text-xs font-medium text-yellow-500/70 uppercase tracking-wider">⚡ Dev Tools</p>
      <p class="text-xs text-gray-500">Simulate game detection (Mac dev only)</p>
      <div class="flex gap-2">
        <button
          class="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
          :disabled="simulating"
          @click="simulateGame('valorant', 8000)"
        >
          {{ simulating ? 'Simulating...' : 'Simulate Valorant (8s)' }}
        </button>
        <button
          class="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] text-gray-400 hover:bg-white/[0.08] transition-colors"
          @click="openPostGame"
        >
          Post-game UI
        </button>
      </div>
      <p v-if="simStatus" class="text-xs text-yellow-400/70">{{ simStatus }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

interface Analysis {
  id: number
  agent: string | null
  map: string | null
  overall_score: number | null
  status: string
  source: 'web' | 'desktop'
  created_at: string
}

interface AppStatus {
  recording: boolean
  currentGame: string | null
  authenticated: boolean
  isDev: boolean
  user: { name: string; tier: string; riot_name: string | null; riot_tag: string | null } | null
}

const user = ref<AppStatus['user']>(null)
const status = ref<Pick<AppStatus, 'recording' | 'currentGame'>>({ recording: false, currentGame: null })
const analyses = ref<Analysis[]>([])
const loading = ref(true)
const isDev = ref(false)
const simulating = ref(false)
const simStatus = ref('')

let refreshInterval: ReturnType<typeof setInterval>

onMounted(async () => {
  const s = await window.api.app.getStatus() as AppStatus

  if (!s.authenticated) {
    router.push('/login')
    return
  }

  user.value = s.user
  status.value = { recording: s.recording, currentGame: s.currentGame }
  isDev.value = s.isDev

  await loadAnalyses()

  refreshInterval = setInterval(async () => {
    const s = await window.api.app.getStatus() as AppStatus
    status.value = { recording: s.recording, currentGame: s.currentGame }
  }, 5000)

  window.api.on('dashboard:refresh', loadAnalyses)

  window.api.on('post-game:upload-start', () => {
    simStatus.value = 'Upload started...'
  })
})

onUnmounted(() => {
  clearInterval(refreshInterval)
})

async function loadAnalyses() {
  loading.value = true
  try {
    // TODO: replace with IPC-based fetch using authManager.getApi() once API endpoint exists
    analyses.value = []
  } catch {
    analyses.value = []
  } finally {
    loading.value = false
  }
}

async function simulateGame(game: string, durationMs: number) {
  simulating.value = true
  simStatus.value = `Simulating ${game} session for ${durationMs / 1000}s...`
  await window.api.dev.simulateGame(game, durationMs)
  setTimeout(() => {
    simulating.value = false
    simStatus.value = 'Session ended — post-game flow should trigger'
  }, durationMs + 500)
}

function openPostGame() {
  // Navigate to post-game route so you can preview the UI directly
  router.push('/post-game-preview')
}

function openAnalysis(id: number) {
  window.open(`https://upforge.gg/results/${id}`, '_blank')
}

function openBrowser() {
  window.open('https://upforge.gg/dashboard', '_blank')
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function scoreClass(score: number): string {
  if (score >= 80) return 'bg-green-500/20 text-green-400'
  if (score >= 60) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-red-500/20 text-red-400'
}
</script>
