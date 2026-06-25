<script setup lang="ts">
import { ref } from 'vue'
import { useDashboard } from '../../composables/useDashboard'

const { weeklyFocus, isValorant, router } = useDashboard()
const launchBusy = ref(false)

async function startDrill() {
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
  <div
    v-if="isValorant && weeklyFocus"
    class="panel-elevated overflow-hidden flex-shrink-0"
  >
    <div class="px-3.5 py-3 space-y-3">
      <div class="flex items-start justify-between gap-2">
        <div>
          <p class="text-[9px] font-bold uppercase tracking-widest text-orange-400">This week</p>
          <p class="text-[11px] text-gray-600">One goal · one drill · one metric</p>
        </div>
        <span
          v-if="weeklyFocus.recurrence"
          class="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-200"
        >
          {{ weeklyFocus.recurrence }}
        </span>
      </div>

      <div class="space-y-2">
        <div class="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
          <p class="text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-1">Goal</p>
          <p class="text-xs font-semibold text-white leading-snug">{{ weeklyFocus.goal }}</p>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-lg border border-orange-500/15 bg-orange-500/[0.05] px-3 py-2.5">
            <p class="text-[9px] font-bold uppercase tracking-wider text-orange-300/80 mb-1">Drill</p>
            <p class="text-[11px] font-semibold text-gray-200">{{ weeklyFocus.drill.label }}</p>
          </div>
          <div class="rounded-lg border border-blue-500/15 bg-blue-500/[0.05] px-3 py-2.5">
            <p class="text-[9px] font-bold uppercase tracking-wider text-blue-300/80 mb-1">Metric</p>
            <p class="text-[11px] font-semibold text-gray-200">{{ weeklyFocus.metric.label }}</p>
            <p class="text-[10px] text-gray-500 mt-0.5 leading-snug">{{ weeklyFocus.metric.hint }}</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="w-full py-2 rounded-xl text-[11px] font-bold text-white bg-gradient-to-r from-orange-600 to-red-600 hover:opacity-90 transition-opacity disabled:opacity-50"
        :disabled="launchBusy"
        @click="startDrill"
      >
        {{ launchBusy ? 'Launching…' : 'Run drill in Aim Trainer' }}
      </button>
    </div>
  </div>
</template>
