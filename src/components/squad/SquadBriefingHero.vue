<script setup lang="ts">
defineProps<{
  headline: string
  subline: string
  recordingCount: number
  weekActivityCount: number
  weekWins: number
  weekLosses: number
}>()

const hasRecord = (w: number, l: number) => w + l > 0
</script>

<template>
  <div class="dash-panel relative overflow-hidden p-4">
    <div class="absolute -right-10 top-0 h-32 w-32 rounded-full bg-red-500/10 blur-3xl pointer-events-none" />
    <div class="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/90 to-transparent pointer-events-none" />
    <div class="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <p class="text-[10px] font-black uppercase tracking-[0.22em] text-red-400/90">Squad briefing</p>
        <h2 class="text-base font-black text-white mt-1 leading-snug">{{ headline }}</h2>
        <p class="text-[11px] text-gray-500 mt-1">{{ subline }}</p>
        <p v-if="hasRecord(weekWins, weekLosses)" class="text-[12px] font-bold mt-2 tabular-nums">
          <span class="text-emerald-400">{{ weekWins }}W</span>
          <span class="text-gray-600 mx-1">–</span>
          <span class="text-red-400">{{ weekLosses }}L</span>
          <span class="text-gray-600 font-normal ml-1.5">this week</span>
        </p>
      </div>
      <div class="flex gap-2 flex-shrink-0 flex-wrap">
        <div class="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2 text-center min-w-[72px]">
          <p class="text-lg font-black tabular-nums" :class="recordingCount > 0 ? 'text-red-400' : 'text-gray-600'">{{ recordingCount }}</p>
          <p class="text-[9px] font-bold uppercase tracking-wide text-gray-600">Recording</p>
        </div>
        <div class="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2 text-center min-w-[72px]">
          <p class="text-lg font-black tabular-nums text-white">{{ weekActivityCount }}</p>
          <p class="text-[9px] font-bold uppercase tracking-wide text-gray-600">This week</p>
        </div>
        <div v-if="hasRecord(weekWins, weekLosses)" class="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2 text-center min-w-[72px]">
          <p class="text-lg font-black tabular-nums text-white">{{ Math.round((weekWins / (weekWins + weekLosses)) * 100) }}%</p>
          <p class="text-[9px] font-bold uppercase tracking-wide text-gray-600">Win rate</p>
        </div>
      </div>
    </div>
  </div>
</template>
