<script setup lang="ts">
import { useDashboard } from '../../composables/useDashboard'

const {
  isDev,
  platform,
  devOpen,
  simulating,
  simStatus,
  simulateGame,
} = useDashboard()
</script>

<template>
  <div v-if="isDev || (platform && platform !== 'win32')" class="border border-dashed border-yellow-500/20 rounded-xl overflow-hidden flex-shrink-0">
    <button class="w-full flex items-center justify-between px-3 py-2 text-xs text-yellow-600/60 hover:text-yellow-500/70 transition-colors" @click="devOpen = !devOpen">
      <span class="font-semibold uppercase tracking-wider">Dev Tools</span>
      <svg class="w-3 h-3 transition-transform" :class="devOpen ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
    </button>
    <div v-if="devOpen" class="px-3 pb-3 space-y-2">
      <div class="flex gap-2">
        <button class="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-yellow-500/[0.08] text-yellow-500/70 hover:bg-yellow-500/[0.14] transition-colors border border-yellow-500/10" :disabled="simulating" @click="simulateGame('valorant', 8000)">{{ simulating ? 'Simulating...' : 'Simulate Valorant (8s)' }}</button>
        <button class="px-2 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] text-gray-500 hover:bg-white/[0.07] transition-colors border border-white/[0.09]" @click="$router.push('/post-game-preview')">Post-game</button>
        <button class="px-2 py-1.5 rounded-lg text-xs font-medium bg-amber-500/[0.08] text-amber-400/80 hover:bg-amber-500/[0.14] transition-colors border border-amber-500/15" @click="$router.push('/dashboard-needs-you-preview')">Needs you</button>
        <button class="px-2 py-1.5 rounded-lg text-xs font-medium bg-orange-500/[0.08] text-orange-500/70 hover:bg-orange-500/[0.14] transition-colors border border-orange-500/10" @click="$router.push('/training')">Trainer</button>
      </div>
      <p v-if="simStatus" class="text-xs text-yellow-500/50">{{ simStatus }}</p>
    </div>
  </div>
</template>
