<template>
  <div class="flex flex-col h-full bg-[#0c0c0c] relative overflow-hidden">
    <!-- Subtle glow bg — uses agent accent colour when available -->
    <div class="absolute inset-0 pointer-events-none">
      <div
        class="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 rounded-full blur-3xl transition-all duration-700 opacity-60"
        :style="glowBgStyle"
      />
    </div>

    <div class="flex-1 flex flex-col items-center justify-center px-5 py-4 relative z-10">

      <!-- Uploading -->
      <div v-if="state === 'uploading'" class="w-full space-y-4 text-center">
        <div
          class="w-11 h-11 mx-auto rounded-full overflow-hidden flex items-center justify-center transition-all"
          :class="agentImageUrl ? '' : 'bg-red-500/10 border border-red-500/20'"
          :style="agentImageUrl ? { border: `1px solid ${agentAccentColor}50`, background: agentAccentColor + '20' } : {}"
        >
          <img v-if="agentImageUrl" :src="agentImageUrl" class="w-9 h-9 object-contain" />
          <svg v-else class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold">Uploading replay</p>
          <p class="text-[11px] text-gray-500 mt-0.5">
            {{ gameInfo.agent || gameLabel }}<span v-if="gameInfo.map"> &middot; {{ gameInfo.map }}</span>
          </p>
        </div>
        <div class="w-full space-y-1.5">
          <div class="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full transition-all duration-300"
              :style="{ width: `${uploadProgress}%` }"
            />
          </div>
          <p class="text-[10px] text-gray-600 text-right">{{ uploadProgress }}%</p>
        </div>
      </div>

      <!-- Analysing -->
      <div v-else-if="state === 'analysing'" class="w-full space-y-4 text-center">
        <div
          class="w-11 h-11 mx-auto rounded-full overflow-hidden flex items-center justify-center transition-all"
          :class="agentImageUrl ? '' : 'bg-orange-500/10 border border-orange-500/20'"
          :style="agentImageUrl ? { border: `1px solid ${agentAccentColor}50`, background: agentAccentColor + '20' } : {}"
        >
          <img v-if="agentImageUrl" :src="agentImageUrl" class="w-9 h-9 object-contain" />
          <svg v-else class="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold">Analysing gameplay</p>
          <p class="text-[11px] text-gray-500 mt-0.5">~3 min · AI is reviewing your frames</p>
        </div>
        <!-- Rotating coaching tip -->
        <div class="px-3 py-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl text-left">
          <p class="text-[9px] font-semibold uppercase tracking-wider text-gray-600 mb-1">Did you know?</p>
          <p class="text-[11px] text-gray-400 leading-relaxed">{{ currentTip }}</p>
        </div>
        <div class="flex items-center justify-center gap-1.5">
          <span v-for="i in 3" :key="i" class="w-1.5 h-1.5 rounded-full bg-orange-500/60 animate-bounce" :style="{ animationDelay: `${(i - 1) * 0.18}s` }" />
        </div>
        <div v-if="analysisStuck" class="flex items-start gap-2 px-3 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-left">
          <svg class="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="flex-1 min-w-0">
            <p class="text-[11px] text-gray-400">Taking longer than usual</p>
            <p class="text-[10px] text-gray-600 mt-0.5">Your analysis is still running in the background. Check results on the dashboard.</p>
            <button
              class="mt-2 px-2.5 py-1 text-[10px] font-medium text-gray-300 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors"
              @click="dismiss"
            >Close &amp; check dashboard</button>
          </div>
        </div>
      </div>

      <!-- Ready -->
      <div v-else-if="state === 'ready'" class="w-full space-y-3">

        <!-- Agent hero + score -->
        <div class="flex items-center gap-4">
          <div
            class="relative w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 transition-all"
            :class="agentImageUrl ? '' : 'bg-green-500/10 border border-green-500/20'"
            :style="agentImageUrl ? { border: `2px solid ${agentAccentColor}60`, background: agentAccentColor + '20', boxShadow: `0 0 20px ${agentAccentColor}30` } : {}"
          >
            <img v-if="agentImageUrl" :src="agentImageUrl" class="w-full h-full object-cover object-top" />
            <svg v-else class="w-8 h-8 text-green-400 absolute inset-0 m-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Analysis ready</span>
              <span
                v-if="result?.overall_score"
                class="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                :class="scoreGradeBadgeClass(result.overall_score)"
              >{{ scoreGrade(result.overall_score) }}</span>
            </div>
            <p class="text-sm font-bold text-white leading-tight">
              {{ gameInfo.agent || gameLabel }}<span v-if="gameInfo.map" class="text-gray-500 font-normal"> · {{ gameInfo.map }}</span>
            </p>
          </div>
          <div v-if="result?.overall_score" class="text-right flex-shrink-0">
            <span class="text-3xl font-black tabular-nums" :class="scoreClass(result.overall_score)">{{ result.overall_score }}</span>
            <span class="text-xs text-gray-600 font-normal">/100</span>
          </div>
        </div>

        <!-- Score bar -->
        <div v-if="result?.overall_score" class="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-1000"
            :class="scoreBarClass(result.overall_score)"
            :style="{ width: `${result.overall_score}%` }"
          />
        </div>

        <!-- Improvements list -->
        <div v-if="improvements.length" class="space-y-1.5">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Focus on</p>
          <div
            v-for="(imp, i) in improvements"
            :key="i"
            class="flex items-start gap-2 px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl"
          >
            <span class="text-[10px] font-bold w-4 flex-shrink-0 mt-0.5" :class="i === 0 ? 'text-red-400' : 'text-gray-600'">{{ i + 1 }}</span>
            <p class="text-[11px] text-gray-300 leading-relaxed">{{ imp }}</p>
          </div>
        </div>
        <!-- Fallback: top issue only -->
        <div v-else-if="topIssue" class="flex items-start gap-2 px-3 py-2 bg-red-500/[0.07] border border-red-500/15 rounded-xl">
          <svg class="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <p class="text-[11px] text-gray-300 leading-relaxed">{{ topIssue }}</p>
        </div>

        <div class="flex gap-2 pt-1">
          <button
            class="flex-1 py-2.5 text-xs font-bold rounded-xl transition-all shadow-lg"
            :style="{ background: `linear-gradient(135deg, ${agentAccentColor || '#dc2626'}, ${agentAccentColor ? agentAccentColor + 'cc' : '#ea580c'})`, boxShadow: `0 4px 14px ${agentAccentColor || '#dc2626'}40` }"
            @click="viewFullAnalysis"
          >View Full Analysis →</button>
          <button
            class="px-3 py-2.5 text-[11px] text-gray-500 hover:text-gray-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-xl transition-colors"
            @click="dismiss"
          >Dismiss</button>
        </div>

        <!-- Session clips row -->
        <button
          v-if="sessionClipCount > 0"
          class="w-full flex items-center gap-2 px-3 py-2 bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] rounded-xl transition-colors text-left"
          @click="openClips"
        >
          <svg class="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
          </svg>
          <span class="text-[11px] text-gray-400 flex-1">
            <span class="text-white font-semibold">{{ sessionClipCount }} clip{{ sessionClipCount !== 1 ? 's' : '' }}</span> saved from this match
          </span>
          <svg class="w-3 h-3 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>

      <!-- Pending (auto-analyse off) -->
      <div v-else-if="state === 'pending'" class="w-full space-y-3 text-center">
        <div
          class="w-11 h-11 mx-auto rounded-full overflow-hidden flex items-center justify-center transition-all"
          :class="agentImageUrl ? '' : 'bg-blue-500/10 border border-blue-500/20'"
          :style="agentImageUrl ? { border: `1px solid ${agentAccentColor}50`, background: agentAccentColor + '20' } : {}"
        >
          <img v-if="agentImageUrl" :src="agentImageUrl" class="w-9 h-9 object-contain" />
          <svg v-else class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold">Game recorded</p>
          <p class="text-[11px] text-gray-500 mt-0.5">
            {{ gameInfo.agent || gameLabel }}<span v-if="gameInfo.map"> &middot; {{ gameInfo.map }}</span>
          </p>
          <p class="text-[10px] text-gray-600 mt-1.5">Auto-analyse is off — analyse now or view later from the dashboard.</p>
        </div>
        <div class="flex gap-2 pt-1">
          <button
            :disabled="analysing"
            class="flex-1 py-2 text-xs font-semibold bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 disabled:opacity-50 text-white rounded-lg transition-all shadow-sm shadow-red-500/20"
            @click="analyseNow"
          >{{ analysing ? 'Starting...' : 'Analyse Now' }}</button>
          <button
            class="px-3 py-2 text-[11px] text-gray-500 hover:text-gray-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg transition-colors"
            @click="dismissPending"
          >Later</button>
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="state === 'error'" class="w-full space-y-3 text-center">
        <div class="w-11 h-11 mx-auto rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold text-red-400">Upload failed</p>
          <p class="text-[11px] text-gray-500 mt-1">{{ errorMessage }}</p>
        </div>
        <div class="flex gap-2 pt-1">
          <button
            :disabled="!pendingRecordingId"
            class="flex-1 py-2 text-xs font-semibold bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white rounded-lg transition-all shadow-sm shadow-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            @click="retryUpload"
          >Retry</button>
          <button class="px-3 py-2 text-[11px] text-gray-500 hover:text-gray-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg transition-colors" @click="dismiss">Dismiss</button>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getAgentImage, getAgentColor } from '../lib/valorant'

