<template>
  <div class="flex flex-col h-full bg-[#0c0c0c] relative overflow-hidden">
    <!-- Subtle glow bg -->
    <div class="absolute inset-0 pointer-events-none">
      <div
        :class="['absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 rounded-full blur-3xl transition-all duration-700 opacity-60',
          state === 'ready' ? 'bg-green-500/10' : state === 'error' ? 'bg-red-500/10' : 'bg-red-500/[0.07]']"
      />
    </div>

    <div class="flex-1 flex flex-col items-center justify-center px-5 py-4 relative z-10">

      <!-- Uploading -->
      <div v-if="state === 'uploading'" class="w-full space-y-4 text-center">
        <div class="w-11 h-11 mx-auto rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold">Uploading replay</p>
          <p class="text-[11px] text-gray-500 mt-0.5">
            {{ gameInfo.agent || 'Valorant' }}<span v-if="gameInfo.map"> &middot; {{ gameInfo.map }}</span>
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
        <div class="w-11 h-11 mx-auto rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
          <svg class="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold">Analysing gameplay</p>
          <p class="text-[11px] text-gray-500 mt-0.5">AI is reviewing your session &middot; ~3 min</p>
        </div>
        <div class="flex items-center justify-center gap-1.5">
          <span v-for="i in 3" :key="i" class="w-1.5 h-1.5 rounded-full bg-orange-500/60 animate-bounce" :style="{ animationDelay: `${(i - 1) * 0.18}s` }" />
        </div>
      </div>

      <!-- Ready -->
      <div v-else-if="state === 'ready'" class="w-full space-y-3">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0">
            <svg class="w-4.5 h-4.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
          </div>
          <div>
            <p class="text-sm font-semibold">Analysis ready</p>
            <p class="text-[11px] text-gray-500">
              {{ gameInfo.agent || 'Valorant' }}<span v-if="gameInfo.map"> &middot; {{ gameInfo.map }}</span>
            </p>
          </div>
        </div>

        <!-- Score bar -->
        <div v-if="result?.overall_score" class="px-3 py-2.5 bg-white/[0.02] border border-white/[0.06] rounded-xl">
          <div class="flex items-baseline justify-between mb-1.5">
            <span class="text-[10px] text-gray-500 uppercase tracking-wider">Overall Score</span>
            <span class="text-xl font-bold tabular-nums" :class="scoreClass(result.overall_score)">
              {{ result.overall_score }}<span class="text-xs text-gray-600 font-normal">/100</span>
            </span>
          </div>
          <div class="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-1000" :class="scoreBarClass(result.overall_score)" :style="{ width: `${result.overall_score}%` }" />
          </div>
        </div>

        <!-- Top issue -->
        <div v-if="topIssue" class="flex items-start gap-2 px-3 py-2 bg-red-500/[0.07] border border-red-500/15 rounded-xl">
          <svg class="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <p class="text-[11px] text-gray-300 leading-relaxed">{{ topIssue }}</p>
        </div>

        <div class="flex gap-2 pt-1">
          <button
            class="flex-1 py-2 text-xs font-semibold bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white rounded-lg transition-all shadow-sm shadow-red-500/20"
            @click="viewFullAnalysis"
          >View Full Analysis</button>
          <button
            class="px-3 py-2 text-[11px] text-gray-500 hover:text-gray-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg transition-colors"
            @click="dismiss"
          >Dismiss</button>
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
        <button class="text-[11px] text-gray-500 hover:text-gray-300 underline transition-colors" @click="dismiss">Dismiss</button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

type State = 'uploading' | 'analysing' | 'ready' | 'error'

const state = ref<State>('uploading')
const uploadProgress = ref(0)
const gameInfo = ref<{ map: string | null; agent: string | null }>({ map: null, agent: null })
const result = ref<{ overall_score: number; analysis_id: number } | null>(null)
const errorMessage = ref('')

const topIssue = computed(() => {
  if (!result.value) return null
  return (result.value as Record<string, unknown>).top_issue as string | null
})

onMounted(() => {
  window.api.on('post-game:upload-start', (data: { game: string; map: string | null; agent: string | null }) => {
    gameInfo.value = { map: data.map, agent: data.agent }
    state.value = 'uploading'
  })
  window.api.on('post-game:upload-progress', (pct: number) => { uploadProgress.value = pct })
  window.api.on('post-game:upload-complete', () => { state.value = 'analysing' })
  window.api.on('post-game:analysis-ready', (r: { overall_score: number; analysis_id: number }) => {
    result.value = r
    state.value = 'ready'
  })
  window.api.on('post-game:upload-error', (err: string) => {
    errorMessage.value = err
    state.value = 'error'
  })

  // Dev preview: show a mock ready state
  if (window.location.hash.includes('post-game-preview')) {
    setTimeout(() => {
      gameInfo.value = { map: 'Bind', agent: 'Jett' }
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

function viewFullAnalysis() {
  if (result.value?.analysis_id) {
    window.open(`https://upforge.gg/results/${result.value.analysis_id}`, '_blank')
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
