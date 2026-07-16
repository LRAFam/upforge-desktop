<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDashboard } from '../../composables/useDashboard'
import { getAgentImage } from '../../lib/valorant'

const { weeklyFocus, isValorant, lastInsight, router } = useDashboard()
const launchBusy = ref(false)

const focusTitle = computed(() => weeklyFocus.value?.metric.label ?? 'Your focus')
const focusHint = computed(() => weeklyFocus.value?.metric.hint ?? '')

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
  <div v-if="isValorant && weeklyFocus" class="dash-hero relative overflow-hidden rounded-2xl flex-shrink-0 min-h-[168px] h-full flex flex-col">
    <!-- Layered adaptive background: aurora glows drift behind a fixed text scrim -->
    <div class="dash-hero-aurora dash-hero-aurora--a absolute pointer-events-none" />
    <div class="dash-hero-aurora dash-hero-aurora--b absolute pointer-events-none" />
    <div class="dash-hero-grid absolute inset-0 pointer-events-none" />
    <div class="dash-hero-scrim absolute inset-0 pointer-events-none" />

    <div class="absolute inset-y-0 right-0 w-[40%] pointer-events-none">
      <img
        v-if="heroAgentImg"
        :src="heroAgentImg"
        alt=""
        class="dash-hero-agent absolute bottom-0 right-1 w-[min(150px,80%)] max-h-[106%] object-contain object-bottom"
      />
    </div>

    <div class="relative z-10 flex flex-1 flex-col justify-between gap-3 p-4 pr-[38%]">
      <div class="min-w-0 space-y-2">
        <p class="text-[9px] font-bold uppercase tracking-[0.2em] text-red-400/90">Coach briefing</p>
        <h2 class="text-[15px] font-black text-white leading-snug tracking-tight">
          Build smarter comps.
          <span class="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">Win more rounds.</span>
        </h2>
        <p class="text-[11px] text-gray-500 leading-relaxed line-clamp-2">
          {{ weeklyFocus.goal }}
        </p>
      </div>

      <div class="panel-inset px-3 py-2.5">
        <div class="flex items-start gap-2.5 min-w-0">
          <span class="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-red-500/12 text-red-400">
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/></svg>
          </span>
          <div class="min-w-0">
            <p class="text-[9px] font-bold uppercase tracking-[0.12em] text-gray-500">Key focus · {{ focusTitle }}</p>
            <p class="text-[12px] font-semibold text-gray-200 mt-0.5 leading-snug">{{ focusHint }}</p>
            <p v-if="weeklyFocus.recurrence" class="text-[10px] text-amber-400/85 mt-1 font-medium">{{ weeklyFocus.recurrence }}</p>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="btn-primary !py-2 !px-4 !text-[11px]"
          :disabled="launchBusy"
          @click="runDrill"
        >
          {{ launchBusy ? 'Launching…' : `Run ${weeklyFocus.drill.label}` }}
        </button>
        <button type="button" class="btn-secondary !py-2 !px-3.5 !text-[11px]" @click="router.push('/training')">
          Training hub
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dash-hero {
  background: #0b0b0d;
  border: 1px solid rgba(255, 70, 85, 0.16);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.04) inset,
    0 12px 36px rgba(0, 0, 0, 0.28),
    0 0 48px rgba(255, 70, 85, 0.05);
}

/* Soft colour fields that drift slowly — blurred so they never fight the text */
.dash-hero-aurora {
  width: 55%;
  height: 160%;
  border-radius: 9999px;
  filter: blur(48px);
  opacity: 0.55;
  will-change: transform;
}
.dash-hero-aurora--a {
  top: -60%;
  right: -12%;
  background: radial-gradient(closest-side, rgba(255, 70, 85, 0.34), transparent 72%);
  animation: hero-drift-a 14s ease-in-out infinite alternate;
}
.dash-hero-aurora--b {
  bottom: -70%;
  right: 14%;
  background: radial-gradient(closest-side, rgba(249, 115, 22, 0.22), transparent 72%);
  animation: hero-drift-b 18s ease-in-out infinite alternate;
}
@keyframes hero-drift-a {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(-9%, 14%, 0) scale(1.12); }
}
@keyframes hero-drift-b {
  from { transform: translate3d(0, 0, 0) scale(1.08); }
  to { transform: translate3d(11%, -12%, 0) scale(0.96); }
}
@media (prefers-reduced-motion: reduce) {
  .dash-hero-aurora--a,
  .dash-hero-aurora--b {
    animation: none;
  }
}

/* Fine tactical grid, fading out toward the text side */
.dash-hero-grid {
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px);
  background-size: 26px 26px;
  mask-image: linear-gradient(100deg, transparent 0%, rgba(0, 0, 0, 0.5) 45%, #000 100%);
}

/* Fixed legibility layer: text side stays near-solid no matter what moves behind it */
.dash-hero-scrim {
  background: linear-gradient(
    97deg,
    rgba(11, 11, 13, 0.97) 0%,
    rgba(11, 11, 13, 0.92) 42%,
    rgba(11, 11, 13, 0.55) 68%,
    rgba(11, 11, 13, 0.12) 100%
  );
}

/* Agent render fades into the card instead of sitting on a hard edge */
.dash-hero-agent {
  opacity: 0.92;
  filter: drop-shadow(0 0 26px rgba(255, 70, 85, 0.2));
  mask-image: linear-gradient(90deg, transparent 0%, #000 22%);
}
</style>