type State = 'uploading' | 'analysing' | 'ready' | 'error' | 'pending'

const COACHING_TIPS = [
  'Players who review their gameplay weekly improve 2x faster than those who don\'t.',
  'Crosshair placement accounts for up to 40% of your ability to win gunfights.',
  'Economy management separates Gold from Diamond more than aim does.',
  'The #1 mistake at every rank: pushing aggressively without information.',
  'Positioning decisions happen before the fight starts — map awareness wins rounds.',
  'Pro players spend more time watching replays than playing ranked.',
  'A consistent warm-up routine can reduce your reaction time by 15–20ms.',
]

const state = ref<State>('uploading')
const uploadProgress = ref(0)
const gameInfo = ref<{ game: string; map: string | null; agent: string | null }>({ game: 'valorant', map: null, agent: null })
const result = ref<{ overall_score: number; analysis_id: number } | null>(null)
const errorMessage = ref('')
const pendingRecordingId = ref<string | null>(null)
const analysing = ref(false)
const analysisStuck = ref(false)
const tipIndex = ref(Math.floor(Math.random() * COACHING_TIPS.length))
const sessionClipCount = ref(0)
let sessionStart = 0
let stuckTimer: ReturnType<typeof setTimeout> | null = null
let tipTimer: ReturnType<typeof setInterval> | null = null

