<script setup lang="ts">
import { computed } from 'vue'
import { useDashboard } from '../../composables/useDashboard'
import { useGameTheme } from '../../composables/useGameTheme'

const { router, clipCount } = useDashboard()
const { features } = useGameTheme()

const links = computed(() => [
  { to: '/training', label: 'Aim training', show: features.value.aimTraining, icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a1 1 0 011 1v4.382l2.447 1.224a1 1 0 11-.894 1.788l-3-1.5A1 1 0 0110 11V7a1 1 0 011-1z' },
  { to: '/clips', label: 'Clips', show: true, badge: clipCount.value, icon: 'M3 7.5A2.25 2.25 0 015.25 5.25h2.379a1.5 1.5 0 001.06-.44l.621-.62a1.5 1.5 0 011.06-.44h3.26a1.5 1.5 0 011.06.44l.621.62a1.5 1.5 0 001.06.44h2.379A2.25 2.25 0 0121 7.5v9A2.25 2.25 0 0118.75 18.75H5.25A2.25 2.25 0 013 16.5v-9z M9 12a3 3 0 116 0 3 3 0 01-6 0z' },
  { to: '/stats', label: 'Stats', show: features.value.performanceStats, icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { to: '/history', label: 'History', show: true, icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
].filter(l => l.show))
</script>

<template>
  <div class="grid grid-cols-2 gap-1.5 flex-shrink-0">
    <button
      v-for="link in links"
      :key="link.to"
      type="button"
      class="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12] transition-colors text-left"
      @click="router.push(link.to)"
    >
      <svg class="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" :d="link.icon" />
      </svg>
      <span class="text-[11px] font-semibold text-gray-300 truncate">{{ link.label }}</span>
      <span v-if="link.badge" class="ml-auto text-[9px] font-bold tabular-nums text-gray-600">{{ link.badge }}</span>
    </button>
  </div>
</template>
