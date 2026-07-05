<script setup lang="ts">
import { ref } from 'vue'
import { useDashboard } from '../../composables/useDashboard'
import { getAgentImage, getAgentColor } from '../../lib/valorant'
import { scoreGrade, scoreGradeBadgeClass } from '../../lib/analysis-scoring'

const {
  isValorant,
  weeklyFocus,
  lastInsight,
  sessionReview,
  lastInsightTraining,
  emptyCoachingTitle,
  emptyCoachingMessage,
  openEmptyCoachingAction,
  openAnalysis,
  trainLastInsight,
  router,
} = useDashboard()

const launchBusy = ref(false)

async function startWeeklyDrill() {
  const plan = weeklyFocus.value
  if (!plan || launchBusy.value) return
  launchBusy.value = true
  try {
    await window.api.trainer.launch({
      scenario: plan.drill.scenario,
      difficulty: 'medium',
      duration: 60,
    })
  } catch {
    router.push('/training')
  } finally {
    launchBusy.value = false
  }
}
</script>

<template>
  <!-- Weekly focus (Valorant) -->
  <div v-if="isValorant && weeklyFocus" class="panel-elevated overflow-hidden flex-shrink-0">
    <div class="px-3.5 py-3 space-y-2.5">
      <div class="flex items-center justify-between gap-2">
        <p class="text-[9px] font-bold uppercase tracking-widest text-orange-400">This week</p>
        <span v-if="weeklyFocus.recurrence" class="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-200">
          {{ weeklyFocus.recurrence }}
        </span>
      </div>
      <p class="text-xs font-semibold text-white leading-snug">{{ weeklyFocus.goal }}</p>
      <p class="text-[11px] text-gray-500">
        Drill: <span class="text-gray-300">{{ weeklyFocus.drill.label }}</span>
        · {{ weeklyFocus.metric.label }}
      </p>
      <button
        type="button"
        class="w-full py-2 rounded-lg text-[11px] font-bold text-white bg-gradient-to-r from-orange-600 to-red-600 hover:opacity-90 disabled:opacity-50"
        :disabled="launchBusy"
        @click="startWeeklyDrill"
      >
        {{ launchBusy ? 'Launching…' : 'Run aim drill' }}
      </button>
    </div>
  </div>

  <!-- Last coaching insight -->
  <div v-else-if="isValorant && lastInsight" class="panel-elevated overflow-hidden flex-shrink-0 relative">
    <div class="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#ff4655] to-orange-600" />
    <div class="pl-3.5 pr-3 py-3 space-y-2">
      <p class="text-[9px] font-bold uppercase tracking-widest text-gray-600">Latest coaching</p>
      <div class="flex items-center gap-2">
        <div
          class="w-8 h-8 rounded-lg flex-shrink-0 overflow-hidden"
          :style="lastInsight.agent ? { backgroundColor: getAgentColor(lastInsight.agent) + '22' } : undefined"
        >
          <img v-if="lastInsight.agent && getAgentImage(lastInsight.agent)" :src="getAgentImage(lastInsight.agent)" class="w-full h-full object-cover object-top" alt="" />
        </div>
        <div class="flex items-baseline gap-1.5">
          <span class="text-xl font-black tabular-nums" :class="lastInsight.score >= 78 ? 'text-green-400' : lastInsight.score >= 50 ? 'text-yellow-400' : 'text-red-400'">{{ lastInsight.score * 10 }}</span>
          <span class="text-[9px] font-black px-1 py-px rounded-full" :class="scoreGradeBadgeClass(lastInsight.score)">{{ scoreGrade(lastInsight.score) }}</span>
        </div>
        <button v-if="lastInsight.analysisId" class="ml-auto text-[10px] text-gray-600 hover:text-gray-300" @click="openAnalysis(lastInsight.analysisId!)">View →</button>
      </div>
      <p class="text-[11px] text-gray-400 leading-snug line-clamp-3">{{ lastInsight.text }}</p>
      <button
        :disabled="lastInsightTraining"
        class="w-full py-2 text-[11px] font-bold rounded-lg text-white bg-red-600 hover:bg-red-500 disabled:opacity-50"
        @click="trainLastInsight"
      >
        {{ lastInsightTraining ? 'Launching…' : 'Train this weakness' }}
      </button>
    </div>
  </div>

  <!-- Session snapshot -->
  <div v-else-if="isValorant && sessionReview" class="panel-elevated overflow-hidden flex-shrink-0">
    <div class="px-3.5 py-3 space-y-2">
      <p class="text-[9px] font-bold uppercase tracking-widest text-gray-600">Recent session</p>
      <div class="flex items-center justify-between">
        <span class="text-xs text-gray-500">{{ sessionReview.wins }}W · {{ sessionReview.losses }}L</span>
        <div v-if="sessionReview.avgScore != null" class="flex items-baseline gap-1">
          <span class="text-lg font-black tabular-nums">{{ Math.round(sessionReview.avgScore * 10) }}</span>
          <span class="text-[9px] font-black px-1 py-px rounded-full" :class="scoreGradeBadgeClass(sessionReview.avgScore)">{{ sessionReview.grade }}</span>
        </div>
      </div>
      <div class="flex gap-1">
        <span
          v-for="(won, i) in sessionReview.wl"
          :key="i"
          class="h-1.5 flex-1 rounded-full"
          :class="won === true ? 'bg-emerald-500/70' : won === false ? 'bg-red-500/50' : 'bg-white/10'"
        />
      </div>
      <p v-if="sessionReview.fixThisWeek" class="text-[11px] text-gray-400 leading-snug line-clamp-2">{{ sessionReview.fixThisWeek }}</p>
    </div>
  </div>

  <!-- Empty state -->
  <div v-else class="panel-elevated overflow-hidden flex-shrink-0">
    <div class="px-3.5 py-3">
      <p class="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-1">Coaching</p>
      <p class="text-xs font-semibold text-gray-400">{{ emptyCoachingTitle }}</p>
      <p class="text-[11px] text-gray-600 mt-1 leading-snug">{{ emptyCoachingMessage }}</p>
      <button class="mt-2.5 text-[11px] font-semibold text-red-400 hover:text-red-300" @click="openEmptyCoachingAction">
        {{ emptyCoachingAction }} →
      </button>
    </div>
  </div>
</template>