const currentTip = computed(() => COACHING_TIPS[tipIndex.value])

function startStuckTimer() {
  if (stuckTimer) clearTimeout(stuckTimer)
  stuckTimer = setTimeout(() => { analysisStuck.value = true }, 5 * 60 * 1000)
  tipTimer = setInterval(() => {
    tipIndex.value = (tipIndex.value + 1) % COACHING_TIPS.length
  }, 15000)
}

function clearStuckTimer() {
  if (stuckTimer) { clearTimeout(stuckTimer); stuckTimer = null }
  if (tipTimer) { clearInterval(tipTimer); tipTimer = null }
  analysisStuck.value = false
}

const gameLabel = computed(() => gameInfo.value.game === 'cs2' ? 'CS2' : 'Valorant')

const topIssue = computed(() => {
  if (!result.value) return null
  return (result.value as Record<string, unknown>).top_issue as string | null
})

const improvements = computed<string[]>(() => {
  if (!result.value) return []
  const raw = (result.value as Record<string, unknown>).priority_improvements
  if (Array.isArray(raw)) return (raw as string[]).slice(0, 3)
  return []
})

function scoreGrade(score: number): string {
  if (score >= 90) return 'S'
  if (score >= 75) return 'A'
  if (score >= 60) return 'B'
  if (score >= 45) return 'C'
  return 'D'
}

function scoreGradeBadgeClass(score: number): string {
  if (score >= 90) return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
  if (score >= 75) return 'bg-green-500/20 text-green-300 border border-green-500/30'
  if (score >= 60) return 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
  if (score >= 45) return 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
  return 'bg-red-500/20 text-red-300 border border-red-500/30'
}

const agentImageUrl = computed(() => gameInfo.value.agent ? getAgentImage(gameInfo.value.agent) : '')
const agentAccentColor = computed(() => gameInfo.value.agent ? getAgentColor(gameInfo.value.agent) : '')
const glowBgStyle = computed(() => {
  if (agentAccentColor.value) {
    return { background: `radial-gradient(ellipse, ${agentAccentColor.value}25 0%, transparent 70%)` }
  }
  const fallbacks: Record<string, string> = {
    ready: 'rgba(34,197,94,0.10)',
    pending: 'rgba(59,130,246,0.10)',
    error: 'rgba(239,68,68,0.10)',
    uploading: 'rgba(239,68,68,0.07)',
    analysing: 'rgba(239,68,68,0.07)',
  }
  return { background: fallbacks[state.value] ?? 'transparent' }
})

