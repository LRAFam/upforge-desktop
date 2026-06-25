<script setup lang="ts">
import { computed } from 'vue'
import { useDashboard } from '../../composables/useDashboard'
import { scoreGrade, scoreGradeBadgeClass } from '../../lib/analysis-scoring'

const { sessionReview, isValorant } = useDashboard()

const trendLabel = computed(() => {
  const t = sessionReview.value?.trend
  if (t == null || Math.abs(t) < 0.5) return 'Steady'
  return t > 0 ? `↑ ${Math.round(t * 10)} pts` : `↓ ${Math.round(Math.abs(t) * 10)} pts`
})

const trendClass = computed(() => {
  const t = sessionReview.value?.trend
  if (t == null || Math.abs(t) < 0.5) return 'text-gray-400'
  return t > 0 ? 'text-emerald-400' : 'text-red-400'
})
</script>

<template>
  <div
    v-if="isValorant && sessionReview"
    class="panel-elevated overflow-hidden flex-shrink-0"
  >
    <div class="px-3.5 py-3 space-y-3">
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-[9px] font-bold uppercase tracking-widest text-gray-500">Session review</p>
          <p class="text-[11px] text-gray-600">Last {{ sessionReview.count }} analysed games</p>
        </div>
        <div v-if="sessionReview.avgScore != null" class="text-right">
          <div class="flex items-baseline justify-end gap-1.5">
            <span class="text-xl font-black tabular-nums text-white">{{ Math.round(sessionReview.avgScore * 10) }}</span>
            <span
              class="text-[9px] font-black px-1.5 py-0.5 rounded-full"
              :class="scoreGradeBadgeClass(sessionReview.avgScore)"
            >{{ sessionReview.grade }}</span>
          </div>
          <p class="text-[10px] font-semibold" :class="trendClass">{{ trendLabel }}</p>
        </div>
      </div>

      <div class="flex items-center gap-1">
        <span
          v-for="(won, i) in sessionReview.wl"
          :key="i"
          class="h-2 flex-1 rounded-full"
          :class="won === true ? 'bg-emerald-500/70' : won === false ? 'bg-red-500/50' : 'bg-white/10'"
          :title="won === true ? 'Win' : won === false ? 'Loss' : 'Unknown'"
        />
      </div>

      <div class="flex flex-wrap gap-2 text-[10px]">
        <span v-if="sessionReview.wins + sessionReview.losses > 0" class="text-gray-500">
          {{ sessionReview.wins }}W · {{ sessionReview.losses }}L
        </span>
        <span v-if="sessionReview.avgHs != null" class="text-gray-500">{{ sessionReview.avgHs }}% HS</span>
      </div>

      <div
        v-if="sessionReview.fixThisWeek"
        class="rounded-lg border border-violet-500/20 bg-violet-500/[0.06] px-3 py-2"
      >
        <p class="text-[9px] font-bold uppercase tracking-wider text-violet-300/80 mb-0.5">Fix this week</p>
        <p class="text-[11px] text-gray-300 leading-snug">{{ sessionReview.fixThisWeek }}</p>
      </div>
    </div>
  </div>
</template>
