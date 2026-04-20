<template>
  <div class="flex flex-col items-center justify-center h-full px-6 py-6">
    <!-- Uploading state -->
    <div v-if="state === 'uploading'" class="w-full space-y-5 text-center">
      <div class="w-12 h-12 mx-auto bg-red-500/20 rounded-full flex items-center justify-center">
        <svg class="w-6 h-6 text-red-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
      <div>
        <p class="text-sm font-semibold">Uploading your game</p>
        <p class="text-xs text-gray-500 mt-1">
          {{ gameInfo.map || 'Unknown Map' }} &middot; {{ gameInfo.agent || 'Unknown Agent' }}
        </p>
      </div>
      <div class="w-full bg-white/[0.06] rounded-full h-1.5">
        <div
          class="bg-gradient-to-r from-red-500 to-orange-500 h-1.5 rounded-full transition-all duration-300"
          :style="{ width: `${uploadProgress}%` }"
        />
      </div>
      <p class="text-xs text-gray-500">{{ uploadProgress }}%</p>
    </div>

    <!-- Analysing state -->
    <div v-else-if="state === 'analysing'" class="w-full space-y-5 text-center">
      <div class="w-12 h-12 mx-auto bg-orange-500/20 rounded-full flex items-center justify-center">
        <svg class="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </div>
      <div>
        <p class="text-sm font-semibold">AI Coaching Analysis</p>
        <p class="text-xs text-gray-500 mt-1">Analysing your gameplay... ~3 mins</p>
      </div>
      <div class="flex items-center justify-center gap-1.5">
        <span v-for="i in 3" :key="i"
          class="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce"
          :style="{ animationDelay: `${i * 0.15}s` }" />
      </div>
    </div>

    <!-- Results ready state -->
    <div v-else-if="state === 'ready'" class="w-full space-y-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold">Analysis Ready</p>
          <p class="text-xs text-gray-500">{{ gameInfo.map }} &middot; {{ gameInfo.agent }}</p>
        </div>
      </div>

      <!-- Score -->
      <div v-if="result?.overall_score" class="px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs text-gray-400">Overall Score</span>
          <span
            class="text-lg font-bold"
            :class="scoreClass(result.overall_score)"
          >{{ result.overall_score }}/100</span>
        </div>
        <div class="w-full bg-white/[0.06] rounded-full h-1">
          <div
            class="h-1 rounded-full transition-all duration-700"
            :class="scoreBarClass(result.overall_score)"
            :style="{ width: `${result.overall_score}%` }"
          />
        </div>
      </div>

      <!-- Top issue -->
      <div v-if="topIssue" class="px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
        <p class="text-xs text-red-400 font-medium">Top Issue</p>
        <p class="text-xs text-gray-300 mt-0.5">{{ topIssue }}</p>
      </div>

      <div class="flex gap-2">
        <button
          class="flex-1 py-2 text-xs font-semibold bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white rounded-lg transition-colors"
          @click="viewFullAnalysis"
        >
          View Full Analysis
        </button>
        <button
          class="px-3 py-2 text-xs text-gray-400 hover:text-gray-300 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg transition-colors"
          @click="dismiss"
        >
          Dismiss
        </button>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="state === 'error'" class="w-full space-y-4 text-center">
      <p class="text-sm font-medium text-red-400">Upload Failed</p>
      <p class="text-xs text-gray-500">{{ errorMessage }}</p>
      <button
        class="text-xs text-gray-400 hover:text-gray-300 underline"
        @click="dismiss"
      >Dismiss</button>
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
  // Surface from result if available
  return (result.value as Record<string, unknown>).top_issue as string | null
})

onMounted(() => {
  window.api.on('post-game:upload-start', (data: { game: string; map: string | null; agent: string | null }) => {
    gameInfo.value = { map: data.map, agent: data.agent }
    state.value = 'uploading'
  })

  window.api.on('post-game:upload-progress', (pct: number) => {
    uploadProgress.value = pct
  })

  window.api.on('post-game:upload-complete', () => {
    state.value = 'analysing'
  })

  window.api.on('post-game:analysis-ready', (r: { overall_score: number; analysis_id: number }) => {
    result.value = r
    state.value = 'ready'
  })

  window.api.on('post-game:upload-error', (err: string) => {
    errorMessage.value = err
    state.value = 'error'
  })
})

function viewFullAnalysis() {
  if (result.value?.analysis_id) {
    window.open(`https://upforge.gg/results/${result.value.analysis_id}`, '_blank')
  }
  dismiss()
}

function dismiss() {
  window.close()
}

function scoreClass(score: number): string {
  if (score >= 80) return 'text-green-400'
  if (score >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

function scoreBarClass(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}
</script>