onMounted(() => {
  const ipcCleanup: (() => void)[] = []
  ipcCleanup.push(window.api.on('post-game:upload-start', (...args: unknown[]) => {
    const data = args[0] as { game: string; map: string | null; agent: string | null }
    gameInfo.value = { game: data.game, map: data.map, agent: data.agent }
  }))
  ipcCleanup.push(window.api.on('post-game:upload-progress', (...args: unknown[]) => { uploadProgress.value = args[0] as number }))
  ipcCleanup.push(window.api.on('post-game:upload-complete', () => { state.value = 'analysing'; startStuckTimer() }))
  ipcCleanup.push(window.api.on('post-game:analysis-ready', (...args: unknown[]) => {
    clearStuckTimer()
    const r = args[0] as { overall_score: number; analysis_id: number; session_start?: number }
    result.value = r
    sessionStart = r.session_start ?? (Date.now() - 2 * 60 * 60 * 1000)
    state.value = 'ready'
    loadSessionClips()
  }))
  ipcCleanup.push(window.api.on('post-game:pending', (...args: unknown[]) => {
    const data = args[0] as { recordingId: string; game: string; map: string | null; agent: string | null }
    pendingRecordingId.value = data.recordingId
    gameInfo.value = { game: data.game, map: data.map, agent: data.agent }
    state.value = 'pending'
  }))
  ipcCleanup.push(window.api.on('post-game:upload-error', (...args: unknown[]) => {
    const payload = args[0] as string | { message: string; recordingId?: string }
    if (typeof payload === 'string') {
      errorMessage.value = payload
    } else {
      errorMessage.value = payload.message
      if (payload.recordingId) pendingRecordingId.value = payload.recordingId
    }
    state.value = 'error'
  }))
  ;(window as Window & { _postGameIpcCleanup?: (() => void)[] })._postGameIpcCleanup = ipcCleanup

  // Dev preview: show a mock ready state
  if (window.location.hash.includes('post-game-preview')) {
    setTimeout(() => {
      gameInfo.value = { game: 'valorant', map: 'Bind', agent: 'Jett' }
      state.value = 'uploading'
      let p = 0
      const iv = setInterval(() => {
        p += 12
        uploadProgress.value = Math.min(p, 100)
        if (p >= 100) { clearInterval(iv); setTimeout(() => { state.value = 'analysing' }, 600) }
      }, 200)
      setTimeout(() => {
        result.value = { overall_score: 72, analysis_id: 999 }
        ;(result.value as Record<string, unknown>).top_issue = 'Positioning during post-plant — you were caught in the open on 4 of 6 clutch attempts.'
        state.value = 'ready'
      }, 5000)
    }, 300)
  }
})

onUnmounted(() => {
  clearStuckTimer()
  const cleanup = (window as Window & { _postGameIpcCleanup?: (() => void)[] })._postGameIpcCleanup
  cleanup?.forEach(fn => fn())
  delete (window as Window & { _postGameIpcCleanup?: (() => void)[] })._postGameIpcCleanup
})

async function analyseNow() {
  if (!pendingRecordingId.value || analysing.value) return
  analysing.value = true
  try {
    await window.api.recordings.analyse(pendingRecordingId.value)
    // The analysis events (upload-start, progress, etc.) will be received via IPC
  } catch {
    state.value = 'error'
    errorMessage.value = 'Could not start analysis. Please try from the dashboard.'
  } finally {
    analysing.value = false
  }
}

async function dismissPending() {
  if (pendingRecordingId.value) {
    // Don't remove from store — user can still analyse later from the dashboard
  }
  window.close()
}

function retryUpload() {
  // Reset to uploading state — the main process will re-emit the upload events
  // if there's still a pending recording; otherwise prompt the user to use the dashboard
  if (pendingRecordingId.value) {
    state.value = 'uploading'
    uploadProgress.value = 0
    window.api.recordings.analyse(pendingRecordingId.value).catch(() => {
      state.value = 'error'
      errorMessage.value = 'Retry failed. Try analysing from the dashboard.'
    })
  } else {
    errorMessage.value = 'Recording no longer available. Open the dashboard to retry.'
  }
}

async function loadSessionClips() {
  try {
    const clips = await window.api.clips.get()
    sessionClipCount.value = clips.filter((c) => c.savedAt >= sessionStart).length
  } catch {
    sessionClipCount.value = 0
  }
}

async function openClips() {
  await window.api.app.showClips().catch(() => {})
  window.close()
}

function viewFullAnalysis() {
  if (result.value?.analysis_id) {
    window.open(`https://upforge.gg/valorant/results/${result.value.analysis_id}`, '_blank')
  }
  dismiss()
}

function dismiss() { window.close() }

function scoreClass(score: number): string {
  return score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'
}
function scoreBarClass(score: number): string {
  return score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
}
</script>
