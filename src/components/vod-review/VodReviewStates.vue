<script setup lang="ts">
import { useVodReview } from '../../composables/useVodReview'

const {
  loadTimeline,
  router,
  timelineError,
  timelineLoading,
} = useVodReview()
</script>

<template>
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
</template>
