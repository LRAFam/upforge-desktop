<script setup lang="ts">
import { computed } from 'vue'
import { useDashboard } from '../../composables/useDashboard'
import { uiV3 } from '../../lib/ui-v3'

const {
  isDev,
  platform,
  profile,
  devOpen,
  simulating,
  simStatus,
  simulateGame,
} = useDashboard()

const showAdminTools = computed(() => profile.value?.user?.is_admin === true || profile.value?.user?.tier === 'admin')
</script>

<template>
  <section v-if="uiV3 && (showAdminTools || isDev || (platform && platform !== 'win32'))" class="dt3" aria-label="Developer tools">
    <button type="button" class="dt3-toggle" :aria-expanded="devOpen" @click="devOpen = !devOpen">
      <span class="uf-label">Dev tools</span>
      <span class="uf-t4">{{ devOpen ? 'Hide' : 'Show' }}</span>
    </button>
    <div v-if="devOpen" class="dt3-links">
      <button type="button" class="uf-link uf-t4" :disabled="simulating" @click="simulateGame('valorant', 8000)">{{ simulating ? 'Simulating…' : 'Simulate Valorant (8s)' }}</button>
      <button type="button" class="uf-link uf-t4" @click="$router.push('/post-game-preview')">Post-game</button>
      <button type="button" class="uf-link uf-t4" @click="$router.push('/dashboard-needs-you-preview')">Needs you</button>
      <button type="button" class="uf-link uf-t4" @click="$router.push({ path: '/onboarding', query: { preview: '1' } })">Preview onboarding</button>
      <button v-if="showAdminTools" type="button" class="uf-link uf-t4" @click="$router.push('/onboarding')">Test onboarding</button>
      <button type="button" class="uf-link uf-t4" @click="$router.push('/training')">Trainer</button>
      <button v-if="isDev" type="button" class="uf-link uf-t4" @click="$router.push('/dev/match-fixture')">Match page fixture</button>
    </div>
    <p v-if="devOpen && simStatus" class="uf-t4 dt3-status">{{ simStatus }}</p>
  </section>
  <div v-else-if="!uiV3 && (showAdminTools || isDev || (platform && platform !== 'win32'))" class="border border-dashed border-yellow-500/20 rounded-xl overflow-hidden flex-shrink-0">
    <button class="w-full flex items-center justify-between px-3 py-2 text-xs text-yellow-600/60 hover:text-yellow-500/70 transition-colors" @click="devOpen = !devOpen">
      <span class="font-semibold uppercase tracking-wider">Dev Tools</span>
      <svg class="w-3 h-3 transition-transform" :class="devOpen ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
    </button>
    <div v-if="devOpen" class="px-3 pb-3 space-y-2">
      <div class="flex gap-2">
        <button class="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-yellow-500/[0.08] text-yellow-500/70 hover:bg-yellow-500/[0.14] transition-colors border border-yellow-500/10" :disabled="simulating" @click="simulateGame('valorant', 8000)">{{ simulating ? 'Simulating...' : 'Simulate Valorant (8s)' }}</button>
        <button class="px-2 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] text-gray-500 hover:bg-white/[0.07] transition-colors border border-white/[0.09]" @click="$router.push('/post-game-preview')">Post-game</button>
        <button class="px-2 py-1.5 rounded-lg text-xs font-medium bg-amber-500/[0.08] text-amber-400/80 hover:bg-amber-500/[0.14] transition-colors border border-amber-500/15" @click="$router.push('/dashboard-needs-you-preview')">Needs you</button>
        <button class="px-2 py-1.5 rounded-lg text-xs font-medium bg-sky-500/[0.08] text-sky-400/80 hover:bg-sky-500/[0.14] transition-colors border border-sky-500/15" @click="$router.push({ path: '/onboarding', query: { preview: '1' } })">Preview onboarding</button>
        <button v-if="showAdminTools" class="px-2 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/[0.08] text-emerald-400/80 hover:bg-emerald-500/[0.14] transition-colors border border-emerald-500/15" @click="$router.push('/onboarding')">Test onboarding</button>
        <button class="px-2 py-1.5 rounded-lg text-xs font-medium bg-orange-500/[0.08] text-orange-500/70 hover:bg-orange-500/[0.14] transition-colors border border-orange-500/10" @click="$router.push('/training')">Trainer</button>
      </div>
      <p v-if="simStatus" class="text-xs text-yellow-500/50">{{ simStatus }}</p>
    </div>
  </div>
</template>

<style scoped>
/* UI v3: one quiet hairline row of links; dev/admin only. */
.dt3 { display: flex; flex-direction: column; gap: 10px; padding-top: 14px; border-top: 1px dashed var(--uf-line-2); }
.dt3-toggle { display: flex; justify-content: space-between; align-items: baseline; background: none; border: 0; padding: 0; color: var(--uf-faint); cursor: pointer; }
.dt3-toggle:hover .uf-t4 { color: var(--uf-bone); }
.dt3-links { display: flex; flex-wrap: wrap; gap: 8px 20px; }
.dt3-status { margin: 0; }
</style>
