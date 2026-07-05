<script setup lang="ts">
import { computed } from 'vue'
import { useDashboard } from '../../composables/useDashboard'
import { formatRelativeTime } from '../../lib/dashboard-match-row'
import { scoreGrade } from '../../lib/analysis-scoring'
import DashboardScoreGauge from './DashboardScoreGauge.vue'

const {
  isValorant,
  lastInsight,
  weeklyFocus,
  openAnalysis,
} = useDashboard()

const tags = computed(() => {
  const out: string[] = []
  if (weeklyFocus.value?.metric.label) out.push(weeklyFocus.value.metric.label)
  if (weeklyFocus.value?.drill.label) out.push(weeklyFocus.value.drill.label)
  if (out.length < 2) out.push('Decision Making')
  return out.slice(0, 3)
})

const headline = computed(() => {
  const text = lastInsight.value?.text ?? ''
  const first = text.split(/[.!?]/)[0]?.trim()
  if (first && first.length <= 48) return first
  if (first) return `${first.slice(0, 45)}…`
  return 'Mid-round decision making'
})
</script>

<template>
  <div v-if="isValorant && lastInsight" class="dash-panel overflow-hidden flex-shrink-0">
    <div class="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="flex h-6 w-6 items-center justify-center rounded-md bg-red-500/15 text-red-400">
          <svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7-6.3-4.6L5.7 21l2.3-7-6-4.6h7.6z"/></svg>
        </span>
        <span class="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Latest coaching</span>
      </div>
      <span v-if="lastInsight.date" class="text-[10px] text-gray-600">{{ formatRelativeTime(lastInsight.date) }}</span>
    </div>
    <div class="px-4 py-3.5 flex gap-4">
      <DashboardScoreGauge :score="lastInsight.score" :grade="scoreGrade(lastInsight.score)" />
      <div class="flex-1 min-w-0 flex flex-col gap-2">
        <h3 class="text-sm font-bold text-white leading-snug">{{ headline }}</h3>
        <p class="text-[12px] text-gray-400 leading-relaxed line-clamp-3">{{ lastInsight.text }}</p>
        <div class="flex flex-wrap gap-1.5 mt-auto">
          <span
            v-for="tag in tags"
            :key="tag"
            class="text-[9px] font-semibold px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-gray-400"
          >{{ tag }}</span>
        </div>
      </div>
    </div>
    <button
      v-if="lastInsight.analysisId"
      type="button"
      class="w-full py-2.5 text-[11px] font-bold text-red-400 border-t border-white/[0.07] hover:bg-red-500/[0.04] transition-colors"
      @click="openAnalysis(lastInsight.analysisId!)"
    >
      View full analysis →
    </button>
  </div>
</template>
