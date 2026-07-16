<script setup lang="ts">
import { computed, ref } from 'vue'
import heroAgents from '../../assets/hero-agents.webp'
import { useDashboard } from '../../composables/useDashboard'
import { getAgentImage } from '../../lib/valorant'

const { weeklyFocus, isValorant, lastInsight, router } = useDashboard()
const launchBusy = ref(false)

const focusTitle = computed(() => {
  const goal = weeklyFocus.value?.goal ?? ''
  const words = goal.split(/\s+/).slice(0, 3).join(' ')
  if (!words) return 'Your focus'
  return words.charAt(0).toUpperCase() + words.slice(1)
})

const heroAgent = computed(() => lastInsight.value?.agent ?? 'Omen')
const heroAgentImg = computed(() => getAgentImage(heroAgent.value))

async function runDrill() {
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
  <div v-if="isValorant && weeklyFocus" class="dash-hero relative overflow-hidden rounded-2xl flex-shrink-0 min-h-[168px] h-full">
    <div class="dash-hero-pattern absolute inset-0" />
    <div class="absolute inset-0 bg-gradient-to-r from-[#0d0d0f] via-[#0d0d0f]/92 to-transparent" />
    <div class="absolute inset-y-0 right-0 w-[55%] opacity-90 pointer-events-none">
      <img :src="heroAgents" alt="" class="absolute inset-0 w-full h-full object-cover object-right-top mix-blend-lighten opacity-80" />
      <img
        v-if="heroAgentImg"
        :src="heroAgentImg"
        alt=""
        class="absolute bottom-0 right-2 w-[min(220px,42%)] max-h-[105%] object-contain object-bottom drop-shadow-[0_0_40px_rgba(255,70,85,0.25)]"
      />
    </div>

    <div class="relative z-10 px-5 py-5 max-w-[62%] flex flex-col gap-3">
      <p class="text-[10px] font-black uppercase tracking-[0.22em] text-red-400">Coach briefing</p>
      <h2 class="text-[1.35rem] sm:text-2xl font-black text-white leading-[1.15] tracking-tight">
        Build smarter comps.<br />
        <span class="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">Win more rounds.</span>
      </h2>
      <p class="text-[12px] text-gray-400 leading-relaxed max-w-md hidden sm:block">
        {{ weeklyFocus.goal }}
      </p>

      <div class="rounded-xl border border-white/[0.10] bg-black/35 backdrop-blur-sm px-3.5 py-3 max-w-sm">
        <div class="flex items-start gap-2.5">
          <span class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-400">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/></svg>
          </span>
          <div class="min-w-0">
            <p class="text-[10px] font-bold uppercase tracking-wide text-gray-500">Key focus</p>
            <p class="text-sm font-bold text-red-300 mt-0.5">{{ focusTitle }}</p>
            <p class="text-[11px] text-gray-400 mt-1 leading-snug">{{ weeklyFocus.metric.hint }}</p>
            <p v-if="weeklyFocus.recurrence" class="text-[10px] text-amber-400/90 mt-1.5 font-semibold">{{ weeklyFocus.recurrence }}</p>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          type="button"
          class="btn-primary btn-primary--lg !py-2.5 !px-5"
          :disabled="launchBusy"
          @click="runDrill"
        >
          {{ launchBusy ? 'Launching…' : `Run ${weeklyFocus.drill.label}` }}
        </button>
        <button type="button" class="btn-secondary !py-2.5" @click="router.push('/training')">Training hub</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dash-hero {
  border: 1px solid rgba(255, 70, 85, 0.18);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.04) inset,
    0 20px 50px rgba(0, 0, 0, 0.35),
    0 0 80px rgba(255, 70, 85, 0.06);
}
.dash-hero-pattern {
  background:
    linear-gradient(135deg, rgba(255, 70, 85, 0.12) 0%, transparent 42%),
    repeating-linear-gradient(
      -35deg,
      transparent,
      transparent 18px,
      rgba(255, 70, 85, 0.04) 18px,
      rgba(255, 70, 85, 0.04) 19px
    );
}
</style>
